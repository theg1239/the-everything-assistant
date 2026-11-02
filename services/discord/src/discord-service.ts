import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  MessageFlags,
  TextChannel,
  DMChannel,
  User,
  Guild,
  Collection,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  REST,
  Routes,
} from 'discord.js'
import type { SlashCommandOptionsOnlyBuilder, TextBasedChannel } from 'discord.js'
import { EventEmitter } from 'node:events'

export interface ConversationContext {
  content: string
  timestamp: number
  isBot: boolean
  role: 'user' | 'assistant'
}

interface MessageData {
  id: string
  content: string
  author: User
  channel: TextChannel | DMChannel
  guild: Guild | null
  timestamp: number
  isBot: boolean
}

/** Message data attached to an `ask` event (slash commands may not have a cached channel). */
export interface AskMessageData extends Omit<MessageData, 'channel'> {
  channel: TextBasedChannel | null
  isContextAnalysis?: boolean
}

export type AIResponse = string | { text?: string; reasoning?: string }

export interface AskRequest {
  messageData: AskMessageData
  question: string
  conversationHistory: ConversationContext[]
  startTime: number
  respondCallback: (response: AIResponse) => Promise<void>
}

export interface DiscordClientInfo {
  tag: string | undefined
  id: string | undefined
  guilds: number
  users: number
}

interface ChannelHistoryMessage {
  sender: string
  senderId: string
  content: string
  timestamp: string
  isFromBot: boolean
}

type DiscordServiceEvents = {
  ready: []
  error: [error: Error]
  /** Emitted once the service has given up re-logging in after an unrecoverable gateway loss. */
  disconnected: []
  ask: [request: AskRequest]
}

/** Backoff for manual re-login after a disconnect discord.js will not recover from by itself. */
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 5 * 60_000
const RECONNECT_MAX_ATTEMPTS = 10

/** Rethrows the first rejection (in input order) once every promise has settled. */
function throwFirstRejection(results: PromiseSettledResult<unknown>[]): void {
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
}

type SlashCommand = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder

interface ContextConfig {
  maxMessages: number
  maxAge: number
  cleanupInterval: number
}

class DiscordService extends EventEmitter<DiscordServiceEvents> {
  private client: Client
  private isReady: boolean = false
  private botToken: string
  private botOwnerID: string
  private rest: REST

  private conversationContext: Map<string, ConversationContext[]>
  private contextConfig: ContextConfig
  private rateLimits: Map<string, { count: number; resetTime: number }>
  private recentBotMessages: Set<string>

  private slashCommands: Collection<string, SlashCommand>

  private contextCleanupTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectInFlight = false
  private reconnectAttempts = 0
  private shuttingDown = false

  constructor(token: string, ownerId: string) {
    super()
    this.botToken = token
    this.botOwnerID = ownerId

    this.client = this.createClient()

    this.rest = new REST({ version: '10' }).setToken(token)
    this.slashCommands = new Collection()

    this.conversationContext = new Map()
    this.contextConfig = {
      maxMessages: 10,
      maxAge: 30 * 60 * 1000, // 30 minutes
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
    }
    this.rateLimits = new Map()
    this.recentBotMessages = new Set()

    this.setupSlashCommands()
  }

