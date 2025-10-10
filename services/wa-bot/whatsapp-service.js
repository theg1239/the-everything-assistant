const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const EventEmitter = require('events');

class WhatsAppService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.client = null;
        this.isReady = false;
        this.options = {
            sessionPath: options.sessionPath || './whatsapp-session',
            puppeteerArgs: options.puppeteerArgs || ['--no-sandbox', '--disable-setuid-sandbox'],
            ...options
        };
        this.activeChats = new Map(); // Track active conversations
        this.messageQueue = new Map(); // Queue messages for users
        this.rateLimits = new Map(); // Rate limiting per user
        this.recentBotMessages = new Set(); // Track recent bot messages to prevent loops
        this.conversationContext = new Map(); // Store recent conversation history per user
        this.contextConfig = {
            maxMessages: 10, // Keep last 10 messages per user
            maxAge: 30 * 60 * 1000, // 30 minutes in milliseconds
            cleanupInterval: 5 * 60 * 1000 // Cleanup every 5 minutes
        };
    }

    /**
     * Get Chrome executable path, preferring system Chrome over bundled Chromium
     */
    getChromePath() {
        const fs = require('fs');
        const chromePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
            'google-chrome',
            'chromium'
        ];
        
        for (const path of chromePaths) {
            try {
                if (path.startsWith('/') && fs.existsSync(path)) {
                    console.log(`🌐 Using Chrome at: ${path}`);
                    return path;
                }
            } catch (error) {
                // Continue to next path
            }
        }
        
        console.log('🌐 Using default Puppeteer Chromium');
        return undefined; // Let Puppeteer use its bundled Chromium
    }

    /**
     * Initialize WhatsApp client
     */
    async initialize() {
        try {
            console.log('🚀 Initializing WhatsApp client...');
            
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: 'wa-bot-client',
                    dataPath: this.options.sessionPath
                }),
                puppeteer: {
                    headless: true,
                    args: this.options.puppeteerArgs,
                    executablePath: this.getChromePath(),
                    timeout: 60000, // Increase timeout
                    handleSIGINT: false,
                    handleSIGTERM: false,
                    handleSIGHUP: false
                },
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
                }
            });

            this.setupEventHandlers();
            await this.client.initialize();
            
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp client:', error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Add a message to conversation context
     */
    addToContext(phoneNumber, message, isBot = false) {
        if (!this.conversationContext.has(phoneNumber)) {
            this.conversationContext.set(phoneNumber, []);
        }
        
        const context = this.conversationContext.get(phoneNumber);
        const timestamp = Date.now();
        
        context.push({
            content: message,
            timestamp,
            isBot,
            role: isBot ? 'assistant' : 'user'
        });
        
        // Keep only the most recent messages
        while (context.length > this.contextConfig.maxMessages) {
            context.shift();
        }
        
        this.conversationContext.set(phoneNumber, context);
    }

    /**
     * Get conversation context for a user
     */
    getContext(phoneNumber) {
        if (!this.conversationContext.has(phoneNumber)) {
            return [];
        }
        
        const context = this.conversationContext.get(phoneNumber);
        const now = Date.now();
        
        // Filter out messages older than maxAge
        const validContext = context.filter(msg => 
            (now - msg.timestamp) < this.contextConfig.maxAge
        );
        
        // Update stored context to remove old messages
        this.conversationContext.set(phoneNumber, validContext);
        
        return validContext;
    }

    /**
     * Clear context for a user
     */
    clearContext(phoneNumber) {
        this.conversationContext.delete(phoneNumber);
    }

    /**
     * Cleanup old conversation contexts
     */
    cleanupContexts() {
        const now = Date.now();
        for (const [phoneNumber, context] of this.conversationContext.entries()) {
            const validMessages = context.filter(msg => 
                (now - msg.timestamp) < this.contextConfig.maxAge
            );
            
            if (validMessages.length === 0) {
                this.conversationContext.delete(phoneNumber);
            } else if (validMessages.length !== context.length) {
                this.conversationContext.set(phoneNumber, validMessages);
            }
        }
    }

    /**
     * Start context cleanup interval
     */
    startContextCleanup() {
        setInterval(() => {
            this.cleanupContexts();
        }, this.contextConfig.cleanupInterval);
    }

    /**
     * Setup event handlers for WhatsApp client
     */
    setupEventHandlers() {
        // QR Code generation
        this.client.on('qr', (qr) => {
            console.log('📱 Scan the QR code below to connect WhatsApp:');
            qrcode.generate(qr, { small: true });
            this.emit('qr', qr);
        });

        // Client ready
        this.client.on('ready', () => {
            console.log('✅ WhatsApp client is ready!');
            console.log('📱 Client info:', this.client.info);
            this.isReady = true;
            this.startContextCleanup(); // Start conversation context cleanup
            this.emit('ready');
        });

        // Authentication success
        this.client.on('authenticated', () => {
            console.log('🔐 WhatsApp client authenticated successfully');
            this.emit('authenticated');
        });

        // Authentication failure
        this.client.on('auth_failure', (msg) => {
            console.error('❌ WhatsApp authentication failed:', msg);
            this.emit('auth_failure', msg);
        });

        // Disconnection
        this.client.on('disconnected', (reason) => {
            console.log('🔌 WhatsApp client disconnected:', reason);
            this.isReady = false;
            this.emit('disconnected', reason);
        });

        // Incoming messages
        this.client.on('message', async (message) => {
            try {
                console.log(`🔍 Raw message received:`, {
                    fromMe: message.fromMe,
                    body: message.body,
                    from: message.from,
                    to: message.to,
                    author: message.author,
                    deviceType: message.deviceType,
                    hasMedia: message.hasMedia,
                    isStatus: message.isStatus,
                    isGif: message.isGif
                });
                await this.handleIncomingMessage(message);
            } catch (error) {
                console.error('❌ Error handling incoming message:', error);
            }
        });

        // Message creation (catches ALL messages including ones you send)
        this.client.on('message_create', async (message) => {
            try {
                console.log(`🔍 Message created:`, {
                    fromMe: message.fromMe,
                    body: message.body,
                    from: message.from,
                    to: message.to,
                    author: message.author,
                    deviceType: message.deviceType
                });
                
                // Only process if it's your own message and it's a command
                if (message.fromMe && message.body.startsWith('!')) {
                    console.log('🎯 Processing your own command via message_create');
                    await this.handleIncomingMessage(message);
                }
            } catch (error) {
                console.error('❌ Error handling message_create:', error);
            }
        });

        // Message acknowledgment
        this.client.on('message_ack', (msg, ack) => {
            this.emit('message_ack', msg, ack);
        });

        // Group join/leave events
        this.client.on('group_join', (notification) => {
            console.log('👥 Group join:', notification);
        });

        this.client.on('group_leave', (notification) => {
            console.log('👋 Group leave:', notification);
        });

        // Message revoked (deleted)
        this.client.on('message_revoke_everyone', (after, before) => {
            console.log('🗑️ Message deleted for everyone');
        });

        // Message revoked for me
        this.client.on('message_revoke_me', (message) => {
            console.log('🗑️ Message deleted for me');
        });

        // Catch any other message events
        this.client.on('change_state', (state) => {
            console.log('🔄 Client state changed:', state);
        });
    }

    /**
     * Normalize contact identifiers, handling Linked Device (LID) suffixes used in communities.
     */
    getNormalizedContactId(message) {
        if (!message) {
            return null;
        }

        const candidate = message.author || message.from || message.to || (message.id && message.id.participant);

        if (!candidate) {
            return null;
        }

        if (candidate.endsWith('@lid')) {
            const [rawId] = candidate.split('@');
            if (!rawId) {
                return null;
            }
            const [baseId] = rawId.split(':');
            if (!baseId) {
                return null;
            }
            return `${baseId}@c.us`;
        }

        return candidate;
    }

    /**
     * Extract the contact/user portion from a WhatsApp identifier.
     */
    extractUserFromId(contactId) {
        if (!contactId) {
            return null;
        }

        const [userPart] = contactId.split('@');
        if (!userPart) {
            return null;
        }

        const [sanitizedUser] = userPart.split(':');
        return sanitizedUser || null;
    }

    /**
     * Build minimal contact information when WhatsApp does not expose full contact details.
     */
    buildFallbackContact(message, normalizedId) {
        if (message && message.fromMe && this.client?.info?.wid) {
            const { wid, pushname } = this.client.info;
            const user = wid?.user || this.extractUserFromId(normalizedId);
            const displayName = pushname || user || 'me';

            return {
                id: wid,
                number: user,
                user,
                pushname: displayName,
                name: displayName,
                userid: user
            };
        }

        if (!normalizedId) {
            return null;
        }

        const user = this.extractUserFromId(normalizedId);
        if (!user) {
            return null;
        }

        const [, server] = normalizedId.split('@');

        return {
            id: {
                _serialized: normalizedId,
                user,
                server
            },
            number: user,
            user,
            pushname: user,
            name: user,
            userid: user
        };
    }

    /**
     * Resolve the contact for a message, adding fallbacks for community (LID) identifiers.
     */
    async resolveContact(message, normalizedId = null) {
        if (!normalizedId) {
            normalizedId = this.getNormalizedContactId(message);
        }

        if (message?.fromMe) {
            const fallbackContact = this.buildFallbackContact(message, normalizedId);
            if (fallbackContact) {
                return fallbackContact;
            }
        }

        try {
            return await message.getContact();
        } catch (error) {
            console.warn('⚠️ Failed to get contact via message.getContact', {
                messageId: message?.id?._serialized,
                rawAuthor: message?.author,
                rawFrom: message?.from,
                rawTo: message?.to,
                error: error?.message
            });
        }

        if (normalizedId) {
            try {
                return await this.resolveContactById(normalizedId);
            } catch (fallbackError) {
                console.warn('⚠️ Fallback contact lookup failed', {
                    normalizedId,
                    error: fallbackError?.message
                });
            }
        }

        return this.buildFallbackContact(message, normalizedId);
    }

    /**
     * Resolve a contact directly via the WhatsApp client by ID, normalizing LID identifiers.
     */
    async resolveContactById(contactId) {
        if (!contactId || !this.client) {
            return null;
        }

        const candidateId = typeof contactId === 'string'
            ? contactId
            : (contactId?._serialized || contactId?.id);

        if (!candidateId) {
            return null;
        }

        const normalizedId = candidateId.endsWith('@lid')
            ? this.getNormalizedContactId({ author: candidateId })
            : candidateId;

        if (!normalizedId) {
            return null;
        }

        const rawContact = await this.client.getContactById(normalizedId);
        if (!rawContact) {
            return null;
        }

        const contact = Array.isArray(rawContact) ? rawContact[0] : rawContact;
        if (contact && !contact.id) {
            contact.id = {
                _serialized: normalizedId,
                user: this.extractUserFromId(normalizedId),
                server: normalizedId.split('@')[1]
            };
        }

        return contact;
    }

    /**
     * Parse arguments for the !context command, extracting optional limit and question.
     */
    parseContextCommandArgs(rawArgs) {
        if (!rawArgs) {
            return { question: '', limit: null };
        }

        let working = rawArgs.trim();
        if (!working) {
            return { question: '', limit: null };
        }

        let limit = null;

        // Support "limit=500" or "limit:500" anywhere in the string
        const limitRegex = /\blimit\s*[:=]\s*(\d+)\b/i;
        const labeledMatch = working.match(limitRegex);
        if (labeledMatch) {
            limit = parseInt(labeledMatch[1], 10);
            working = (working.slice(0, labeledMatch.index) + working.slice(labeledMatch.index + labeledMatch[0].length)).trim();
        } else {
            // Support "limit 500 ..." syntax
            const limitWordMatch = working.match(/^limit\s+(\d+)(?:\s+(.*))?$/i);
            if (limitWordMatch) {
                limit = parseInt(limitWordMatch[1], 10);
                working = (limitWordMatch[2] || '').trim();
            } else {
                // Support leading numeric value e.g., "500 summarize the chat"
                const leadingMatch = working.match(/^(\d+)(?:\s+(.*))?$/);
                if (leadingMatch) {
                    limit = parseInt(leadingMatch[1], 10);
                    working = (leadingMatch[2] || '').trim();
                }
            }
        }

        if (Number.isNaN(limit) || limit <= 0) {
            limit = null;
        }

        return {
            question: working,
            limit
        };
    }

    /**
     * Fetch chat history in batches until the desired size is reached.
     */
    async fetchAllChatMessages(chat, options = {}) {
        const {
            batchSize = 200,
            maxMessages = 800
        } = options;

        const messages = [];
        const seenMessageIds = new Set();
        let remaining = Math.max(maxMessages, 0);
        let cursor = null;

        while (remaining > 0) {
            const limit = Math.min(batchSize, remaining);
            const fetchOptions = { limit };
            if (cursor) {
                fetchOptions.before = cursor;
            }

            // Fetch a batch of messages
            const batch = await chat.fetchMessages(fetchOptions);
            if (!batch || batch.length === 0) {
                break;
            }

            for (const message of batch) {
                const serializedId = message?.id?._serialized;
                if (serializedId && seenMessageIds.has(serializedId)) {
                    continue;
                }

                messages.push(message);
                if (serializedId) {
                    seenMessageIds.add(serializedId);
                }

                remaining -= 1;
                if (remaining <= 0) {
                    break;
                }
            }

            if (batch.length < limit || remaining <= 0) {
                break;
            }

            cursor = batch[batch.length - 1];
        }

        return messages;
    }

    /**
     * Handle incoming WhatsApp messages
     * 
     * This method processes ALL messages, including:
     * - User messages (for commands and logging)
     * - Bot's own messages (for logging and potential self-interaction)
     * - Group messages (if group support is enabled)
     * 
     * Rate limiting is only applied to non-bot messages to prevent
     * the bot from rate limiting itself.
     */
    async handleIncomingMessage(message) {
        // Skip if not ready or if message is from status broadcast
        if (!this.isReady || message.isStatus) {
            return;
        }

        try {
            const normalizedContactId = this.getNormalizedContactId(message);
            const contact = await this.resolveContact(message, normalizedContactId);
            const chat = await message.getChat();
            const messageBody = (message.body || '').trim();

            const selfNumber = this.client?.info?.wid?.user;
            const contactNumber = message.fromMe
                ? (selfNumber || contact?.id?.user || this.extractUserFromId(normalizedContactId) || 'unknown')
                : (contact?.id?.user ||
                    contact?.userid ||
                    this.extractUserFromId(normalizedContactId) ||
                    message.author ||
                    message.from ||
                    'unknown');

            const contactName = contact?.name ||
                contact?.pushname ||
                (message.fromMe && this.client?.info?.pushname) ||
                contactNumber;

            // Debug logging
            console.log(`🔍 Debug - Message details:`, {
                fromMe: message.fromMe,
                body: messageBody.substring(0, 50),
                messageId: message.id?._serialized || 'unknown',
                contactNumber,
                contactName,
                isCommand: messageBody.startsWith('!')
            });

        // Don't skip self messages - we want to process all messages including our own responses
        // This ensures proper logging and potential self-interaction features
        const messageType = message.fromMe ? '🤖 Self' : '👤 User';
        console.log(`📨 ${messageType} message from ${contactName}: ${messageBody}`);

        // Check rate limiting (but don't rate limit self messages)
        if (!message.fromMe && this.isRateLimited(contactNumber)) {
            console.log(`🚫 Rate limited user: ${contactNumber}`);
            return;
        }

        // Update rate limiting (but only for non-self messages)
        if (!message.fromMe) {
            this.updateRateLimit(contactNumber);
        }

        // Process the message
        const messageData = {
            id: message.id._serialized,
            from: contactNumber,
            fromName: contactName,
            body: messageBody,
            timestamp: message.timestamp,
            isGroup: chat.isGroup,
            chatId: chat.id._serialized,
            chatName: chat.name,
            hasMedia: message.hasMedia,
            messageType: message.type,
            fromMe: message.fromMe // Track if message is from the bot itself
        };

        // Store only command messages and bot responses in conversation context
        if (!message.isStatus && messageBody && messageBody.trim().length > 0) {
            // Only store messages that are:
            // 1. Commands (start with !)
            // 2. Bot responses (fromMe = true)
            const isCommand = messageBody.startsWith('!');
            const isBotResponse = message.fromMe;
            
            if (isCommand || isBotResponse) {
                // For group messages, use individual user number; for DMs, use chat ID
                const contextKey = chat.isGroup ? contactNumber : chat.id._serialized;
                this.addToContext(contextKey, messageBody, message.fromMe);
                
                const messageType = isCommand ? 'command' : 'bot response';
                console.log(`💾 Stored ${messageType} in context for ${contextKey}: "${messageBody.substring(0, 50)}..."`);
            }
        }

        // Emit message event for external handling
        this.emit('message', messageData);

        // Handle commands - allow commands from users AND from self (for testing)
        // But prevent bot from responding to its own automated responses
        if (messageBody.startsWith('!')) {
            // Check if this might be the bot's own automated response
            const isBotResponse = message.fromMe && (
                messageBody.includes('*The Everything Assistant*') ||
                messageBody.includes('📄 *Part') ||
                messageBody.includes('Bot Status') ||
                messageBody.includes('Available Commands') ||
                this.recentBotMessages.has(message.id._serialized)
            );
            
            if (!isBotResponse) {
                console.log(`🎯 Processing command from ${messageType}: ${messageBody}`);
                await this.handleCommand(messageData, message);
            } else {
                console.log(`🚫 Skipping bot's own response: ${messageBody.substring(0, 50)}...`);
            }
        }
        } catch (error) {
            console.error('❌ Error handling incoming message:', error);
            // Continue processing despite the error
        }
    }

    /**
     * Handle bot commands
     */
    async handleCommand(messageData, originalMessage) {
        const { body, from, fromName, chatId, isGroup } = messageData;
        const command = body.toLowerCase().split(' ')[0];
        const args = body.slice(command.length).trim();
        const botOwnerNumber = '917975100121'; // Your phone number
        const isBotOwner = messageData.fromMe || from === botOwnerNumber;

        console.log(`🤖 Processing command: ${command} from ${fromName}`);

        // Get both the original chat and user's personal chat
        const originalChat = await originalMessage.getChat();
        const userChat = await this.getUserPersonalChat(from);
        
        if (!userChat) {
            console.error(`❌ Could not get personal chat for ${from}`);
            return;
        }

        switch (command) {
            case '!ask':
                if (!args) {
                    // Short response - send in current chat
                    await this.sendMessageToChat(originalChat, 'please provide a question after !ask\n\nexample: !ask what is the mess menu today?');
                    return;
                }
                // Pass both chats to handleAskCommand for smart routing
                await this.handleAskCommand(originalChat, userChat, from, fromName, args, messageData);
                break;

            case '!context':
                // Analyze chat context from recent messages - available to all users
                const { question, limit } = this.parseContextCommandArgs(args);
                const questionText = question || 'what has been happening in this chat recently?';
                await this.handleContextCommand(originalChat, userChat, from, fromName, questionText, messageData, { limit });
                break;

            case '!help':
                // Help is moderately long - always send to DM with notification
                if (isGroup) {
                    await this.sendMessageToChat(originalChat, `sent help info to ${fromName} in dm`);
                }
                await this.sendHelpMessage(userChat);
                break;

            case '!status':
                // Status is short - send in current chat
                await this.sendStatusMessage(originalChat);
                break;

            case '!everyone':
                // Manual @everyone tag - only works in groups and only for bot owner
                if (!isGroup) {
                    await this.sendMessageToChat(originalChat, 'the !everyone command only works in group chats');
                } else if (from !== botOwnerNumber) {
                    await this.sendMessageToChat(originalChat, 'only the bot owner can use the !everyone command');
                } else {
                    const message = args || 'hey everyone! 👋';
                    const taggedMessage = await this.formatResponseWithTags(message, originalChat, true);
                    await this.sendMessageToChat(originalChat, taggedMessage);
                }
                break;

            default:
                // Error messages are short - send in current chat
                await this.sendMessageToChat(originalChat, `unknown command: ${command}\n\ntype !help to see available commands`);
                break;
        }
    }

    /**
     * Handle !ask command - main AI interaction with smart routing
     */
    async handleAskCommand(originalChat, userChat, phoneNumber, userName, question, messageData) {
        try {
            console.log(`🧠 Processing AI request from ${userName}: ${question}`);
            
            // Get conversation context for this user
            const contextKey = messageData.isGroup ? phoneNumber : originalChat.id._serialized;
            const conversationHistory = this.getContext(contextKey);
            
            console.log(`📚 Found ${conversationHistory.length} messages in conversation history for ${userName}`);
            
            const vtopKeywords = ['vtop', 'grades', 'attendance', 'timetable', 'marks', 'schedule', 'exam', 'faculty', 'course'];
            const isVtopQuery = vtopKeywords.some(keyword => 
                question.toLowerCase().includes(keyword)
            );
            
            if (isVtopQuery) {
                const vtopMessage = `for vtop features like checking grades, attendance, timetable, and other academic information, please use the web interface at:\n\nhttps://the-everything-assistant.vercel.app\n\nthe website provides full access to all vtop features with a better user experience for academic data.`;
                // VTOP messages are medium length - send to DM if in group, otherwise current chat
                const targetChat = messageData.isGroup ? userChat : originalChat;
                if (messageData.isGroup) {
                    await this.sendMessageToChat(originalChat, `sent vtop info to ${userName} in dm`);
                }
                await this.sendMessageToChat(targetChat, vtopMessage);
                return;
            }
            
            await this.sendTypingToChat(originalChat);

            const startTime = Date.now();

            this.emit('ask', {
                originalChat,
                userChat,
                phoneNumber,
                userName,
                question,
                messageData,
                startTime,
                conversationHistory, // Include conversation context
                respondCallback: (response) => this.handleAIResponseSmart(originalChat, userChat, response, startTime, messageData)
            });

        } catch (error) {
            console.error('❌ Error in handleAskCommand:', error);
            await this.sendMessageToChat(originalChat, 'sorry, i encountered an error processing your request. please try again.');
        }
    }

    /**
     * Handle !context command - analyze chat history
     */
    async handleContextCommand(originalChat, userChat, phoneNumber, userName, question, messageData, options = {}) {
        try {
            const trimmedQuestion = (question || '').trim();
            const questionText = trimmedQuestion || 'what has been happening in this chat recently?';
            const limitOverride = options?.limit ?? null;

            let sanitizedLimit = null;
            if (limitOverride !== null && Number.isFinite(limitOverride) && !Number.isNaN(limitOverride)) {
                sanitizedLimit = Math.min(Math.max(Math.floor(limitOverride), 20), 2000);
            } else if (limitOverride !== null) {
                console.warn('⚠️ Invalid limit override provided for !context, ignoring.', { limitOverride });
            }

            console.log(`📚 Processing context request from ${userName}: ${questionText}`, {
                limitOverride: sanitizedLimit
            });
            
            await this.sendTypingToChat(originalChat);
            
            // Determine how many messages to fetch
            const defaultLimit = 150;
            const extendedLimit = 800;
            const historyLimit = sanitizedLimit || (trimmedQuestion ? extendedLimit : defaultLimit);
            const fetchAll = historyLimit > defaultLimit;
            const maxAgeDays = sanitizedLimit !== null ? null : (trimmedQuestion ? null : 7);

            const recentMessages = await this.getChatHistory(originalChat, historyLimit, {
                fetchAll,
                maxMessages: historyLimit,
                maxAgeDays
            });
            
            if (recentMessages.length === 0) {
                await this.sendMessageToChat(originalChat, 'no recent messages found in this chat to analyze.');
                return;
            }
            
            // Format the chat history for AI analysis
            const contextText = this.formatChatHistoryForAI(recentMessages);
            
            // Create a comprehensive prompt for AI analysis
            const analysisPrompt = `You are analyzing a WhatsApp chat history to answer the user's question.

Question: "${questionText}"

Chat History (last ${recentMessages.length} messages):
${contextText}

Please provide a helpful summary and answer based on the chat context. Focus on:
- Recent topics and discussions
- Important information or decisions
- Any ongoing conversations or plans
- Answer the specific question asked

Keep the response concise but informative.`;

            const startTime = Date.now();

            this.emit('ask', {
                originalChat,
                userChat,
                phoneNumber,
                userName,
                question: analysisPrompt,
                messageData: { ...messageData, isContextAnalysis: true, contextLimit: historyLimit },
                startTime,
                conversationHistory: [], // Don't include previous context for this analysis
                respondCallback: (response) => this.handleAIResponseSmart(originalChat, userChat, response, startTime, messageData)
            });

        } catch (error) {
            console.error('❌ Error in handleContextCommand:', error);
            await this.sendMessageToChat(originalChat, 'sorry, i encountered an error analyzing the chat context. please try again.');
        }
    }

    /**
     * Get recent chat history
     */
    async getChatHistory(chat, limit = 100, options = {}) {
        try {
            const {
                fetchAll = false,
                maxMessages = limit,
                maxAgeDays = 7
            } = options;

            const maxCount = Math.max(maxMessages || limit || 100, 1);

            console.log(`📖 Fetching chat history for ${chat.name || chat.id.user}`, {
                fetchAll,
                requestedLimit: limit,
                maxMessages: maxCount,
                maxAgeDays
            });

            let messages;
            if (fetchAll) {
                messages = await this.fetchAllChatMessages(chat, {
                    maxMessages: maxCount
                });
            } else {
                messages = await chat.fetchMessages({ limit: maxCount });
            }

            if (!messages || messages.length === 0) {
                return [];
            }

            // Ensure chronological order (oldest first)
            const chronologicalMessages = messages.slice().reverse();

            const processedMessages = [];
            for (const message of chronologicalMessages) {
                if (message.isStatus || message.type === 'notification') {
                    continue;
                }

                const timestamp = new Date(message.timestamp * 1000);
                if (typeof maxAgeDays === 'number' && maxAgeDays >= 0) {
                    const daysSinceMessage = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceMessage > maxAgeDays) {
                        continue;
                    }
                }

                let messageText = message.body || '';
                if (message.hasMedia) {
                    const mediaType = message.type;
                    messageText = `[${mediaType}${messageText ? ': ' + messageText : ''}]`;
                } else if (message.type === 'location') {
                    messageText = '[Location shared]';
                } else if (message.type === 'vcard') {
                    messageText = '[Contact shared]';
                }

                if (!messageText.trim()) {
                    continue;
                }

                const normalizedId = this.getNormalizedContactId(message);
                const contact = await this.resolveContact(message, normalizedId);
                const senderNumber = contact?.id?.user ||
                    contact?.userid ||
                    this.extractUserFromId(normalizedId) ||
                    message.from ||
                    'unknown';
                const senderName = contact?.pushname ||
                    contact?.name ||
                    (message.fromMe ? (this.client?.info?.pushname || 'Bot') : senderNumber);

                processedMessages.push({
                    sender: senderName,
                    senderNumber,
                    text: messageText,
                    timestamp: timestamp.toLocaleString(),
                    isFromMe: message.fromMe
                });

                if (processedMessages.length >= maxCount) {
                    break;
                }
            }

            if (processedMessages.length === 0) {
                return [];
            }

            console.log(`📊 Retrieved ${processedMessages.length} messages for context analysis`);
            return processedMessages;

        } catch (error) {
            console.error('Failed to fetch chat history:', error);
            return [];
        }
    }

    /**
     * Format chat history for AI analysis
     */
    formatChatHistoryForAI(messages) {
        if (!messages || messages.length === 0) {
            return 'No messages found.';
        }
        
        const formatted = messages.map(msg => {
            const senderName = msg.isFromMe ? 'Bot' : msg.sender;
            return `[${msg.timestamp}] ${senderName}: ${msg.text}`;
        }).join('\n');
        
        return formatted;
    }

    /**
     * Handle AI response with smart routing based on response length
     */
    async handleAIResponseSmart(originalChat, userChat, response, startTime, messageData) {
        try {
            const endTime = Date.now();
            const duration = endTime - startTime;
            const botOwnerNumber = '917975100121'; // Your phone number
            
            console.log(`✅ AI Response ready in ${duration}ms`);
            
            if (!response || response.trim() === '') {
                console.warn('⚠️ Empty response received from AI');
                await this.sendMessageToChat(originalChat, 'sorry, i couldn\'t generate a response. please try asking again.');
                return;
            }
            
            // Check if response should trigger @everyone tags
            const shouldTagEveryone = this.shouldTagEveryone(response, messageData);
            
            const formattedResponse = await this.formatResponseWithTags(response, originalChat, shouldTagEveryone);
            const responseLength = formattedResponse.text.length;
            const isLongResponse = responseLength > 300; // Threshold for smart routing
            const isBotOwner = messageData.from === botOwnerNumber;
            
            console.log(`📏 Response length: ${responseLength} chars, ${isLongResponse ? (isBotOwner ? 'bot owner - sending in current chat' : 'sending to DM') : 'sending in current chat'}${shouldTagEveryone ? ' with @everyone tags' : ''}`);
            
            if (isLongResponse && messageData.isGroup && !isBotOwner) {
                // Long responses in groups go to DM (but not for bot owner)
                await this.sendMessageToChat(originalChat, `sent a detailed response in dm`);
                await this.sendMessageToChat(userChat, formattedResponse);
            } else {
                // Short responses, DM conversations, or bot owner messages stay in current chat
                await this.sendMessageToChat(originalChat, formattedResponse);
            }
            
        } catch (error) {
            console.error('❌ Error in handleAIResponseSmart:', error);
            await this.sendMessageToChat(originalChat, 'sorry, there was an error processing the response. please try again.');
        }
    }

    /**
     * Determine if response should trigger @everyone tags
     */
    shouldTagEveryone(response, messageData) {
        // Only tag everyone in group chats
        if (!messageData.isGroup) {
            return false;
        }
        
        // Only allow if the message is from you (the bot owner)
        // Replace with your actual phone number
        const botOwnerNumber = '917975100121'; // Your phone number
        if (messageData.from !== botOwnerNumber) {
            return false;
        }
        
        // Check if the original user message contains @everyone
        const userMessage = messageData.body.toLowerCase();
        const hasEveryoneTrigger = userMessage.includes('@everyone');
        
        if (hasEveryoneTrigger) {
            console.log(`🏷️ Tagging everyone - @everyone found in user message from bot owner`);
            return true;
        }
        
        return false;
    }

    async handleAIResponse(chat, response, startTime) {
        try {
            const processingTimeMs = startTime ? Date.now() - startTime : null;
            console.log(`⚡ AI response processed in ${processingTimeMs}ms`);

            let responseText = '';
            if (typeof response === 'string') {
                responseText = response;
            } else if (response && response.text) {
                responseText = response.text;
            } else {
                await this.sendMessageToChat(chat, 'received an invalid response. please try again.');
                return;
            }

            const formattedResponse = this.formatResponseForWhatsApp(responseText);
            await this.sendLongMessageToChat(chat, formattedResponse);
            
        } catch (error) {
            console.error('Error sending AI response:', error);
            await this.sendMessageToChat(chat, 'failed to send response. please try again.');
        }
    }

    formatResponseForWhatsApp(text) {
        if (!text) return 'no response received.';

        let formatted = text;

        formatted = formatted.replace(/\\n/g, '\n');
        
        formatted = formatted.replace(/\\t/g, '\t');
        formatted = formatted.replace(/\\r/g, '\r');
        
        formatted = formatted.replace(/_\s+_([^:]+):_/g, '• *$1:*');
        
        formatted = formatted.replace(/^\s*[\*\-\+]\s+/gm, '• ');
        formatted = formatted.replace(/^\s*_\s+/gm, '• ');
        
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');
        
        formatted = formatted.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_');
        
        formatted = formatted.replace(/(?<!•\s)_([^_\n:]+)_/g, '_$1_');
        
        formatted = formatted.replace(/^\s*(\d+)\.\s+/gm, '$1. ');
        
        formatted = formatted.replace(/_([^_:]+):\*/g, '*$1:*');
        
        formatted = formatted.replace(/\*{3,}/g, '*');
        
        formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
            return match.replace(/```/g, '').trim();
        });
        
        formatted = formatted.replace(/`([^`]+)`/g, '$1');
        
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        
        formatted = formatted.replace(/<[^>]*>/g, '');
        
        formatted = formatted.replace(/•\s*/g, '• ');
        
        formatted = formatted.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
        
        formatted = formatted.replace(/\*\s*\*/g, '');
        formatted = formatted.replace(/_\s*_/g, '');
        
        formatted = formatted.trim();
        
        console.log('Formatted response:', formatted.substring(0, 200) + '...');
        
        return formatted;
    }

    async getUserPersonalChat(phoneNumber) {
        try {
            const personalChatId = `${phoneNumber}@c.us`;
            const personalChat = await this.client.getChatById(personalChatId);
            
            console.log(`Got personal chat for ${phoneNumber}`);
            return personalChat;
        } catch (error) {
            console.error(`Failed to get personal chat for ${phoneNumber}:`, error);
            return null;
        }
    }

    /**
     * Get all participants in a group chat
     */
    async getGroupParticipants(chat) {
        try {
            if (!chat.isGroup) {
                return [];
            }
            
            const participants = chat.participants;
            console.log(`Found ${participants.length} participants in group ${chat.name}`);
            return participants;
        } catch (error) {
            console.error('Failed to get group participants:', error);
            return [];
        }
    }

    /**
     * Format response with @everyone tags for group chats
     */
    async formatResponseWithTags(response, chat, shouldTagEveryone = false) {
        let formatted = this.formatResponseForWhatsApp(response);
        
        if (shouldTagEveryone && chat.isGroup) {
            try {
                const participants = await this.getGroupParticipants(chat);
                
                // Create mention data for WhatsApp
                const mentions = [];
                const mentionText = [];
                
                for (const participant of participants) {
                    // Skip if it's the bot's own number
                    if (participant.id._serialized === this.client.info.wid._serialized) {
                        continue;
                    }
                    
                    mentions.push(participant.id._serialized);
                    // Use participant name or phone number for display
                    const displayName = participant.pushname || participant.id.user;
                    mentionText.push(`@${displayName}`);
                }
                
                if (mentions.length > 0) {
                    // Add mention tags at the beginning of the message
                    const tagLine = `🔔 ${mentionText.join(' ')}\n\n`;
                    formatted = tagLine + formatted;
                    
                    console.log(`🏷️ Prepared ${mentions.length} mentions for group response`);
                    
                    // Return both the formatted text and mention data
                    return {
                        text: formatted,
                        mentions: mentions
                    };
                }
                
            } catch (error) {
                console.error('Failed to add group mentions:', error);
            }
        }
        
        // Return just text if no mentions
        return {
            text: formatted,
            mentions: []
        };
    }

    async sendHelpMessage(chat) {
        const helpText = `the everything assistant - whatsapp integration

available commands:

!ask [question] - ask me anything about academics, vit, or general topics
   example: !ask what is the mess menu today?
   example: !ask explain quantum physics

!context [limit] [question] - analyze recent chat history and answer questions
   example: !context what were the main topics discussed?
   example: !context 400 summarize what happened while i was away
   example: !context limit=200 give me the finance updates

!everyone [message] - tag everyone in group chat (owner only)
   example: !everyone meeting tomorrow at 5pm

!status - check if the assistant is online

!help - show this help message

tips:
• ask specific questions for better responses
• i can help with vit information, academic topics, and general knowledge
• responses may take a few seconds to process
• include @everyone in your message to tag everyone in groups (owner only)
• use !context (optionally with a limit) to catch up on missed conversations

powered by the everything assistant ai system`;

        await this.sendMessageToChat(chat, helpText);
    }

    async sendStatusMessage(chat) {
        const uptimeMinutes = Math.floor(process.uptime() / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const displayUptime = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`;
        
        const statusText = `the everything assistant status

service: online and operational
uptime: ${displayUptime}
active conversations: ${this.activeChats.size}
whatsapp connection: ${this.isReady ? 'connected' : 'disconnected'}

all systems running normally`;

        await this.sendMessageToChat(chat, statusText);
    }

    async sendMessage(phoneNumber, text) {
        if (!this.isReady) {
            console.error('WhatsApp client is not ready');
            return false;
        }

        try {
            const chatId = `${phoneNumber}@c.us`;
            await this.client.sendMessage(chatId, text);
            console.log(`Message sent to ${phoneNumber}: ${text.substring(0, 50)}...`);
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    async sendMessageToChat(chat, messageData) {
        if (!this.isReady) {
            console.error('WhatsApp client is not ready');
            return false;
        }

        try {
            let sentMessage;
            
            // Handle both string and object with mentions
            if (typeof messageData === 'string') {
                sentMessage = await chat.sendMessage(messageData);
                console.log(`Message sent to chat ${chat.name || chat.id.user}: ${messageData.substring(0, 50)}...`);
            } else if (messageData && messageData.text) {
                // Send message with mentions if provided
                if (messageData.mentions && messageData.mentions.length > 0) {
                    sentMessage = await chat.sendMessage(messageData.text, {
                        mentions: messageData.mentions
                    });
                    console.log(`Message with ${messageData.mentions.length} mentions sent to chat ${chat.name || chat.id.user}: ${messageData.text.substring(0, 50)}...`);
                } else {
                    sentMessage = await chat.sendMessage(messageData.text);
                    console.log(`Message sent to chat ${chat.name || chat.id.user}: ${messageData.text.substring(0, 50)}...`);
                }
            } else {
                console.error('Invalid message data provided');
                return false;
            }
            
            if (sentMessage && sentMessage.id) {
                this.recentBotMessages.add(sentMessage.id._serialized);
                setTimeout(() => {
                    this.recentBotMessages.delete(sentMessage.id._serialized);
                }, 5 * 60 * 1000);
            }
            
            return true;
        } catch (error) {
            console.error('Failed to send message to chat:', error);
            return false;
        }
    }

    async sendLongMessage(phoneNumber, text, chunkSize = 4000) {
        if (!text || text.length <= chunkSize) {
            return await this.sendMessage(phoneNumber, text || '❌ Empty response received.');
        }

        const chunks = this.splitMessage(text, chunkSize);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const prefix = chunks.length > 1 ? `📄 *Part ${i + 1}/${chunks.length}*\n\n` : '';
            
            await this.sendMessage(phoneNumber, prefix + chunk);
            
            if (i < chunks.length - 1) {
                await this.delay(1000);
            }
        }
    }

    async sendLongMessageToChat(chat, text, chunkSize = 4000) {
        if (!text || text.length <= chunkSize) {
            return await this.sendMessageToChat(chat, text || 'empty response received.');
        }

        const chunks = this.splitMessage(text, chunkSize);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const prefix = chunks.length > 1 ? `message part ${i + 1} of ${chunks.length}\n\n` : '';
            
            await this.sendMessageToChat(chat, prefix + chunk);
            
            if (i < chunks.length - 1) {
                await this.delay(1000);
            }
        }
    }

    splitMessage(text, chunkSize = 4000) {
        const chunks = [];
        let currentChunk = '';
        
        const lines = text.split('\n');
        
        for (const line of lines) {
            if ((currentChunk + line + '\n').length > chunkSize) {
                if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                if (line.length > chunkSize) {
                    const lineChunks = line.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
                    chunks.push(...lineChunks);
                } else {
                    currentChunk = line + '\n';
                }
            } else {
                currentChunk += line + '\n';
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.length > 0 ? chunks : [text];
    }

    async sendTyping(phoneNumber) {
        try {
            const chatId = `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(chatId);
            await chat.sendStateTyping();
        } catch (error) {
            console.error('❌ Failed to send typing indicator:', error);
        }
    }

    async sendTypingToChat(chat) {
        try {
            await chat.sendStateTyping();
        } catch (error) {
            console.error('❌ Failed to send typing indicator to chat:', error);
        }
    }

    isRateLimited(phoneNumber) {
        const now = Date.now();
        const userLimits = this.rateLimits.get(phoneNumber);
        
        if (!userLimits) {
            return false;
        }
        
        const windowMs = 15 * 60 * 1000;
        const maxMessages = 10;
        
        const recentMessages = userLimits.filter(timestamp => now - timestamp < windowMs);
        return recentMessages.length >= maxMessages;
    }

    updateRateLimit(phoneNumber) {
        const now = Date.now();
        const windowMs = 15 * 60 * 1000;
        
        if (!this.rateLimits.has(phoneNumber)) {
            this.rateLimits.set(phoneNumber, []);
        }
        
        const userLimits = this.rateLimits.get(phoneNumber);
        
        userLimits.push(now);
        
        const recentMessages = userLimits.filter(timestamp => now - timestamp < windowMs);
        this.rateLimits.set(phoneNumber, recentMessages);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getClientInfo() {
        if (!this.isReady) {
            return null;
        }
        
        try {
            const info = this.client.info;
            return {
                wid: info.wid,
                pushname: info.pushname,
                platform: info.platform,
                isReady: this.isReady
            };
        } catch (error) {
            console.error('Failed to get client info:', error);
            return null;
        }
    }

    async testSelfMessaging(phoneNumber) {
        if (!this.isReady) {
            console.error('WhatsApp client is not ready for testing');
            return false;
        }

        try {
            console.log('Testing self-messaging capability...');
            const chatId = `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(chatId);
            
            console.log('Chat info:', {
                id: chat.id,
                name: chat.name,
                isGroup: chat.isGroup,
                isReadOnly: chat.isReadOnly
            });
            
            await this.sendMessageToChat(chat, 'test message - if you see this, the everything assistant is working');
            return true;
        } catch (error) {
            console.error('Self-messaging test failed:', error);
            return false;
        }
    }

    async shutdown() {
        console.log('Shutting down WhatsApp service...');
        
        if (this.client) {
            try {
                await this.client.destroy();
                console.log('WhatsApp client destroyed successfully');
            } catch (error) {
                console.error('Error destroying WhatsApp client:', error);
            }
        }
        
        this.isReady = false;
        this.emit('shutdown');
    }
}

module.exports = WhatsAppService;
