import {
  Client,
  GatewayIntentBits,
  Message,
  TextChannel,
  User,
  Guild,
  Collection,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder
} from 'discord.js';
import { EventEmitter } from 'events';

interface ConversationContext {
  content: string;
  timestamp: number;
  isBot: boolean;
  role: 'user' | 'assistant';
}

interface MessageData {
  id: string;
  content: string;
  author: User;
  channel: TextChannel;
  guild: Guild | null;
  timestamp: number;
  isBot: boolean;
}

interface ContextConfig {
  maxMessages: number;
  maxAge: number;
  cleanupInterval: number;
}

class DiscordService extends EventEmitter {
  private client: Client;
  private isReady: boolean = false;
  private botToken: string;
  private botOwnerID: string;
  
  private conversationContext: Map<string, ConversationContext[]>;
  private contextConfig: ContextConfig;
  private rateLimits: Map<string, { count: number; resetTime: number }>;
  private recentBotMessages: Set<string>;

  constructor(token: string, ownerId: string) {
    super();
    this.botToken = token;
    this.botOwnerID = ownerId;
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    this.conversationContext = new Map();
    this.contextConfig = {
      maxMessages: 10,
      maxAge: 30 * 60 * 1000, // 30 minutes
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
    };
    this.rateLimits = new Map();
    this.recentBotMessages = new Set();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      console.log(`discord bot logged in as ${this.client.user?.tag}`);
      this.isReady = true;
      this.startContextCleanup();
      this.emit('ready');
    });

    this.client.on('messageCreate', async (message: Message) => {
      if (!this.isReady) return;
      
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        console.error('error handling incoming message:', error);
      }
    });

    this.client.on('error', (error) => {
      console.error('discord client error:', error);
      this.emit('error', error);
    });

    this.client.on('disconnect', () => {
      console.log('discord client disconnected');
      this.isReady = false;
      this.emit('disconnected');
    });
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Discord bot...');
      await this.client.login(this.botToken);
    } catch (error) {
      console.error('❌ Failed to initialize Discord bot:', error);
      throw error;
    }
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    // Skip bot messages and system messages
    if (message.author.bot || message.system) return;

    const messageData: MessageData = {
      id: message.id,
      content: message.content.trim(),
      author: message.author,
      channel: message.channel as TextChannel,
      guild: message.guild,
      timestamp: message.createdTimestamp,
      isBot: message.author.bot
    };

    console.log(`message from ${message.author.tag}: ${message.content.substring(0, 100)}...`);

    if (message.content.startsWith('!') || message.author.bot) {
      this.addToContext(message.author.id, message.content, message.author.bot);
    }

    if (message.content.startsWith('!')) {
      await this.handleCommand(messageData);
    }
  }

  private async handleCommand(messageData: MessageData): Promise<void> {
    const { content, author, channel, guild } = messageData;
    const args = content.slice(1).trim().split(' ');
    const command = args.shift()?.toLowerCase();

    if (!command) return;

    console.log(`processing command: !${command} from ${author.tag}`);

    if (!this.isOwner(author.id) && this.isRateLimited(author.id)) {
      await channel.send('⏰ You are being rate limited. Please wait before sending another command.');
      return;
    }

    if (!this.isOwner(author.id)) {
      this.updateRateLimit(author.id);
    }

    switch (command) {
      case 'ask':
        if (args.length === 0) {
          await channel.send('❌ Please provide a question after `!ask`\n\nExample: `!ask what is quantum physics?`');
          return;
        }
        await this.handleAskCommand(messageData, args.join(' '));
        break;

      case 'context':
        if (!this.isOwner(author.id)) {
          await channel.send('❌ Only the bot owner can use the `!context` command.');
          return;
        }
        const question = args.join(' ') || 'what has been happening in this channel recently?';
        await this.handleContextCommand(messageData, question);
        break;

      case 'everyone':
        if (!this.isOwner(author.id)) {
          await channel.send('❌ Only the bot owner can use the `!everyone` command.');
          return;
        }
        if (!guild) {
          await channel.send('❌ The `!everyone` command only works in servers.');
          return;
        }
        await this.handleEveryoneCommand(messageData, args.join(' '));
        break;

      case 'status':
        await this.handleStatusCommand(messageData);
        break;

      case 'help':
        await this.handleHelpCommand(messageData);
        break;

      default:
        await channel.send(`❌ Unknown command: \`!${command}\`\n\nType \`!help\` to see available commands.`);
        break;
    }
  }

  private async handleAskCommand(messageData: MessageData, question: string): Promise<void> {
    try {
      const { author, channel } = messageData;
      
      console.log(`🧠 Processing AI request from ${author.tag}: ${question}`);

      const vtopKeywords = ['vtop', 'grades', 'attendance', 'timetable', 'marks', 'schedule', 'exam', 'faculty', 'course'];
      const isVtopQuery = vtopKeywords.some(keyword => question.toLowerCase().includes(keyword));

      if (isVtopQuery) {
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('🎓 VTOP Features')
          .setDescription('For VTOP features like checking grades, attendance, timetable, and other academic information, please use the web interface:')
          .addFields({ name: 'Website', value: 'https://the-everything-assistant.vercel.app' })
          .setFooter({ text: 'The website provides full access to all VTOP features with a better user experience.' });

        await channel.send({ embeds: [embed] });
        return;
      }

      await channel.sendTyping();

      const conversationHistory = this.getContext(author.id);
      console.log(`Found ${conversationHistory.length} messages in conversation history for ${author.tag}`);

      const startTime = Date.now();

      this.emit('ask', {
        messageData,
        question,
        conversationHistory,
        startTime,
        respondCallback: (response: string) => this.handleAIResponse(messageData, response, startTime)
      });

    } catch (error) {
      console.error('Error in handleAskCommand:', error);
      await messageData.channel.send('Sorry, I encountered an error processing your request. Please try again.');
    }
  }

  private async handleContextCommand(messageData: MessageData, question: string): Promise<void> {
    try {
      const { author, channel } = messageData;
      
      console.log(`📚 Processing context request from ${author.tag}: ${question}`);

      await channel.sendTyping();

      const recentMessages = await this.getChannelHistory(channel, 100);

      if (recentMessages.length === 0) {
        await channel.send('❌ No recent messages found in this channel to analyze.');
        return;
      }

      const contextText = this.formatChatHistoryForAI(recentMessages);

      const analysisPrompt = `Please analyze this Discord channel history and answer the following question: "${question}"

Channel History (last ${recentMessages.length} messages):
${contextText}

Please provide a helpful summary and answer based on the channel context. Focus on:
- Recent topics and discussions
- Important information or decisions
- Any ongoing conversations or plans
- Answer the specific question asked

Keep the response concise but informative.`;

      const startTime = Date.now();

      this.emit('ask', {
        messageData: { ...messageData, isContextAnalysis: true },
        question: analysisPrompt,
        conversationHistory: [],
        startTime,
        respondCallback: (response: string) => this.handleAIResponse(messageData, response, startTime)
      });

    } catch (error) {
      console.error('❌ Error in handleContextCommand:', error);
      await messageData.channel.send('❌ Sorry, I encountered an error analyzing the channel context. Please try again.');
    }
  }

  private async handleEveryoneCommand(messageData: MessageData, message: string): Promise<void> {
    try {
      const { channel, guild } = messageData;
      
      if (!guild) return;

      const finalMessage = message || 'Hey everyone! 👋';
      const taggedMessage = `@everyone\n\n${finalMessage}`;
      
      await channel.send(taggedMessage);
      console.log(`🏷️ Sent @everyone message in ${guild.name}`);

    } catch (error) {
      console.error('❌ Error in handleEveryoneCommand:', error);
      await messageData.channel.send('❌ Sorry, I encountered an error sending the message.');
    }
  }

  private async handleStatusCommand(messageData: MessageData): Promise<void> {
    const uptime = process.uptime();
    const uptimeMinutes = Math.floor(uptime / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const displayUptime = uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`;

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🤖 Bot Status')
      .addFields(
        { name: 'Status', value: '✅ Online and operational', inline: true },
        { name: 'Uptime', value: displayUptime, inline: true },
        { name: 'Discord Connection', value: this.isReady ? '🟢 Connected' : '🔴 Disconnected', inline: true }
      )
      .setTimestamp();

    await messageData.channel.send({ embeds: [embed] });
  }

  private async handleHelpCommand(messageData: MessageData): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🤖 The Everything Assistant - Discord Bot')
      .setDescription('Available commands:')
      .addFields(
        {
          name: '💬 !ask [question]',
          value: 'Ask me anything about academics, VIT, or general topics\nExample: `!ask what is life at VIT like?`',
          inline: false
        },
        {
          name: '📊 !status',
          value: 'Check if the assistant is online',
          inline: false
        },
        {
          name: '❓ !help',
          value: 'Show this help message',
          inline: false
        }
      )
      .addFields(
        {
          name: '💡 Tips',
          value: '• Ask specific questions for better responses\n• I can help with VIT information and academic topics',
          inline: false
        }
      )
      .setFooter({ text: 'Powered by the everything assistant' });

    await messageData.channel.send({ embeds: [embed] });
  }

  private async handleAIResponse(messageData: MessageData, response: string, startTime: number): Promise<void> {
    try {
      const { author, channel, guild } = messageData;
      const processingTime = Date.now() - startTime;
      
      console.log(`AI Response ready in ${processingTime}ms`);

      if (!response || response.trim() === '') {
        await channel.send('Sorry, I couldn\'t generate a response. Please try asking again.');
        return;
      }

      const shouldTagEveryone = this.shouldTagEveryone(response, messageData);
      
      let formattedResponse = this.formatResponseForDiscord(response);
      
      if (shouldTagEveryone && guild) {
        formattedResponse = `@everyone\n\n${formattedResponse}`;
      }

      const isLongResponse = formattedResponse.length > 1500;
      const isOwner = this.isOwner(author.id);

      if (isLongResponse && guild && !isOwner) {
        await channel.send(`Sent a detailed response to ${author.tag} in DM.`);
        await author.send(formattedResponse);
      } else {
        if (formattedResponse.length > 2000) {
          await this.sendLongMessage(channel, formattedResponse);
        } else {
          await channel.send(formattedResponse);
        }
      }

    } catch (error) {
      console.error('Error in handleAIResponse:', error);
      await messageData.channel.send('Sorry, there was an error processing the response. Please try again.');
    }
  }

  private addToContext(userId: string, content: string, isBot: boolean): void {
    if (!this.conversationContext.has(userId)) {
      this.conversationContext.set(userId, []);
    }

    const context = this.conversationContext.get(userId)!;
    const timestamp = Date.now();

    context.push({
      content,
      timestamp,
      isBot,
      role: isBot ? 'assistant' : 'user'
    });

    while (context.length > this.contextConfig.maxMessages) {
      context.shift();
    }
  }

  private getContext(userId: string): ConversationContext[] {
    if (!this.conversationContext.has(userId)) {
      return [];
    }

    const context = this.conversationContext.get(userId)!;
    const now = Date.now();

    const validContext = context.filter(msg => 
      (now - msg.timestamp) < this.contextConfig.maxAge
    );

    this.conversationContext.set(userId, validContext);
    return validContext;
  }

  private startContextCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [userId, context] of this.conversationContext.entries()) {
        const validMessages = context.filter(msg => 
          (now - msg.timestamp) < this.contextConfig.maxAge
        );

        if (validMessages.length === 0) {
          this.conversationContext.delete(userId);
        } else if (validMessages.length !== context.length) {
          this.conversationContext.set(userId, validMessages);
        }
      }
    }, this.contextConfig.cleanupInterval);
  }

  private isOwner(userId: string): boolean {
    return userId === this.botOwnerID;
  }

  private shouldTagEveryone(response: string, messageData: MessageData): boolean {
    if (!messageData.guild) return false;
    if (!this.isOwner(messageData.author.id)) return false;
    
    return messageData.content.toLowerCase().includes('@everyone');
  }

  private isRateLimited(userId: string): boolean {
    const limit = this.rateLimits.get(userId);
    if (!limit) return false;

    const now = Date.now();
    if (now > limit.resetTime) {
      this.rateLimits.delete(userId);
      return false;
    }

    return limit.count >= 10;
  }

  private updateRateLimit(userId: string): void {
    const now = Date.now();
    const resetTime = now + 5 * 60 * 1000;

    const existing = this.rateLimits.get(userId);
    if (!existing || now > existing.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime });
    } else {
      existing.count++;
    }
  }

  private formatResponseForDiscord(text: string): string {
    if (!text) return 'No response received.';

    let formatted = text.toString();

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '**$1**'); // Bold
    formatted = formatted.replace(/\*(.*?)\*/g, '*$1*'); // Italic
    formatted = formatted.replace(/`([^`]+)`/g, '`$1`'); // Inline code

    // Handle code blocks
    formatted = formatted.replace(/```([\s\S]*?)```/g, '```$1```');

    // Clean up excessive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
  }

  private async sendLongMessage(channel: TextChannel, text: string): Promise<void> {
    const chunks = this.chunkMessage(text, 1900); // Leave some buffer
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prefix = chunks.length > 1 ? `**Part ${i + 1}/${chunks.length}**\n\n` : '';
      await channel.send(prefix + chunk);
    }
  }

  private chunkMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        if (line.length > maxLength) {
          // Split very long lines
          const words = line.split(' ');
          let currentLine = '';
          
          for (const word of words) {
            if ((currentLine + word + ' ').length > maxLength) {
              if (currentLine) {
                chunks.push(currentLine.trim());
                currentLine = '';
              }
              currentLine = word + ' ';
            } else {
              currentLine += word + ' ';
            }
          }
          
          if (currentLine) {
            currentChunk = currentLine;
          }
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

    return chunks;
  }

  private async getChannelHistory(channel: TextChannel, limit: number): Promise<any[]> {
    try {
      console.log(`Fetching last ${limit} messages from channel ${channel.name}`);
      
      const messages = await channel.messages.fetch({ limit });
      const processedMessages: any[] = [];

      for (const [, message] of messages) {
        if (message.author.bot || message.system) continue;

        const daysSinceMessage = (Date.now() - message.createdTimestamp) / (1000 * 60 * 60 * 24);
        if (daysSinceMessage > 7) continue;

        if (message.content.trim()) {
          processedMessages.push({
            sender: message.author.displayName || message.author.username,
            senderId: message.author.id,
            content: message.content,
            timestamp: new Date(message.createdTimestamp).toLocaleString(),
            isFromBot: message.author.bot
          });
        }
      }

      console.log(`Retrieved ${processedMessages.length} messages for context analysis`);
      return processedMessages.reverse();

    } catch (error) {
      console.error('Failed to fetch channel history:', error);
      return [];
    }
  }

  private formatChatHistoryForAI(messages: any[]): string {
    if (!messages || messages.length === 0) {
      return 'No messages found.';
    }

    return messages.map(msg => 
      `[${msg.timestamp}] ${msg.sender}: ${msg.content}`
    ).join('\n');
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Discord bot...');
    this.isReady = false;
    await this.client.destroy();
  }

  getClientInfo(): any {
    return {
      tag: this.client.user?.tag,
      id: this.client.user?.id,
      guilds: this.client.guilds.cache.size,
      users: this.client.users.cache.size
    };
  }
}

export default DiscordService;