  /**
   * Builds a Client with all handlers attached. A destroyed discord.js Client cannot be reliably
   * logged in again (its WebSocketManager stays flagged as destroyed), so manual re-login always
   * swaps in a fresh Client.
   */
  private createClient(): Client {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
      ],
    })
    this.setupEventHandlers(client)
    return client
  }

  private setupSlashCommands(): void {
    const commands = [
      new SlashCommandBuilder()
        .setName('ask')
        .setDescription('ask the ai assistant a question')
        .addStringOption(option =>
          option.setName('question').setDescription('your question for the ai').setRequired(true)
        ),
      new SlashCommandBuilder().setName('status').setDescription('check the bot status'),
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('show available commands and help information'),
    ]

    commands.forEach((command: SlashCommand) => {
      this.slashCommands.set(command.name, command)
    })
  }

  private async registerSlashCommands(guildId?: string): Promise<void> {
    try {
      console.log('registering slash commands...')

      const commands = this.slashCommands.map(command => command.toJSON())

      const applicationId = this.client.user?.id
      if (!applicationId) {
        throw new Error('discord client user is not available')
      }

      if (guildId) {
        await this.rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
          body: commands,
        })
        console.log(`registered ${commands.length} slash commands for guild ${guildId}`)
      } else {
        await this.rest.put(Routes.applicationCommands(applicationId), { body: commands })
        console.log(`registered ${commands.length} slash commands globally`)
      }
    } catch (error) {
      console.error('failed to register slash commands:', error)
    }
  }

  private setupEventHandlers(client: Client): void {
    // Lifecycle events from a Client that has since been replaced (during re-login) are ignored.
    const isCurrent = (): boolean => client === this.client

    client.on(Events.ClientReady, async readyClient => {
      if (!isCurrent()) return
      console.log(`discord bot logged in as ${readyClient.user.tag}`)
      this.isReady = true
      this.reconnectAttempts = 0
      this.startContextCleanup()

      await this.registerSlashCommands()

      this.emit('ready')
    })

    // discord.js 14 has no client-level 'disconnect' event. Gateway lifecycle is reported per shard,
    // and discord.js resumes / re-identifies on its own for every recoverable close.
    client.on(Events.ShardReconnecting, shardId => {
      if (!isCurrent()) return
      console.log(`discord shard ${shardId} disconnected; discord.js is reconnecting`)
      this.isReady = false
    })

    client.on(Events.ShardResume, (shardId, replayedEvents) => {
      if (!isCurrent()) return
      console.log(`discord shard ${shardId} resumed (${replayedEvents} events replayed)`)
      this.isReady = true
    })

    client.on(Events.ShardReady, shardId => {
      if (!isCurrent()) return
      console.log(`discord shard ${shardId} ready`)
      this.isReady = true
    })

    client.on(Events.ShardError, (error, shardId) => {
      if (!isCurrent()) return
      console.error(`discord shard ${shardId} websocket error:`, error)
    })

    // Only emitted for unrecoverable close codes (auth failed, invalid/disallowed intents, invalid
    // shard, sharding required, invalid API version); discord.js will not reconnect this shard.
    client.on(Events.ShardDisconnect, (closeEvent, shardId) => {
      if (!isCurrent()) return
      console.error(
        `discord shard ${shardId} disconnected with unrecoverable close code ${closeEvent.code}`
      )
      this.isReady = false
      this.scheduleReconnect(`shard ${shardId} closed with code ${closeEvent.code}`)
    })

    // Declared by discord.js 14 but not currently emitted; handled in case a future 14.x restores it.
    client.on(Events.Invalidated, () => {
      if (!isCurrent()) return
      console.error('discord session invalidated')
      this.isReady = false
      this.scheduleReconnect('session invalidated')
    })

    client.on(Events.GuildCreate, async (guild: Guild) => {
      console.log(`joined new server: ${guild.name} (${guild.id})`)

      await this.registerSlashCommands(guild.id)
    })

    client.on(Events.InteractionCreate, async interaction => {
      if (!interaction.isChatInputCommand()) return

      try {
        await this.handleSlashCommand(interaction)
      } catch (error) {
        console.error('error handling slash command:', error)

        const errorMessage = 'sorry, there was an error processing your command.'

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral })
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral })
        }
      }
    })

    client.on(Events.MessageCreate, async (message: Message) => {
      if (!this.isReady) return

      try {
        await this.handleIncomingMessage(message)
      } catch (error) {
        console.error('error handling incoming message:', error)
      }
    })

    client.on(Events.Error, error => {
      console.error('discord client error:', error)
      this.emit('error', error)
    })
  }

  /** Schedules a manual re-login with exponential backoff; no-op if one is already pending. */
  private scheduleReconnect(reason: string): void {
    if (this.shuttingDown) return
    if (this.reconnectTimer || this.reconnectInFlight) {
      console.log(`discord re-login already pending; ignoring trigger (${reason})`)
      return
    }
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      console.error(
        `discord re-login gave up after ${this.reconnectAttempts} attempts (${reason}); ` +
          'restart the service or call POST /api/discord/restart'
      )
      this.emit('disconnected')
      return
    }

    const backoff = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS
    )
    const delay = backoff + Math.floor(Math.random() * 1000)
    this.reconnectAttempts += 1
    console.log(
      `discord re-login attempt ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS} in ${delay}ms (${reason})`
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.relogin()
    }, delay)
  }

  private async relogin(): Promise<void> {
    if (this.shuttingDown || this.reconnectInFlight) return
    this.reconnectInFlight = true

    let failure: unknown = null
    try {
      // Swap first so late events from the old Client are ignored by its handlers.
      const previous = this.client
      this.client = this.createClient()
      await previous.destroy()

      if (this.shuttingDown) return
      await this.client.login(this.botToken)
      if (this.shuttingDown) {
        await this.client.destroy()
        return
      }
      console.log('discord re-login succeeded')
    } catch (error) {
      failure = error
    } finally {
      this.reconnectInFlight = false
    }

    if (failure !== null) {
      console.error('discord re-login failed:', failure)
      this.scheduleReconnect('previous re-login failed')
    }
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName, user, guild, channel } = interaction

    console.log(`processing slash command: /${commandName} from ${user.tag}`)

    if (!this.isOwner(user.id) && this.isRateLimited(user.id)) {
      await interaction.reply({
        content: 'you are being rate limited. please wait before using another command.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (!this.isOwner(user.id)) {
      this.updateRateLimit(user.id)
    }

    switch (commandName) {
      case 'ask':
        const question = interaction.options.getString('question')
        if (!question) {
          await interaction.reply({
            content: 'please provide a question.',
            flags: MessageFlags.Ephemeral,
          })
          return
        }
        await this.handleSlashAskCommand(interaction, question)
        break

      case 'status':
        await this.handleSlashStatusCommand(interaction)
        break

      case 'help':
        await this.handleSlashHelpCommand(interaction)
        break

      default:
        await interaction.reply({
          content: `unknown command: \`/${commandName}\``,
          flags: MessageFlags.Ephemeral,
        })
        break
    }
  }

  private async handleSlashAskCommand(
    interaction: ChatInputCommandInteraction,
    question: string
  ): Promise<void> {
    try {
      console.log(`processing ai request from ${interaction.user.tag}: ${question}`)

      const vtopKeywords = [
        'vtop',
        'grades',
        'attendance',
        'timetable',
        'marks',
        'schedule',
        'exam',
        'faculty',
        'course',
      ]
      const isVtopQuery = vtopKeywords.some(keyword => question.toLowerCase().includes(keyword))

      if (isVtopQuery) {
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('vtop features')
          .setDescription(
            'for vtop features like checking grades, attendance, timetable, and other academic information, please use the web interface:'
          )
          .addFields({ name: 'website', value: 'https://everything-assistant.com' })
          .setFooter({
            text: 'the website provides full access to all vtop features with a better user experience.',
          })

        await interaction.reply({ embeds: [embed] })
        return
      }

      await interaction.deferReply()

      const conversationHistory = this.getContext(interaction.user.id)
      console.log(
        `found ${conversationHistory.length} messages in conversation history for ${interaction.user.tag}`
      )

      const startTime = Date.now()

      const messageData: AskMessageData = {
        id: interaction.id,
        content: `/ask ${question}`,
        author: interaction.user,
        channel: interaction.channel,
        guild: interaction.guild || null,
        timestamp: Date.now(),
        isBot: false,
      }

      this.emit('ask', {
        messageData,
        question,
        conversationHistory,
        startTime,
        respondCallback: (response: AIResponse) =>
          this.handleSlashAIResponse(interaction, response, startTime),
      })
    } catch (error) {
      console.error('error in handleslashaskcommand:', error)

      if (interaction.deferred) {
        await interaction.editReply(
          'sorry, i encountered an error processing your request. please try again.'
        )
      } else {
        await interaction.reply({
          content: 'sorry, i encountered an error processing your request. please try again.',
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  }

  private async handleSlashStatusCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const uptime = process.uptime()
    const uptimeMinutes = Math.floor(uptime / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const displayUptime =
      uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('bot status')
      .addFields(
        { name: 'status', value: 'online and operational', inline: true },
        { name: 'uptime', value: displayUptime, inline: true },
        {
          name: 'discord connection',
          value: this.isReady ? 'connected' : 'disconnected',
          inline: true,
        }
      )
      .setTimestamp()

    await interaction.reply({ embeds: [embed] })
  }

  private async handleSlashHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('the everything assistant - discord bot')
      .setDescription('available commands:')
      .addFields(
        {
          name: '/ask [question]',
          value:
            'ask me anything about academics, vit, or general topics\\nexample: `/ask what is quantum physics?`',
          inline: false,
        },
        {
          name: '/status',
          value: 'check if the assistant is online',
          inline: false,
        },
        {
          name: '/help',
          value: 'show this help message',
          inline: false,
        }
      )
      .addFields({
        name: 'tips',
        value:
          '• ask specific questions for better responses\\n• i can help with vit information and academic topics\\n• responses may take a few seconds to process',
        inline: false,
      })
      .setFooter({ text: 'powered by the everything assistant ai system' })

    await interaction.reply({ embeds: [embed] })
  }

  private async handleSlashAIResponse(
    interaction: ChatInputCommandInteraction,
    response: AIResponse,
    startTime: number
  ): Promise<void> {
    try {
      const processingTime = Date.now() - startTime

      console.log(`ai response ready in ${processingTime}ms`)

      const textResponse = typeof response === 'string' ? response : response?.text || ''

      if (!textResponse || textResponse.trim() === '') {
        await interaction.editReply(
          'sorry, i could not generate a response. please try asking again.'
        )
        return
      }

      let formattedResponse = this.formatResponseForDiscord(textResponse)

      const isLongResponse = formattedResponse.length > 1500
      const isOwner = this.isOwner(interaction.user.id)
      const isInGuild = !!interaction.guild

      if (isLongResponse && isInGuild && !isOwner) {
        // Interaction webhook and DM channel are independent targets. allSettled (not all) so the
        // catch below can't overwrite the reply before the in-flight notice edit lands.
        throwFirstRejection(
          await Promise.allSettled([
            interaction.editReply(`sent a detailed response to ${interaction.user.tag} in dm.`),
            interaction.user.send(formattedResponse),
          ])
        )
      } else {
        if (formattedResponse.length > 2000) {
          await interaction.editReply(formattedResponse.substring(0, 2000))

          const remainingText = formattedResponse.substring(2000)
          const chunks = this.chunkMessage(remainingText, 2000)

          for (const chunk of chunks) {
            await interaction.followUp(chunk)
          }
        } else {
          await interaction.editReply(formattedResponse)
        }
      }
    } catch (error) {
      console.error('error in handleslashairesponse:', error)

      try {
        await interaction.editReply(
          'sorry, there was an error processing the response. please try again.'
        )
      } catch (editError) {
        console.error('failed to edit reply:', editError)
      }
    }
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing Discord bot...')
      await this.client.login(this.botToken)
    } catch (error) {
      console.error('❌ Failed to initialize Discord bot:', error)
      throw error
    }
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    if (message.author.bot || message.system) return

    console.log(`message from ${message.author.tag}: ${message.content.substring(0, 100)}...`)

    this.addToContext(message.author.id, message.content, message.author.bot)
  }

  private async handleCommand(messageData: MessageData): Promise<void> {
    const { content, author, channel, guild } = messageData
    const args = content.slice(1).trim().split(' ')
    const command = args.shift()?.toLowerCase()

    if (!command) return

    console.log(`processing command: !${command} from ${author.tag}`)

    if (!this.isOwner(author.id) && this.isRateLimited(author.id)) {
      await channel.send(
        '⏰ You are being rate limited. Please wait before sending another command.'
      )
      return
    }

    if (!this.isOwner(author.id)) {
      this.updateRateLimit(author.id)
    }

    switch (command) {
      case 'ask':
        if (args.length === 0) {
          await channel.send(
            '❌ Please provide a question after `!ask`\n\nExample: `!ask what is quantum physics?`'
          )
          return
        }
        await this.handleAskCommand(messageData, args.join(' '))
        break

      case 'context':
        if (!this.isOwner(author.id)) {
          await channel.send('❌ Only the bot owner can use the `!context` command.')
          return
        }
        const question = args.join(' ') || 'what has been happening in this channel recently?'
        await this.handleContextCommand(messageData, question)
        break

      case 'everyone':
        if (!this.isOwner(author.id)) {
          await channel.send('❌ Only the bot owner can use the `!everyone` command.')
          return
        }
        if (!guild) {
          await channel.send('❌ The `!everyone` command only works in servers.')
          return
        }
        await this.handleEveryoneCommand(messageData, args.join(' '))
        break

      case 'status':
        await this.handleStatusCommand(messageData)
        break

      case 'help':
        await this.handleHelpCommand(messageData)
        break

      default:
        await channel.send(
          `❌ Unknown command: \`!${command}\`\n\nType \`!help\` to see available commands.`
        )
        break
    }
  }

  private async handleAskCommand(messageData: MessageData, question: string): Promise<void> {
    try {
      const { author, channel } = messageData

      console.log(`🧠 Processing AI request from ${author.tag}: ${question}`)

      const vtopKeywords = [
        'vtop',
        'grades',
        'attendance',
        'timetable',
        'marks',
        'schedule',
        'exam',
        'faculty',
        'course',
      ]
      const isVtopQuery = vtopKeywords.some(keyword => question.toLowerCase().includes(keyword))

      if (isVtopQuery) {
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle('🎓 VTOP Features')
          .setDescription(
            'For VTOP features like checking grades, attendance, timetable, and other academic information, please use the web interface:'
          )
          .addFields({ name: 'Website', value: 'https://everything-assistant.com' })
          .setFooter({
            text: 'The website provides full access to all VTOP features with a better user experience.',
          })

        await channel.send({ embeds: [embed] })
        return
      }

      // Typing indicator is cosmetic: don't block (or fail) the AI request on it.
      void channel.sendTyping().catch((error: unknown) => {
        console.warn('Failed to send typing indicator:', error)
      })

      const conversationHistory = this.getContext(author.id)
      console.log(
        `Found ${conversationHistory.length} messages in conversation history for ${author.tag}`
      )

      const startTime = Date.now()

      this.emit('ask', {
        messageData,
        question,
        conversationHistory,
        startTime,
        respondCallback: (response: AIResponse) =>
          this.handleAIResponse(messageData, response, startTime),
      })
    } catch (error) {
      console.error('Error in handleAskCommand:', error)
      await messageData.channel.send(
        'Sorry, I encountered an error processing your request. Please try again.'
      )
    }
  }

  private async handleContextCommand(messageData: MessageData, question: string): Promise<void> {
    try {
      const { author, channel } = messageData

      console.log(`📚 Processing context request from ${author.tag}: ${question}`)

      // Typing indicator is cosmetic: run it alongside the history fetch instead of before it.
      void channel.sendTyping().catch((error: unknown) => {
        console.warn('Failed to send typing indicator:', error)
      })

      const recentMessages = await this.getChannelHistory(channel, 100)

      if (recentMessages.length === 0) {
        await channel.send('❌ No recent messages found in this channel to analyze.')
        return
      }

      const contextText = this.formatChatHistoryForAI(recentMessages)

      const analysisPrompt = `Please analyze this Discord channel history and answer the following question: "${question}"

Channel History (last ${recentMessages.length} messages):
${contextText}

Please provide a helpful summary and answer based on the channel context. Focus on:
- Recent topics and discussions
- Important information or decisions
- Any ongoing conversations or plans
- Answer the specific question asked

Keep the response concise but informative.`

      const startTime = Date.now()

      this.emit('ask', {
        messageData: { ...messageData, isContextAnalysis: true },
        question: analysisPrompt,
        conversationHistory: [],
        startTime,
        respondCallback: (response: AIResponse) =>
          this.handleAIResponse(messageData, response, startTime),
      })
    } catch (error) {
      console.error('❌ Error in handleContextCommand:', error)
      await messageData.channel.send(
        '❌ Sorry, I encountered an error analyzing the channel context. Please try again.'
      )
    }
  }

  private async handleEveryoneCommand(messageData: MessageData, message: string): Promise<void> {
    try {
      const { channel, guild } = messageData

      if (!guild) return

      const finalMessage = message || 'Hey everyone! 👋'
      const taggedMessage = `@everyone\n\n${finalMessage}`

      await channel.send(taggedMessage)
      console.log(`🏷️ Sent @everyone message in ${guild.name}`)
    } catch (error) {
      console.error('❌ Error in handleEveryoneCommand:', error)
      await messageData.channel.send('❌ Sorry, I encountered an error sending the message.')
    }
  }

  private async handleStatusCommand(messageData: MessageData): Promise<void> {
    const uptime = process.uptime()
    const uptimeMinutes = Math.floor(uptime / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const displayUptime =
      uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🤖 Bot Status')
      .addFields(
        { name: 'Status', value: '✅ Online and operational', inline: true },
        { name: 'Uptime', value: displayUptime, inline: true },
        {
          name: 'Discord Connection',
          value: this.isReady ? '🟢 Connected' : '🔴 Disconnected',
          inline: true,
        }
      )
      .setTimestamp()

    await messageData.channel.send({ embeds: [embed] })
  }

  private async handleHelpCommand(messageData: MessageData): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🤖 The Everything Assistant - Discord Bot')
      .setDescription('Available commands:')
      .addFields(
        {
          name: '💬 !ask [question]',
          value:
            'Ask me anything about academics, VIT, or general topics\nExample: `!ask what is life at VIT like?`',
          inline: false,
        },
        {
          name: '📊 !status',
          value: 'Check if the assistant is online',
          inline: false,
        },
        {
          name: '❓ !help',
          value: 'Show this help message',
          inline: false,
        }
      )
      .addFields({
        name: '💡 Tips',
        value:
          '• Ask specific questions for better responses\n• I can help with VIT information and academic topics',
        inline: false,
      })
      .setFooter({ text: 'Powered by the everything assistant' })

    await messageData.channel.send({ embeds: [embed] })
  }

  private async handleAIResponse(
    messageData: MessageData,
    response: AIResponse,
    startTime: number
  ): Promise<void> {
    try {
      const { author, channel, guild } = messageData
      const processingTime = Date.now() - startTime

      console.log(`AI Response ready in ${processingTime}ms`)

      const responseText = typeof response === 'string' ? response : response?.text || ''
      const reasoningText = typeof response === 'object' ? response?.reasoning || '' : ''

      if (!responseText || responseText.trim() === '') {
        await channel.send("Sorry, I couldn't generate a response. Please try asking again.")
        return
      }

      const shouldTagEveryone = this.shouldTagEveryone(responseText, messageData)

      let formattedResponse = this.formatResponseForDiscord(responseText)

      if (shouldTagEveryone && guild) {
        formattedResponse = `@everyone\n\n${formattedResponse}`
      }

      const isLongResponse = formattedResponse.length > 1500
      const isOwner = this.isOwner(author.id)

      let thinkingMessage: Message | null = null
      if (reasoningText.trim()) {
        try {
          const reasoningDisplay = `💭 thinking...\n${this.formatResponseForDiscord(reasoningText)}`
          thinkingMessage = await channel.send(reasoningDisplay)
        } catch (err) {
          console.warn('Failed to send reasoning message:', err)
        }
      }

      if (isLongResponse && guild && !isOwner) {
        // Different channels (guild channel vs DM), so send both at once; allSettled so the error
        // reply in the catch below is only sent once both have finished.
        throwFirstRejection(
          await Promise.allSettled([
            channel.send(`Sent a detailed response to ${author.tag} in DM.`),
            author.send(formattedResponse),
          ])
        )
      } else if (formattedResponse.length > 2000) {
        await this.sendLongMessage(channel, formattedResponse)
      } else if (thinkingMessage) {
        // "Edit" the reasoning message into the final answer when possible
        try {
          await thinkingMessage.edit(formattedResponse)
        } catch (err) {
          console.warn('Failed to edit reasoning message, sending new message:', err)
          await channel.send(formattedResponse)
        }
      } else {
        await channel.send(formattedResponse)
      }
    } catch (error) {
      console.error('Error in handleAIResponse:', error)
      await messageData.channel.send(
        'Sorry, there was an error processing the response. Please try again.'
      )
    }
  }

  private addToContext(userId: string, content: string, isBot: boolean): void {
    let context = this.conversationContext.get(userId)
    if (!context) {
      context = []
      this.conversationContext.set(userId, context)
    }

    const timestamp = Date.now()

    context.push({
      content,
      timestamp,
      isBot,
      role: isBot ? 'assistant' : 'user',
    })

    while (context.length > this.contextConfig.maxMessages) {
      context.shift()
    }
  }

  private getContext(userId: string): ConversationContext[] {
    const context = this.conversationContext.get(userId)
    if (!context) {
      return []
    }

    const now = Date.now()

    const validContext = context.filter(msg => now - msg.timestamp < this.contextConfig.maxAge)

    this.conversationContext.set(userId, validContext)
    return validContext
  }

  private startContextCleanup(): void {
    // clientReady fires again after a re-login; keep a single interval.
    if (this.contextCleanupTimer) return
    this.contextCleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [userId, context] of this.conversationContext.entries()) {
        const validMessages = context.filter(msg => now - msg.timestamp < this.contextConfig.maxAge)

        if (validMessages.length === 0) {
          this.conversationContext.delete(userId)
        } else if (validMessages.length !== context.length) {
          this.conversationContext.set(userId, validMessages)
        }
      }
    }, this.contextConfig.cleanupInterval)
  }

  private isOwner(userId: string): boolean {
    return userId === this.botOwnerID
  }

  private shouldTagEveryone(response: string, messageData: MessageData): boolean {
    if (!messageData.guild) return false
    if (!this.isOwner(messageData.author.id)) return false

    return messageData.content.toLowerCase().includes('@everyone')
  }

  private isRateLimited(userId: string): boolean {
    const limit = this.rateLimits.get(userId)
    if (!limit) return false

    const now = Date.now()
    if (now > limit.resetTime) {
      this.rateLimits.delete(userId)
      return false
    }

    return limit.count >= 10
  }

  private updateRateLimit(userId: string): void {
    const now = Date.now()
    const resetTime = now + 5 * 60 * 1000

    const existing = this.rateLimits.get(userId)
    if (!existing || now > existing.resetTime) {
      this.rateLimits.set(userId, { count: 1, resetTime })
    } else {
      existing.count++
    }
  }

  private formatResponseForDiscord(text: string): string {
    if (!text) return 'No response received.'

    let formatted = text.toString()

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '**$1**') // Bold
    formatted = formatted.replace(/\*(.*?)\*/g, '*$1*') // Italic
    formatted = formatted.replace(/`([^`]+)`/g, '`$1`') // Inline code

    formatted = formatted.replace(/```([\s\S]*?)```/g, '```$1```')

    formatted = formatted.replace(/\n{3,}/g, '\n\n')

    return formatted.trim()
  }

  private async sendLongMessage(channel: TextChannel | DMChannel, text: string): Promise<void> {
    const chunks = this.chunkMessage(text, 1900) // Leave some buffer

    for (const [i, chunk] of chunks.entries()) {
      const prefix = chunks.length > 1 ? `**part ${i + 1}/${chunks.length}**\\n\\n` : ''
      await channel.send(prefix + chunk)
    }
  }

  private chunkMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text]

    const chunks: string[] = []
    let currentChunk = ''

    const lines = text.split('\n')

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }

        if (line.length > maxLength) {
          const words = line.split(' ')
          let currentLine = ''

          for (const word of words) {
            if ((currentLine + word + ' ').length > maxLength) {
              if (currentLine) {
                chunks.push(currentLine.trim())
                currentLine = ''
              }
              currentLine = word + ' '
            } else {
              currentLine += word + ' '
            }
          }

          if (currentLine) {
            currentChunk = currentLine
          }
        } else {
          currentChunk = line + '\n'
        }
      } else {
        currentChunk += line + '\n'
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  private async getChannelHistory(
    channel: TextChannel | DMChannel,
    limit: number
  ): Promise<ChannelHistoryMessage[]> {
    try {
      const channelName = ('name' in channel ? channel.name : undefined) || 'DM'
      console.log(`fetching last ${limit} messages from channel ${channelName}`)

      const messages = await channel.messages.fetch({ limit })
      const processedMessages: ChannelHistoryMessage[] = []

      for (const [, message] of messages) {
        if (message.author.bot || message.system) continue

        const daysSinceMessage = (Date.now() - message.createdTimestamp) / (1000 * 60 * 60 * 24)
        if (daysSinceMessage > 7) continue

        if (message.content.trim()) {
          processedMessages.push({
            sender: message.author.displayName || message.author.username,
            senderId: message.author.id,
            content: message.content,
            timestamp: new Date(message.createdTimestamp).toLocaleString(),
            isFromBot: message.author.bot,
          })
        }
      }

      console.log(`Retrieved ${processedMessages.length} messages for context analysis`)
      return processedMessages.reverse()
    } catch (error) {
      console.error('Failed to fetch channel history:', error)
      return []
    }
  }

  private formatChatHistoryForAI(messages: ChannelHistoryMessage[]): string {
    if (!messages || messages.length === 0) {
      return 'No messages found.'
    }

    return messages.map(msg => `[${msg.timestamp}] ${msg.sender}: ${msg.content}`).join('\n')
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Discord bot...')
    this.shuttingDown = true
    this.isReady = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.contextCleanupTimer) {
      clearInterval(this.contextCleanupTimer)
      this.contextCleanupTimer = null
    }
    await this.client.destroy()
  }

  /**
   * Whether the gateway connection is up right now. Tracked from ClientReady/ShardReady/ShardResume
   * (up) and ShardReconnecting/ShardDisconnect/Invalidated/shutdown (down); unlike
   * {@link getClientInfo}, this goes false while discord.js is reconnecting.
   */
  isConnected(): boolean {
    return this.isReady
  }

  getClientInfo(): DiscordClientInfo {
    return {
      tag: this.client.user?.tag,
      id: this.client.user?.id,
      guilds: this.client.guilds.cache.size,
      users: this.client.users.cache.size,
    }
  }
}

export default DiscordService
