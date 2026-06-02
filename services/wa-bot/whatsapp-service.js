const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const qrcode = require('qrcode-terminal')
const EventEmitter = require('events')

class WhatsAppService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.client = null
    this.isReady = false
    this.options = {
      sessionPath: options.sessionPath || './whatsapp-session',
      puppeteerArgs: options.puppeteerArgs || ['--no-sandbox', '--disable-setuid-sandbox'],
      ...options,
    }
    this.activeChats = new Map() // Track active conversations
    this.messageQueue = new Map() // Queue messages for users
    this.rateLimits = new Map() // Rate limiting per user
    this.recentBotMessages = new Set() // Track recent bot messages to prevent loops
    this.conversationContext = new Map() // Store recent conversation history per user
    this.contactLookupDisabled = false
    this.contactLookupDisabledReason = null
    this.contextConfig = {
      maxMessages: 10, // Keep last 10 messages per user
      maxAge: 30 * 60 * 1000, // 30 minutes in milliseconds
      cleanupInterval: 5 * 60 * 1000, // Cleanup every 5 minutes
    }
  }

  getChromePath() {
    const fs = require('fs')
    const chromePaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      'google-chrome',
      'chromium',
    ]

    for (const path of chromePaths) {
      try {
        if (path.startsWith('/') && fs.existsSync(path)) {
          console.log(`🌐 Using Chrome at: ${path}`)
          return path
        }
      } catch (error) {}
    }

    console.log('🌐 Using default Puppeteer Chromium')
    return undefined // Let Puppeteer use its bundled Chromium
  }

  async initialize() {
    try {
      console.log('🚀 Initializing WhatsApp client...')

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'wa-bot-client',
          dataPath: this.options.sessionPath,
        }),
        puppeteer: {
          headless: true,
          args: this.options.puppeteerArgs,
          executablePath: this.getChromePath(),
          timeout: 60000, // Increase timeout
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
        },
        webVersionCache: {
          type: 'remote',
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
      })

      this.setupEventHandlers()
      await this.client.initialize()
    } catch (error) {
      console.error('❌ Failed to initialize WhatsApp client:', error)
      this.emit('error', error)
      throw error
    }
  }

  addToContext(phoneNumber, message, isBot = false) {
    if (!this.conversationContext.has(phoneNumber)) {
      this.conversationContext.set(phoneNumber, [])
    }

    const context = this.conversationContext.get(phoneNumber)
    const timestamp = Date.now()

    context.push({
      content: message,
      timestamp,
      isBot,
      role: isBot ? 'assistant' : 'user',
    })

    while (context.length > this.contextConfig.maxMessages) {
      context.shift()
    }

    this.conversationContext.set(phoneNumber, context)
  }

  getContext(phoneNumber) {
    if (!this.conversationContext.has(phoneNumber)) {
      return []
    }

    const context = this.conversationContext.get(phoneNumber)
    const now = Date.now()

    const validContext = context.filter(msg => now - msg.timestamp < this.contextConfig.maxAge)

    this.conversationContext.set(phoneNumber, validContext)

    return validContext
  }

  clearContext(phoneNumber) {
    this.conversationContext.delete(phoneNumber)
  }

  cleanupContexts() {
    const now = Date.now()
    for (const [phoneNumber, context] of this.conversationContext.entries()) {
      const validMessages = context.filter(msg => now - msg.timestamp < this.contextConfig.maxAge)

      if (validMessages.length === 0) {
        this.conversationContext.delete(phoneNumber)
      } else if (validMessages.length !== context.length) {
        this.conversationContext.set(phoneNumber, validMessages)
      }
    }
  }

  startContextCleanup() {
    setInterval(() => {
      this.cleanupContexts()
    }, this.contextConfig.cleanupInterval)
  }

  setupEventHandlers() {
    this.client.on('qr', qr => {
      console.log('📱 Scan the QR code below to connect WhatsApp:')
      qrcode.generate(qr, { small: true })
      this.emit('qr', qr)
    })

    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!')
      console.log('📱 Client info:', this.client.info)
      this.isReady = true
      this.startContextCleanup() // Start conversation context cleanup
      this.emit('ready')
    })

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp client authenticated successfully')
      this.emit('authenticated')
    })

    this.client.on('auth_failure', msg => {
      console.error('❌ WhatsApp authentication failed:', msg)
      this.emit('auth_failure', msg)
    })

    this.client.on('disconnected', reason => {
      console.log('🔌 WhatsApp client disconnected:', reason)
      this.isReady = false
      this.emit('disconnected', reason)
    })

    this.client.on('message', async message => {
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
          isGif: message.isGif,
        })
        await this.handleIncomingMessage(message)
      } catch (error) {
        console.error('❌ Error handling incoming message:', error)
      }
    })

    this.client.on('message_create', async message => {
      try {
        console.log(`🔍 Message created:`, {
          fromMe: message.fromMe,
          body: message.body,
          from: message.from,
          to: message.to,
          author: message.author,
          deviceType: message.deviceType,
        })

        if (message.fromMe && message.body.startsWith('!')) {
          console.log('🎯 Processing your own command via message_create')
          await this.handleIncomingMessage(message)
        }
      } catch (error) {
        console.error('❌ Error handling message_create:', error)
      }
    })

    this.client.on('message_ack', (msg, ack) => {
      this.emit('message_ack', msg, ack)
    })

    this.client.on('group_join', notification => {
      console.log('👥 Group join:', notification)
    })

    this.client.on('group_leave', notification => {
      console.log('👋 Group leave:', notification)
    })

    this.client.on('message_revoke_everyone', (after, before) => {
      console.log('🗑️ Message deleted for everyone')
    })

    this.client.on('message_revoke_me', message => {
      console.log('🗑️ Message deleted for me')
    })

    this.client.on('change_state', state => {
      console.log('🔄 Client state changed:', state)
    })
  }

  getNormalizedContactId(message) {
    if (!message) {
      return null
    }

    const candidate =
      message.author || message.from || message.to || (message.id && message.id.participant)

    if (!candidate) {
      return null
    }

    if (candidate.endsWith('@lid')) {
      const [rawId] = candidate.split('@')
      if (!rawId) {
        return null
      }
      const [baseId] = rawId.split(':')
      if (!baseId) {
        return null
      }
      return `${baseId}@c.us`
    }

    return candidate
  }

  extractUserFromId(contactId) {
    if (!contactId) {
      return null
    }

    const [userPart] = contactId.split('@')
    if (!userPart) {
      return null
    }

    const [sanitizedUser] = userPart.split(':')
    return sanitizedUser || null
  }

  buildFallbackContact(message, normalizedId) {
    if (message && message.fromMe && this.client?.info?.wid) {
      const { wid, pushname } = this.client.info
      const user = wid?.user || this.extractUserFromId(normalizedId)
      const displayName = pushname || user || 'me'

      return {
        id: wid,
        number: user,
        user,
        pushname: displayName,
        name: displayName,
        userid: user,
      }
    }

    if (!normalizedId) {
      return null
    }

    const user = this.extractUserFromId(normalizedId)
    if (!user) {
      return null
    }

    const [, server] = normalizedId.split('@')

    return {
      id: {
        _serialized: normalizedId,
        user,
        server,
      },
      number: user,
      user,
      pushname: user,
      name: user,
      userid: user,
    }
  }

  shouldDisableContactLookup(error) {
    const message = error?.message || ''
    return message.includes('ContactMethods.getIsMyContact') || message.includes('getIsMyContact is not a function')
  }

  disableContactLookup(error) {
    if (this.contactLookupDisabled) {
      return
    }

    this.contactLookupDisabled = true
    this.contactLookupDisabledReason = error?.message || 'Unknown contact lookup error'
    console.warn('⚠️ Disabling contact lookups due to WhatsApp Web API mismatch', {
      error: this.contactLookupDisabledReason,
    })
  }

  async resolveContact(message, normalizedId = null) {
    if (!normalizedId) {
      normalizedId = this.getNormalizedContactId(message)
    }

    if (message?.fromMe) {
      const fallbackContact = this.buildFallbackContact(message, normalizedId)
      if (fallbackContact) {
        return fallbackContact
      }
    }

    if (!this.contactLookupDisabled) {
      try {
        return await message.getContact()
      } catch (error) {
        if (this.shouldDisableContactLookup(error)) {
          this.disableContactLookup(error)
        }

        console.warn('⚠️ Failed to get contact via message.getContact', {
          messageId: message?.id?._serialized,
          rawAuthor: message?.author,
          rawFrom: message?.from,
          rawTo: message?.to,
          error: error?.message,
        })
      }
    }

    if (normalizedId && !this.contactLookupDisabled) {
      try {
        return await this.resolveContactById(normalizedId)
      } catch (fallbackError) {
        if (this.shouldDisableContactLookup(fallbackError)) {
          this.disableContactLookup(fallbackError)
        }

        console.warn('⚠️ Fallback contact lookup failed', {
          normalizedId,
          error: fallbackError?.message,
        })
      }
    }

    return this.buildFallbackContact(message, normalizedId)
  }

  async resolveContactById(contactId) {
    if (!contactId || !this.client || this.contactLookupDisabled) {
      return null
    }

    const candidateId =
      typeof contactId === 'string' ? contactId : contactId?._serialized || contactId?.id

    if (!candidateId) {
      return null
    }

    const normalizedId = candidateId.endsWith('@lid')
      ? this.getNormalizedContactId({ author: candidateId })
      : candidateId

    if (!normalizedId) {
      return null
    }

    const rawContact = await this.client.getContactById(normalizedId)
    if (!rawContact) {
      return null
    }

    const contact = Array.isArray(rawContact) ? rawContact[0] : rawContact
    if (contact && !contact.id) {
      contact.id = {
        _serialized: normalizedId,
        user: this.extractUserFromId(normalizedId),
        server: normalizedId.split('@')[1],
      }
    }

    return contact
  }

  parseContextCommandArgs(rawArgs) {
    if (!rawArgs) {
      return { question: '', limit: null }
    }

    let working = rawArgs.trim()
    if (!working) {
      return { question: '', limit: null }
    }

    let limit = null

    const limitRegex = /\blimit\s*[:=]\s*(\d+)\b/i
    const labeledMatch = working.match(limitRegex)
    if (labeledMatch) {
      limit = parseInt(labeledMatch[1], 10)
      working = (
        working.slice(0, labeledMatch.index) +
        working.slice(labeledMatch.index + labeledMatch[0].length)
      ).trim()
    } else {
      const limitWordMatch = working.match(/^limit\s+(\d+)(?:\s+([\s\S]*))?$/i)
      if (limitWordMatch) {
        limit = parseInt(limitWordMatch[1], 10)
        working = (limitWordMatch[2] || '').trim()
      } else {
        const leadingMatch = working.match(/^(\d+)(?:\s+([\s\S]*))?$/)
        if (leadingMatch) {
          limit = parseInt(leadingMatch[1], 10)
          working = (leadingMatch[2] || '').trim()
        }
      }
    }

    if (Number.isNaN(limit) || limit <= 0) {
      limit = null
    }

    return {
      question: working,
      limit,
    }
  }

  async fetchAllChatMessages(chat, options = {}) {
    const { batchSize = 200, maxMessages = 800, yieldToLoop = false } = options

    const messages = []
    const seenMessageIds = new Set()
    const effectiveBatchSize = Math.max(1, Math.min(Math.floor(batchSize) || 1, 300))

    let remaining = Math.max(maxMessages, 0)
    let cursor = null

    while (remaining > 0) {
      const limit = Math.min(effectiveBatchSize, remaining)
      const fetchOptions = { limit }
      if (cursor) {
        fetchOptions.before = cursor
      }

      const batch = await chat.fetchMessages(fetchOptions)
      if (!batch || batch.length === 0) {
        break
      }

      for (const message of batch) {
        const serializedId = message?.id?._serialized
        if (serializedId && seenMessageIds.has(serializedId)) {
          continue
        }

        messages.push(message)
        if (serializedId) {
          seenMessageIds.add(serializedId)
        }

        remaining -= 1
        if (remaining <= 0) {
          break
        }
      }

      if (batch.length < limit || remaining <= 0) {
        break
      }

      cursor = batch[batch.length - 1]

      if (yieldToLoop) {
        await this.delay(0)
      }
    }

    return messages
  }

  async handleIncomingMessage(message) {
    if (!this.isReady || message.isStatus) {
      return
    }

    try {
      const normalizedContactId = this.getNormalizedContactId(message)
      const contact = await this.resolveContact(message, normalizedContactId)
      const chat = await message.getChat()
      const messageBody = (message.body || '').trim()

      const selfNumber = this.client?.info?.wid?.user
      const contactNumber = message.fromMe
        ? selfNumber ||
          contact?.id?.user ||
          this.extractUserFromId(normalizedContactId) ||
          'unknown'
        : contact?.id?.user ||
          contact?.userid ||
          this.extractUserFromId(normalizedContactId) ||
          message.author ||
          message.from ||
          'unknown'

      const contactName =
        contact?.name ||
        contact?.pushname ||
        (message.fromMe && this.client?.info?.pushname) ||
        contactNumber

      console.log(`🔍 Debug - Message details:`, {
        fromMe: message.fromMe,
        body: messageBody.substring(0, 50),
        messageId: message.id?._serialized || 'unknown',
        contactNumber,
        contactName,
        isCommand: messageBody.startsWith('!'),
      })

      const messageType = message.fromMe ? '🤖 Self' : '👤 User'
      console.log(`📨 ${messageType} message from ${contactName}: ${messageBody}`)

      if (!message.fromMe && this.isRateLimited(contactNumber)) {
        console.log(`🚫 Rate limited user: ${contactNumber}`)
        return
      }

      if (!message.fromMe) {
        this.updateRateLimit(contactNumber)
      }

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
        fromMe: message.fromMe, // Track if message is from the bot itself
      }

      if (!message.isStatus && messageBody && messageBody.trim().length > 0) {
        const isCommand = messageBody.startsWith('!')
        const isBotResponse = message.fromMe

        if (isCommand || isBotResponse) {
          const contextKey = chat.isGroup ? contactNumber : chat.id._serialized
          this.addToContext(contextKey, messageBody, message.fromMe)

          const messageType = isCommand ? 'command' : 'bot response'
          console.log(
            `💾 Stored ${messageType} in context for ${contextKey}: "${messageBody.substring(0, 50)}..."`
          )
        }
      }

      this.emit('message', messageData)

      if (messageBody.startsWith('!')) {
        const isBotResponse =
          message.fromMe &&
          (messageBody.includes('*The Everything Assistant*') ||
            messageBody.includes('📄 *Part') ||
            messageBody.includes('Bot Status') ||
            messageBody.includes('Available Commands') ||
            this.recentBotMessages.has(message.id._serialized))

        if (!isBotResponse) {
          console.log(`🎯 Processing command from ${messageType}: ${messageBody}`)
          await this.handleCommand(messageData, message)
        } else {
          console.log(`🚫 Skipping bot's own response: ${messageBody.substring(0, 50)}...`)
        }
      }
    } catch (error) {
      console.error('❌ Error handling incoming message:', error)
    }
  }

  async handleCommand(messageData, originalMessage) {
    const { body, from, fromName, chatId, isGroup } = messageData
    const command = body.toLowerCase().split(' ')[0]
    const args = body.slice(command.length).trim()
    const botOwnerNumber = '917975100121' // Your phone number
    const isBotOwner = messageData.fromMe || from === botOwnerNumber

    console.log(`🤖 Processing command: ${command} from ${fromName}`)

    const originalChat = await originalMessage.getChat()
    const userChat = await this.getUserPersonalChat(from)

    if (!userChat) {
      console.error(`❌ Could not get personal chat for ${from}`)
      return
    }

    switch (command) {
      case '!ask':
        if (!args) {
          await this.sendMessageToChat(
            originalChat,
            'please provide a question after !ask\n\nexample: !ask what is the mess menu today?'
          )
          return
        }
        await this.handleAskCommand(originalChat, userChat, from, fromName, args, messageData)
        break

      case '!context':
        const { question, limit } = this.parseContextCommandArgs(args)
        const questionText = question || 'what has been happening in this chat recently?'
        await this.handleContextCommand(
          originalChat,
          userChat,
          from,
          fromName,
          questionText,
          messageData,
          { limit }
        )
        break

      case '!help':
        if (isGroup) {
          await this.sendMessageToChat(originalChat, `sent help info to ${fromName} in dm`)
        }
        await this.sendHelpMessage(userChat)
        break

      case '!status':
        await this.sendStatusMessage(originalChat)
        break

      case '!no':
        await this.handleNoCommand(originalChat)
        break

      case '!linkvtop':
      case '!vtoplink':
      case '!link':
        await this.handleLinkVtopCommand(originalChat, userChat, from, fromName, messageData)
        break

      case '!everyone':
        if (!isGroup) {
          await this.sendMessageToChat(
            originalChat,
            'the !everyone command only works in group chats'
          )
        } else if (from !== botOwnerNumber) {
          await this.sendMessageToChat(
            originalChat,
            'only the bot owner can use the !everyone command'
          )
        } else {
          const message = args || 'hey everyone! 👋'
          const taggedMessage = await this.formatResponseWithTags(message, originalChat, true)
          await this.sendMessageToChat(originalChat, taggedMessage)
        }
        break

      default:
        await this.sendMessageToChat(
          originalChat,
          `unknown command: ${command}\n\ntype !help to see available commands`
        )
        break
    }
  }

  async handleAskCommand(originalChat, userChat, phoneNumber, userName, question, messageData) {
    try {
      console.log(`🧠 Processing AI request from ${userName}: ${question}`)

      const contextKey = messageData.isGroup ? phoneNumber : originalChat.id._serialized
      const conversationHistory = this.getContext(contextKey)

      console.log(
        `📚 Found ${conversationHistory.length} messages in conversation history for ${userName}`
      )

      await this.sendTypingToChat(originalChat)

      const startTime = Date.now()

      this.emit('ask', {
        originalChat,
        userChat,
        phoneNumber,
        userName,
        question,
        messageData,
        startTime,
        conversationHistory, // Include conversation context
        respondCallback: response =>
          this.handleAIResponseSmart(originalChat, userChat, response, startTime, messageData),
      })
    } catch (error) {
      console.error('❌ Error in handleAskCommand:', error)
      await this.sendMessageToChat(
        originalChat,
        'sorry, i encountered an error processing your request. please try again.'
      )
    }
  }

  async handleLinkVtopCommand(originalChat, userChat, phoneNumber, userName, messageData) {
    try {
      const baseUrl = process.env.MAIN_APP_URL || 'http://localhost:3000'
      const apiKey = process.env.MAIN_APP_API_KEY || process.env.WHATSAPP_BOT_API_KEY
      const res = await fetch(`${baseUrl}/api/whatsapp/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ phoneNumber, userName }),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('link vtop failed', res.status, text)
        await this.sendMessageToChat(
          userChat,
          'could not generate a secure link right now. please try again later.'
        )
        return
      }

      const json = await res.json()
      const linkMsg = `🔗 VTOP secure link\n\nTap: ${json.link}\n\nExpires in ~10 minutes. After approving, come back here and run your VTOP command (e.g., attendance).`

      if (messageData.isGroup) {
        await this.sendMessageToChat(originalChat, `sent a secure VTOP link to ${userName} in dm`)
      }

      await this.sendMessageToChat(userChat, linkMsg)
    } catch (err) {
      console.error('handleLinkVtopCommand error', err)
      await this.sendMessageToChat(
        userChat,
        'something went wrong while creating the link. please try again in a bit.'
      )
    }
  }

  async handleNoCommand(chat) {
    const fallbackMessage =
      "The API is down so I guess I'll just reject you manually - no"

    try {
      const response = await fetch('https://naas.isalman.dev/no', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'WhatsApp-Bot-Service/1.0.0',
        },
      })

      if (!response.ok) {
        throw new Error(`NaaS request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const reason = typeof data?.reason === 'string' ? data.reason.trim() : ''

      await this.sendMessageToChat(chat, reason || fallbackMessage)
    } catch (error) {
      console.error('❌ Error in handleNoCommand:', error)
      await this.sendMessageToChat(chat, fallbackMessage)
    }
  }

  async handleContextCommand(
    originalChat,
    userChat,
    phoneNumber,
    userName,
    question,
    messageData,
    options = {}
  ) {
    try {
      const trimmedQuestion = (question || '').trim()
      const questionText = trimmedQuestion || 'what has been happening in this chat recently?'
      const limitOverride = options?.limit ?? null

      let sanitizedLimit = null
      if (
        limitOverride !== null &&
        Number.isFinite(limitOverride) &&
        !Number.isNaN(limitOverride)
      ) {
        sanitizedLimit = Math.min(Math.max(Math.floor(limitOverride), 20), 2000)
      } else if (limitOverride !== null) {
        console.warn('⚠️ Invalid limit override provided for !context, ignoring.', {
          limitOverride,
        })
      }

      console.log(`📚 Processing context request from ${userName}: ${questionText}`, {
        limitOverride: sanitizedLimit,
      })

      await this.sendTypingToChat(originalChat)

      const defaultLimit = 150
      const maxAutoLimit = 800
      const fetchAllThreshold = 220 // avoid large single fetches without explicit limit

      let historyLimit =
        sanitizedLimit ?? (trimmedQuestion ? Math.min(maxAutoLimit, 250) : defaultLimit)
      historyLimit = Math.max(20, Math.min(historyLimit, maxAutoLimit))

      const fetchAll = historyLimit > fetchAllThreshold
      const maxAgeDays = sanitizedLimit !== null ? null : trimmedQuestion ? null : 7
      const batchSize = fetchAll
        ? Math.min(200, Math.max(50, Math.floor(historyLimit / 2)))
        : Math.max(20, historyLimit)

      const recentMessages = await this.getChatHistory(originalChat, historyLimit, {
        fetchAll,
        maxMessages: historyLimit,
        maxAgeDays,
        batchSize,
        yieldToLoop: true,
      })

      if (recentMessages.length === 0) {
        await this.sendMessageToChat(
          originalChat,
          'no recent messages found in this chat to analyze.'
        )
        return
      }

      const contextText = this.formatChatHistoryForAI(recentMessages)

      const analysisPrompt = `You are analyzing a WhatsApp chat history to answer the user's question.

Question: "${questionText}"

Chat History (last ${recentMessages.length} messages):
${contextText}

Please provide a helpful summary and answer based on the chat context. Focus on:
- Recent topics and discussions
- Important information or decisions
- Any ongoing conversations or plans
- Answer the specific question asked

Keep the response concise but informative.`

      const startTime = Date.now()

      this.emit('ask', {
        originalChat,
        userChat,
        phoneNumber,
        userName,
        question: analysisPrompt,
        messageData: { ...messageData, isContextAnalysis: true, contextLimit: historyLimit },
        startTime,
        conversationHistory: [], // Don't include previous context for this analysis
        respondCallback: response =>
          this.handleAIResponseSmart(originalChat, userChat, response, startTime, messageData),
      })
    } catch (error) {
      console.error('❌ Error in handleContextCommand:', error)
      await this.sendMessageToChat(
        originalChat,
        'sorry, i encountered an error analyzing the chat context. please try again.'
      )
    }
  }

  async getChatHistory(chat, limit = 100, options = {}) {
    try {
      const {
        fetchAll = false,
        maxMessages = limit,
        maxAgeDays = 7,
        batchSize = 200,
        yieldToLoop = false,
      } = options

      const maxCount = Math.max(maxMessages || limit || 100, 1)

      console.log(`📖 Fetching chat history for ${chat.name || chat.id.user}`, {
        fetchAll,
        requestedLimit: limit,
        maxMessages: maxCount,
        maxAgeDays,
        batchSize,
      })

      let messages
      if (fetchAll) {
        messages = await this.fetchAllChatMessages(chat, {
          maxMessages: maxCount,
          batchSize,
          yieldToLoop,
        })
      } else {
        const directLimit = Math.min(maxCount, Math.max(1, Math.floor(batchSize) || 1))
        messages = await chat.fetchMessages({ limit: directLimit })
      }

      if (!messages || messages.length === 0) {
        return []
      }

      const chronologicalMessages = messages.slice().reverse()

      const processedMessages = []
      const contactCache = new Map()
      for (const message of chronologicalMessages) {
        if (message.isStatus || message.type === 'notification') {
          continue
        }

        const timestamp = new Date(message.timestamp * 1000)
        if (typeof maxAgeDays === 'number' && maxAgeDays >= 0) {
          const daysSinceMessage = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24)
          if (daysSinceMessage > maxAgeDays) {
            continue
          }
        }

        let messageText = message.body || ''
        if (message.hasMedia) {
          const mediaType = message.type
          messageText = `[${mediaType}${messageText ? ': ' + messageText : ''}]`
        } else if (message.type === 'location') {
          messageText = '[Location shared]'
        } else if (message.type === 'vcard') {
          messageText = '[Contact shared]'
        }

        if (!messageText.trim()) {
          continue
        }

        const normalizedId = this.getNormalizedContactId(message)
        const contact = await this.resolveContact(message, normalizedId)
        const senderNumber =
          contact?.id?.user ||
          contact?.userid ||
          this.extractUserFromId(normalizedId) ||
          message.from ||
          'unknown'
        const senderName =
          contact?.pushname ||
          contact?.name ||
          (message.fromMe ? this.client?.info?.pushname || 'Bot' : senderNumber)

        processedMessages.push({
          sender: senderName,
          senderNumber,
          text: messageText,
          timestamp: timestamp.toLocaleString(),
          isFromMe: message.fromMe,
        })

        if (processedMessages.length >= maxCount) {
          break
        }
      }

      if (processedMessages.length === 0) {
        return []
      }

      console.log(`📊 Retrieved ${processedMessages.length} messages for context analysis`)
      return processedMessages
    } catch (error) {
      console.error('Failed to fetch chat history:', error)
      return []
    }
  }

  formatChatHistoryForAI(messages) {
    if (!messages || messages.length === 0) {
      return 'No messages found.'
    }

    const formatted = messages
      .map(msg => {
        const senderName = msg.isFromMe ? 'Bot' : msg.sender
        return `[${msg.timestamp}] ${senderName}: ${msg.text}`
      })
      .join('\n')

    return formatted
  }

  async handleAIResponseSmart(originalChat, userChat, response, startTime, messageData) {
    try {
      const endTime = Date.now()
      const duration = endTime - startTime
      const botOwnerNumber = '917975100121' // Your phone number

      console.log(`✅ AI Response ready in ${duration}ms`)

      const responseText = typeof response === 'string' ? response : response?.text || ''
      const reasoningText = typeof response === 'object' ? response?.reasoning || '' : ''

      if (!responseText || responseText.trim() === '') {
        console.warn('⚠️ Empty response received from AI')
        await this.sendMessageToChat(
          originalChat,
          "sorry, i couldn't generate a response. please try asking again."
        )
        return
      }

      let thinkingMessage = null
      if (reasoningText.trim()) {
        try {
          const reasoningDisplay = `💭 thinking...\n${this.formatResponseForWhatsApp(reasoningText)}`
          thinkingMessage = await originalChat.sendMessage(reasoningDisplay)
        } catch (err) {
          console.warn('⚠️ Failed to send reasoning message:', err?.message || err)
        }
      }

      const shouldTagEveryone = this.shouldTagEveryone(responseText, messageData)

      const formattedResponse = await this.formatResponseWithTags(
        responseText,
        originalChat,
        shouldTagEveryone
      )
      const responseLength = formattedResponse.text.length
      const isLongResponse = responseLength > 300 // Threshold for smart routing
      const isBotOwner = messageData.from === botOwnerNumber

      console.log(
        `📏 Response length: ${responseLength} chars, ${isLongResponse ? (isBotOwner ? 'bot owner - sending in current chat' : 'sending to DM') : 'sending in current chat'}${shouldTagEveryone ? ' with @everyone tags' : ''}`
      )

      // If we showed reasoning, keep the final message in the same chat to mimic an edit.
      if (reasoningText.trim()) {
        await this.sendMessageToChat(originalChat, formattedResponse)
      } else if (isLongResponse && messageData.isGroup && !isBotOwner) {
        await this.sendMessageToChat(originalChat, `sent a detailed response in dm`)
        await this.sendMessageToChat(userChat, formattedResponse)
      } else {
        await this.sendMessageToChat(originalChat, formattedResponse)
      }

      if (thinkingMessage && typeof thinkingMessage.delete === 'function') {
        try {
          await thinkingMessage.delete(true) // try delete for everyone (if supported)
        } catch (err) {
          try {
            await thinkingMessage.delete()
          } catch (err2) {
            console.warn('⚠️ Failed to delete reasoning message:', err2?.message || err2)
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in handleAIResponseSmart:', error)
      await this.sendMessageToChat(
        originalChat,
        'sorry, there was an error processing the response. please try again.'
      )
    }
  }

  shouldTagEveryone(response, messageData) {
    if (!messageData.isGroup) {
      return false
    }

    const botOwnerNumber = '917975100121' // Your phone number
    if (messageData.from !== botOwnerNumber) {
      return false
    }

    const userMessage = messageData.body.toLowerCase()
    const hasEveryoneTrigger = userMessage.includes('@everyone')

    if (hasEveryoneTrigger) {
      console.log(`🏷️ Tagging everyone - @everyone found in user message from bot owner`)
      return true
    }

    return false
  }

  async handleAIResponse(chat, response, startTime) {
    try {
      const processingTimeMs = startTime ? Date.now() - startTime : null
      console.log(`⚡ AI response processed in ${processingTimeMs}ms`)

      let responseText = ''
      if (typeof response === 'string') {
        responseText = response
      } else if (response && response.text) {
        responseText = response.text
      } else {
        await this.sendMessageToChat(chat, 'received an invalid response. please try again.')
        return
      }

      const formattedResponse = this.formatResponseForWhatsApp(responseText)
      await this.sendLongMessageToChat(chat, formattedResponse)
    } catch (error) {
      console.error('Error sending AI response:', error)
      await this.sendMessageToChat(chat, 'failed to send response. please try again.')
    }
  }

  formatResponseForWhatsApp(text) {
    if (!text) return 'no response received.'

    let formatted = text

    formatted = formatted.replace(/\\n/g, '\n')

    formatted = formatted.replace(/\\t/g, '\t')
    formatted = formatted.replace(/\\r/g, '\r')

    formatted = formatted.replace(/_\s+_([^:]+):_/g, '• *$1:*')

    formatted = formatted.replace(/^\s*[\*\-\+]\s+/gm, '• ')
    formatted = formatted.replace(/^\s*_\s+/gm, '• ')

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*')

    formatted = formatted.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '_$1_')

    formatted = formatted.replace(/(?<!•\s)_([^_\n:]+)_/g, '_$1_')

    formatted = formatted.replace(/^\s*(\d+)\.\s+/gm, '$1. ')

    formatted = formatted.replace(/_([^_:]+):\*/g, '*$1:*')

    formatted = formatted.replace(/\*{3,}/g, '*')

    formatted = formatted.replace(/```[\s\S]*?```/g, match => {
      return match.replace(/```/g, '').trim()
    })

    formatted = formatted.replace(/`([^`]+)`/g, '$1')

    formatted = formatted.replace(/\n{3,}/g, '\n\n')

    formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    formatted = formatted.replace(/<[^>]*>/g, '')

    formatted = formatted.replace(/•\s*/g, '• ')

    formatted = formatted.replace(
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
      ''
    )

    formatted = formatted.replace(/\*\s*\*/g, '')
    formatted = formatted.replace(/_\s*_/g, '')

    formatted = formatted.trim()

    console.log('Formatted response:', formatted.substring(0, 200) + '...')

    return formatted
  }

  async getUserPersonalChat(phoneNumber) {
    try {
      const personalChatId = `${phoneNumber}@c.us`
      const personalChat = await this.client.getChatById(personalChatId)

      console.log(`Got personal chat for ${phoneNumber}`)
      return personalChat
    } catch (error) {
      console.error(`Failed to get personal chat for ${phoneNumber}:`, error)
      return null
    }
  }

  async getGroupParticipants(chat) {
    try {
      if (!chat.isGroup) {
        return []
      }

      const participants = chat.participants
      console.log(`Found ${participants.length} participants in group ${chat.name}`)
      return participants
    } catch (error) {
      console.error('Failed to get group participants:', error)
      return []
    }
  }

  async formatResponseWithTags(response, chat, shouldTagEveryone = false) {
    let formatted = this.formatResponseForWhatsApp(response)

    if (shouldTagEveryone && chat.isGroup) {
      try {
        const participants = await this.getGroupParticipants(chat)

        const mentions = []
        const mentionText = []

        for (const participant of participants) {
          if (participant.id._serialized === this.client.info.wid._serialized) {
            continue
          }

          mentions.push(participant.id._serialized)
          const displayName = participant.pushname || participant.id.user
          mentionText.push(`@${displayName}`)
        }

        if (mentions.length > 0) {
          const tagLine = `🔔 ${mentionText.join(' ')}\n\n`
          formatted = tagLine + formatted

          console.log(`🏷️ Prepared ${mentions.length} mentions for group response`)

          return {
            text: formatted,
            mentions: mentions,
          }
        }
      } catch (error) {
        console.error('Failed to add group mentions:', error)
      }
    }

    return {
      text: formatted,
      mentions: [],
    }
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

!no - get a random rejection reason
   example: !no

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

powered by the everything assistant ai system`

    await this.sendMessageToChat(chat, helpText)
  }

  async sendStatusMessage(chat) {
    const uptimeMinutes = Math.floor(process.uptime() / 60)
    const uptimeHours = Math.floor(uptimeMinutes / 60)
    const displayUptime =
      uptimeHours > 0 ? `${uptimeHours}h ${uptimeMinutes % 60}m` : `${uptimeMinutes}m`

    const statusText = `the everything assistant status

service: online and operational
uptime: ${displayUptime}
active conversations: ${this.activeChats.size}
whatsapp connection: ${this.isReady ? 'connected' : 'disconnected'}

all systems running normally`

    await this.sendMessageToChat(chat, statusText)
  }

  async sendMessage(phoneNumber, text) {
    if (!this.isReady) {
      console.error('WhatsApp client is not ready')
      return false
    }

    try {
      const chatId = `${phoneNumber}@c.us`
      await this.client.sendMessage(chatId, text)
      console.log(`Message sent to ${phoneNumber}: ${text.substring(0, 50)}...`)
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }

  async sendMessageToChat(chat, messageData) {
    if (!this.isReady) {
      console.error('WhatsApp client is not ready')
      return false
    }

    try {
      let sentMessage

      if (typeof messageData === 'string') {
        sentMessage = await chat.sendMessage(messageData)
        console.log(
          `Message sent to chat ${chat.name || chat.id.user}: ${messageData.substring(0, 50)}...`
        )
      } else if (messageData && messageData.text) {
        if (messageData.mentions && messageData.mentions.length > 0) {
          sentMessage = await chat.sendMessage(messageData.text, {
            mentions: messageData.mentions,
          })
          console.log(
            `Message with ${messageData.mentions.length} mentions sent to chat ${chat.name || chat.id.user}: ${messageData.text.substring(0, 50)}...`
          )
        } else {
          sentMessage = await chat.sendMessage(messageData.text)
          console.log(
            `Message sent to chat ${chat.name || chat.id.user}: ${messageData.text.substring(0, 50)}...`
          )
        }
      } else {
        console.error('Invalid message data provided')
        return false
      }

      if (sentMessage && sentMessage.id) {
        this.recentBotMessages.add(sentMessage.id._serialized)
        setTimeout(
          () => {
            this.recentBotMessages.delete(sentMessage.id._serialized)
          },
          5 * 60 * 1000
        )
      }

      return true
    } catch (error) {
      console.error('Failed to send message to chat:', error)
      return false
    }
  }

  async sendLongMessage(phoneNumber, text, chunkSize = 4000) {
    if (!text || text.length <= chunkSize) {
      return await this.sendMessage(phoneNumber, text || '❌ Empty response received.')
    }

    const chunks = this.splitMessage(text, chunkSize)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const prefix = chunks.length > 1 ? `📄 *Part ${i + 1}/${chunks.length}*\n\n` : ''

      await this.sendMessage(phoneNumber, prefix + chunk)

      if (i < chunks.length - 1) {
        await this.delay(1000)
      }
    }
  }

  async sendLongMessageToChat(chat, text, chunkSize = 4000) {
    if (!text || text.length <= chunkSize) {
      return await this.sendMessageToChat(chat, text || 'empty response received.')
    }

    const chunks = this.splitMessage(text, chunkSize)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const prefix = chunks.length > 1 ? `message part ${i + 1} of ${chunks.length}\n\n` : ''

      await this.sendMessageToChat(chat, prefix + chunk)

      if (i < chunks.length - 1) {
        await this.delay(1000)
      }
    }
  }

  splitMessage(text, chunkSize = 4000) {
    const chunks = []
    let currentChunk = ''

    const lines = text.split('\n')

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > chunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }

        if (line.length > chunkSize) {
          const lineChunks = line.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || []
          chunks.push(...lineChunks)
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

    return chunks.length > 0 ? chunks : [text]
  }

  async sendTyping(phoneNumber) {
    try {
      const chatId = `${phoneNumber}@c.us`
      const chat = await this.client.getChatById(chatId)
      await chat.sendStateTyping()
    } catch (error) {
      console.error('❌ Failed to send typing indicator:', error)
    }
  }

  async sendTypingToChat(chat) {
    try {
      await chat.sendStateTyping()
    } catch (error) {
      console.error('❌ Failed to send typing indicator to chat:', error)
    }
  }

  isRateLimited(phoneNumber) {
    const now = Date.now()
    const userLimits = this.rateLimits.get(phoneNumber)

    if (!userLimits) {
      return false
    }

    const windowMs = 15 * 60 * 1000
    const maxMessages = 10

    const recentMessages = userLimits.filter(timestamp => now - timestamp < windowMs)
    return recentMessages.length >= maxMessages
  }

  updateRateLimit(phoneNumber) {
    const now = Date.now()
    const windowMs = 15 * 60 * 1000

    if (!this.rateLimits.has(phoneNumber)) {
      this.rateLimits.set(phoneNumber, [])
    }

    const userLimits = this.rateLimits.get(phoneNumber)

    userLimits.push(now)

    const recentMessages = userLimits.filter(timestamp => now - timestamp < windowMs)
    this.rateLimits.set(phoneNumber, recentMessages)
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async getClientInfo() {
    if (!this.isReady) {
      return null
    }

    try {
      const info = this.client.info
      return {
        wid: info.wid,
        pushname: info.pushname,
        platform: info.platform,
        isReady: this.isReady,
      }
    } catch (error) {
      console.error('Failed to get client info:', error)
      return null
    }
  }

  async testSelfMessaging(phoneNumber) {
    if (!this.isReady) {
      console.error('WhatsApp client is not ready for testing')
      return false
    }

    try {
      console.log('Testing self-messaging capability...')
      const chatId = `${phoneNumber}@c.us`
      const chat = await this.client.getChatById(chatId)

      console.log('Chat info:', {
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup,
        isReadOnly: chat.isReadOnly,
      })

      await this.sendMessageToChat(
        chat,
        'test message - if you see this, the everything assistant is working'
      )
      return true
    } catch (error) {
      console.error('Self-messaging test failed:', error)
      return false
    }
  }

  async shutdown() {
    console.log('Shutting down WhatsApp service...')

    if (this.client) {
      try {
        await this.client.destroy()
        console.log('WhatsApp client destroyed successfully')
      } catch (error) {
        console.error('Error destroying WhatsApp client:', error)
      }
    }

    this.isReady = false
    this.emit('shutdown')
  }
}

module.exports = WhatsAppService
