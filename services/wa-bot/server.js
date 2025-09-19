const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
require('dotenv').config();

const WhatsAppService = require('./whatsapp-service');
const APIClient = require('./api-client');

class WABotServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3001;
        this.whatsappService = null;
        this.apiClient = null;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWhatsApp();
    }

    setupMiddleware() {
        this.app.use(helmet());
        
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
        this.app.use(cors({
            origin: allowedOrigins,
            credentials: true
        }));

        const limiter = rateLimit({
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
            max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.'
            }
        });
        this.app.use('/api/', limiter);

        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });
    }

    setupRoutes() {
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                whatsappReady: this.whatsappService?.isReady || false,
                memory: process.memoryUsage(),
                version: require('./package.json').version
            });
        });

        this.app.get('/api/whatsapp/status', async (req, res) => {
            try {
                const info = await this.whatsappService?.getClientInfo();
                res.json({
                    ready: this.whatsappService?.isReady || false,
                    clientInfo: info,
                    activeChats: this.whatsappService?.activeChats.size || 0,
                    uptime: process.uptime()
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get WhatsApp status',
                    message: error.message
                });
            }
        });

        this.app.post('/api/whatsapp/send', async (req, res) => {
            try {
                const { phoneNumber, message } = req.body;

                if (!phoneNumber || !message) {
                    return res.status(400).json({
                        error: 'Missing required fields: phoneNumber and message'
                    });
                }

                if (!this.whatsappService?.isReady) {
                    return res.status(503).json({
                        error: 'WhatsApp service is not ready'
                    });
                }

                const success = await this.whatsappService.sendMessage(phoneNumber, message);
                
                if (success) {
                    res.json({
                        success: true,
                        message: 'Message sent successfully'
                    });
                } else {
                    res.status(500).json({
                        error: 'Failed to send message'
                    });
                }
            } catch (error) {
                console.error('Error in send message endpoint:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    message: error.message
                });
            }
        });

        // Webhook for receiving updates from main app (removed broadcast functionality)
        this.app.post('/api/webhook', (req, res) => {
            try {
                const { type, data } = req.body;
                
                console.log(`Webhook received: ${type}`);
                
                switch (type) {
                    case 'system_message':
                        this.handleSystemMessage(data);
                        break;
                    default:
                        console.warn(`Unknown webhook type: ${type}`);
                }

                res.json({ success: true });
            } catch (error) {
                console.error('Webhook error:', error);
                res.status(500).json({
                    error: 'Webhook processing failed',
                    message: error.message
                });
            }
        });

        this.app.get('/api/whatsapp/conversations', (req, res) => {
            try {
                const conversations = Array.from(this.whatsappService?.activeChats.entries() || []).map(([phoneNumber, data]) => ({
                    phoneNumber,
                    ...data
                }));

                res.json({
                    conversations,
                    total: conversations.length
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get conversations',
                    message: error.message
                });
            }
        });

        this.app.post('/api/whatsapp/restart', async (req, res) => {
            try {
                console.log('Restarting WhatsApp service...');
                
                if (this.whatsappService) {
                    await this.whatsappService.shutdown();
                }
                
                await this.setupWhatsApp();
                
                res.json({
                    success: true,
                    message: 'WhatsApp service restarted successfully'
                });
            } catch (error) {
                console.error('Failed to restart WhatsApp service:', error);
                res.status(500).json({
                    error: 'Failed to restart WhatsApp service',
                    message: error.message
                });
            }
        });

        this.app.post('/api/whatsapp/test', async (req, res) => {
            try {
                const { phoneNumber } = req.body;
                
                if (!phoneNumber) {
                    return res.status(400).json({
                        error: 'Phone number is required'
                    });
                }

                if (!this.whatsappService?.isReady) {
                    return res.status(503).json({
                        error: 'WhatsApp service is not ready'
                    });
                }

                const success = await this.whatsappService.testSelfMessaging(phoneNumber);
                
                res.json({
                    success,
                    message: success ? 'Test message sent successfully' : 'Test failed'
                });
            } catch (error) {
                console.error('❌ Error in test endpoint:', error);
                res.status(500).json({
                    error: 'Test failed',
                    message: error.message
                });
            }
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                path: req.originalUrl,
                method: req.method
            });
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            console.error('❌ Express error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });
    }

    async setupWhatsApp() {
        try {
            this.apiClient = new APIClient(
                process.env.MAIN_APP_URL || 'http://localhost:3000',
                process.env.MAIN_APP_API_KEY || 'default-key'
            );

            this.whatsappService = new WhatsAppService({
                sessionPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp-session',
                puppeteerArgs: (process.env.WHATSAPP_PUPPETEER_ARGS || '--no-sandbox,--disable-setuid-sandbox').split(',')
            });

            this.setupWhatsAppHandlers();

            await this.whatsappService.initialize();

        } catch (error) {
            console.error('Failed to setup WhatsApp service:', error);
            throw error;
        }
    }

    setupWhatsAppHandlers() {
        this.whatsappService.on('qr', (qr) => {
            console.log('QR Code generated for WhatsApp authentication');
        });

        this.whatsappService.on('ready', () => {
            console.log('WhatsApp service is ready and connected');
        });

        this.whatsappService.on('auth_failure', (msg) => {
            console.error('WhatsApp authentication failed:', msg);
        });

        this.whatsappService.on('disconnected', (reason) => {
            console.log('WhatsApp disconnected:', reason);
            
            setTimeout(() => {
                console.log('Attempting to reconnect WhatsApp...');
                this.setupWhatsApp().catch(error => {
                    console.error('Failed to reconnect WhatsApp:', error);
                });
            }, 30000);
        });

        this.whatsappService.on('ask', async (data) => {
            await this.handleAskRequest(data);
        });

        this.whatsappService.on('message', (messageData) => {
            const messageType = messageData.fromMe ? '🤖 Bot' : '👤 User';
            console.log(`${messageType} message: ${messageData.fromName} - ${messageData.body.substring(0, 50)}...`);
        });
    }

    async handleAskRequest(data) {
        const { chat, phoneNumber, userName, question, startTime, respondCallback } = data;
        
        try {
            console.log(`Processing AI request for ${userName}: ${question}`);

            const response = await this.apiClient.sendChatRequest(question, {
                source: 'whatsapp',
                phoneNumber,
                userName
            });

            const processingTimeMs = startTime ? Date.now() - startTime : null;
            console.log(`Total processing time: ${processingTimeMs}ms`);

            if (respondCallback) {
                await respondCallback(response.text, startTime);
            }

        } catch (error) {
            console.error('Failed to process AI request:', error);
            
            if (respondCallback) {
                await respondCallback('sorry, i encountered an error processing your request. please try again.', startTime);
            }
        }
    }

    async handleSystemMessage(data) {
        console.log('System message received:', data);
        // Handle individual system notifications only
    }

    async start() {
        try {
            this.app.listen(this.port, () => {
                console.log(`WhatsApp Bot Server running on port ${this.port}`);
                console.log(`Health check: http://localhost:${this.port}/health`);
                console.log(`WhatsApp status: http://localhost:${this.port}/api/whatsapp/status`);
            });

            process.on('SIGINT', () => this.shutdown());
            process.on('SIGTERM', () => this.shutdown());

        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        console.log('Shutting down WhatsApp Bot Server...');
        
        try {
            if (this.whatsappService) {
                await this.whatsappService.shutdown();
            }
            
            console.log('Server shutdown complete');
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const server = new WABotServer();
    server.start().catch(error => {
        console.error('Failed to start WhatsApp Bot Server:', error);
        process.exit(1);
    });
}

module.exports = WABotServer;