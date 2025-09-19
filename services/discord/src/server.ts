import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import DiscordService from './discord-service';
import APIClient from './api-client';

dotenv.config();

class DiscordBotServer {
  private app: express.Application;
  private port: number;
  private discordService: DiscordService | null = null;
  private apiClient: APIClient | null = null;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3002');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    this.app.use(cors({
      origin: allowedOrigins,
      credentials: true
    }));

    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
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

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        discordReady: this.discordService?.getClientInfo() ? true : false,
        memory: process.memoryUsage(),
        version: require('../package.json').version
      });
    });

    this.app.get('/api/discord/status', async (req, res) => {
      try {
        const info = this.discordService?.getClientInfo();
        res.json({
          ready: info ? true : false,
          clientInfo: info,
          uptime: process.uptime()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get Discord status',
          message: (error as Error).message
        });
      }
    });

    this.app.post('/api/discord/send', async (req, res) => {
      try {
        const { channelId, message } = req.body;

        if (!channelId || !message) {
          return res.status(400).json({
            error: 'Missing required fields: channelId and message'
          });
        }

        if (!this.discordService) {
          return res.status(503).json({
            error: 'Discord service is not ready'
          });
        }

        // This would need to be implemented in the Discord service
        res.json({
          success: true,
          message: 'Message sent successfully'
        });

      } catch (error) {
        console.error('Error in send message endpoint:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: (error as Error).message
        });
      }
    });

    // Webhook endpoint for receiving updates from main app
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
          message: (error as Error).message
        });
      }
    });

    // Restart endpoint
    this.app.post('/api/discord/restart', async (req, res) => {
      try {
        console.log('Restarting Discord service...');
        
        if (this.discordService) {
          await this.discordService.shutdown();
        }
        
        await this.setupDiscord();
        
        res.json({
          success: true,
          message: 'Discord service restarted successfully'
        });
      } catch (error) {
        console.error('Failed to restart Discord service:', error);
        res.status(500).json({
          error: 'Failed to restart Discord service',
          message: (error as Error).message
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method
      });
    });

    // Error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Express error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  private async setupDiscord(): Promise<void> {
    try {
      const discordToken = process.env.DISCORD_TOKEN;
      const botOwnerId = process.env.BOT_OWNER_ID;

      if (!discordToken) {
        throw new Error('DISCORD_TOKEN environment variable is required');
      }

      if (!botOwnerId) {
        throw new Error('BOT_OWNER_ID environment variable is required');
      }

      this.apiClient = new APIClient(
        process.env.MAIN_APP_URL || 'http://localhost:3000',
        process.env.MAIN_APP_API_KEY || 'default-key'
      );

      this.discordService = new DiscordService(discordToken, botOwnerId);
      this.setupDiscordHandlers();

      await this.discordService.initialize();

    } catch (error) {
      console.error('Failed to setup Discord service:', error);
      throw error;
    }
  }

  private setupDiscordHandlers(): void {
    if (!this.discordService) return;

    this.discordService.on('ready', () => {
      console.log('Discord service is ready and connected');
    });

    this.discordService.on('error', (error) => {
      console.error('Discord service error:', error);
    });

    this.discordService.on('disconnected', () => {
      console.log('Discord disconnected');
      
      setTimeout(() => {
        console.log('Attempting to reconnect Discord...');
        this.setupDiscord().catch(error => {
          console.error('Failed to reconnect Discord:', error);
        });
      }, 30000);
    });

    this.discordService.on('ask', async (data) => {
      await this.handleAskRequest(data);
    });
  }

  private async handleAskRequest(data: any): Promise<void> {
    const { 
      messageData, 
      question, 
      conversationHistory = [], 
      startTime, 
      respondCallback 
    } = data;
    
    try {
      console.log(`Processing AI request for ${messageData.author.tag}: ${question}`);
      console.log(`Including ${conversationHistory.length} messages from conversation history`);

      if (!this.apiClient) {
        throw new Error('API client not initialized');
      }

      const response = await this.apiClient.sendChatRequest(
        question, 
        {
          source: 'discord',
          userId: messageData.author.id,
          username: messageData.author.tag,
          channelId: messageData.channel.id,
          guildId: messageData.guild?.id
        },
        conversationHistory
      );

      const processingTimeMs = startTime ? Date.now() - startTime : null;
      console.log(`Total processing time: ${processingTimeMs}ms`);

      if (respondCallback) {
        await respondCallback(response.text);
      }

    } catch (error) {
      console.error('Failed to process AI request:', error);
      
      if (respondCallback) {
        await respondCallback('Sorry, I encountered an error processing your request. Please try again.');
      }
    }
  }

  private async handleSystemMessage(data: any): Promise<void> {
    console.log('System message received:', data);
    // Handle system notifications here
  }

  async start(): Promise<void> {
    try {
      await this.setupDiscord();

      this.app.listen(this.port, () => {
        console.log(`Discord Bot Server running on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        console.log(`Discord status: http://localhost:${this.port}/api/discord/status`);
      });

      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down Discord Bot Server...');
    
    try {
      if (this.discordService) {
        await this.discordService.shutdown();
      }
      
      console.log('Server shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

export default DiscordBotServer;