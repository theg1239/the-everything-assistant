declare namespace NodeJS {
  interface ProcessEnv {
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    NEXTAUTH_SECRET: string
    NODE_ENV: 'development' | 'production' | 'test'
    REDDIT_API_URL: string
    WHATSAPP_BOT_API_KEY: string
    EXAMCOOKER_API_KEY?: string
  }
}
