import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import DiscordService from './discord-service'
import type { AskRequest } from './discord-service'
import APIClient from './api-client'

dotenv.config({ quiet: true })

const sendMessageBodySchema = z.object({
  channelId: z.string().min(1),
  message: z.string().min(1),
})

const webhookBodySchema = z.object({
  type: z.unknown(),
  data: z.unknown(),
})

const packageJsonSchema = z.object({ version: z.string().optional() })

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

class DiscordBotServer {
  private app: express.Application
  private port: number
  private discordService: DiscordService | null = null
  private apiClient: APIClient | null = null

  constructor() {
    this.app = express()
    this.port = parseInt(process.env.PORT || '3002')

    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(helmet())

    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')
    this.app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
      })
    )

    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
    })
    this.app.use('/api/', limiter)

    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
      next()
    })
  }

  private setupRoutes(): void {
    // Liveness: always 200 while the process serves requests. `discordReady` reports the actual
    // gateway state (same convention as the WhatsApp service's `whatsappReady`).
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        discordReady: this.discordService?.isConnected() ?? false,
        memory: process.memoryUsage(),
        // Resolved at runtime relative to dist/ (or src/ under tsx); package.json is outside rootDir.
        version: packageJsonSchema.safeParse(require('../package.json')).data?.version,
      })
    })

    this.app.get('/api/discord/status', async (req, res) => {
      try {
        const info = this.discordService?.getClientInfo()
        res.json({
          ready: this.discordService?.isConnected() ?? false,
          clientInfo: info,
          uptime: process.uptime(),
        })
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get Discord status',
          message: errorMessage(error),
        })
      }
    })

    this.app.post('/api/discord/send', async (req, res) => {
      try {
        const body = sendMessageBodySchema.safeParse(req.body)

        if (!body.success) {
          res.status(400).json({
            error: 'Missing required fields: channelId and message',
          })
          return
        }

        if (!this.discordService) {
          res.status(503).json({
            error: 'Discord service is not ready',
          })
          return
        }

        res.json({
          success: true,
          message: 'Message sent successfully',
        })
      } catch (error) {
        console.error('Error in send message endpoint:', error)
        res.status(500).json({
          error: 'Internal server error',
          message: errorMessage(error),
        })
      }
    })

    this.app.post('/api/webhook', (req, res) => {
      try {
        const body = webhookBodySchema.safeParse(req.body)
        if (!body.success) {
          res.status(400).json({ error: 'Invalid webhook payload' })
          return
        }
        const { type, data } = body.data

        console.log(`Webhook received: ${String(type)}`)

        switch (type) {
          case 'system_message':
            this.handleSystemMessage(data)
            break
          default:
            console.warn(`Unknown webhook type: ${String(type)}`)
        }

        res.json({ success: true })
      } catch (error) {
        console.error('Webhook error:', error)
        res.status(500).json({
          error: 'Webhook processing failed',
          message: errorMessage(error),
        })
      }
    })

    this.app.post('/api/discord/restart', async (req, res) => {
      try {
        console.log('Restarting Discord service...')

        if (this.discordService) {
          await this.discordService.shutdown()
        }

        await this.setupDiscord()

        res.json({
          success: true,
          message: 'Discord service restarted successfully',
        })
      } catch (error) {
        console.error('Failed to restart Discord service:', error)
        res.status(500).json({
          error: 'Failed to restart Discord service',
          message: errorMessage(error),
        })
      }
    })

    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
      })
    })

    this.app.use(
      // Express detects error handlers by arity, so all four parameters must stay.
      (error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('❌ Express error:', error)
        res.status(500).json({
          error: 'Internal server error',
          message:
            process.env.NODE_ENV === 'development' ? errorMessage(error) : 'Something went wrong',
        })
      }
    )
  }

  private async setupDiscord(): Promise<void> {
    try {
      const discordToken = process.env.DISCORD_TOKEN
      const botOwnerId = process.env.BOT_OWNER_ID

      if (!discordToken) {
        throw new Error('DISCORD_TOKEN environment variable is required')
      }

      if (!botOwnerId) {
        throw new Error('BOT_OWNER_ID environment variable is required')
      }

      this.apiClient = new APIClient(
        process.env.MAIN_APP_URL || 'http://localhost:3000',
        process.env.MAIN_APP_API_KEY || 'default-key'
      )

      this.discordService = new DiscordService(discordToken, botOwnerId)
      this.setupDiscordHandlers()

      await this.discordService.initialize()
    } catch (error) {
      console.error('Failed to setup Discord service:', error)
      throw error
    }
  }

  private setupDiscordHandlers(): void {
    if (!this.discordService) return

    this.discordService.on('ready', () => {
      console.log('Discord service is ready and connected')
    })

    this.discordService.on('error', error => {
      console.error('Discord service error:', error)
    })

    // DiscordService handles reconnection itself (discord.js resumes recoverable drops; the service
    // re-logs in with backoff otherwise). This only fires once it has given up.
    this.discordService.on('disconnected', () => {
      console.error('Discord disconnected and automatic re-login gave up')
    })

    this.discordService.on('ask', async data => {
      await this.handleAskRequest(data)
    })
  }

  private async handleAskRequest(data: AskRequest): Promise<void> {
    const { messageData, question, conversationHistory = [], startTime, respondCallback } = data

    try {
      console.log(`Processing AI request for ${messageData.author.tag}: ${question}`)
      console.log(`Including ${conversationHistory.length} messages from conversation history`)

      if (!this.apiClient) {
        throw new Error('API client not initialized')
      }

      const response = await this.apiClient.sendChatRequest(
        question,
        {
          source: 'discord',
          userId: messageData.author.id,
          username: messageData.author.tag,
          channelId: messageData.channel?.id,
          guildId: messageData.guild?.id,
        },
        conversationHistory
      )

      const processingTimeMs = startTime ? Date.now() - startTime : null
      console.log(`Total processing time: ${processingTimeMs}ms`)

      if (respondCallback) {
        await respondCallback(response)
      }
    } catch (error) {
      console.error('Failed to process AI request:', error)

      if (respondCallback) {
        await respondCallback(
          { text: 'Sorry, I encountered an error processing your request. Please try again.' }
        )
      }
    }
  }

  private async handleSystemMessage(data: unknown): Promise<void> {
    console.log('System message received:', data)
  }

  async start(): Promise<void> {
    try {
      await this.setupDiscord()

      this.app.listen(this.port, error => {
        // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback.
        if (error) {
          console.error(`Failed to listen on port ${this.port}:`, error)
          return
        }
        console.log(`Discord Bot Server running on port ${this.port}`)
        console.log(`Health check: http://localhost:${this.port}/health`)
        console.log(`Discord status: http://localhost:${this.port}/api/discord/status`)
      })

      process.on('SIGINT', () => this.shutdown())
      process.on('SIGTERM', () => this.shutdown())
    } catch (error) {
      console.error('Failed to start server:', error)
      process.exit(1)
    }
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down Discord Bot Server...')

    try {
      if (this.discordService) {
        await this.discordService.shutdown()
      }

      console.log('Server shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error('Error during shutdown:', error)
      process.exit(1)
    }
  }
}

export default DiscordBotServer
