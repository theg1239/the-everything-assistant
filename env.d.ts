declare namespace NodeJS {
  interface ProcessEnv {
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    SPOTIFY_CLIENT_ID?: string
    SPOTIFY_CLIENT_SECRET?: string
    NEXTAUTH_SECRET: string
    NODE_ENV: 'development' | 'production' | 'test'
    REDDIT_API_URL: string
    WHATSAPP_BOT_API_KEY: string
    EXAMCOOKER_API_KEY?: string
    PARALLEL_API_KEY?: string
    VTOP_MCP_URL?: string
    VTOP_PROXY_URL?: string
    VTOP_MCP_CLIENT_ID?: string

    R2_ENDPOINT?: string
    R2_ACCESS_KEY_ID?: string
    R2_SECRET_ACCESS_KEY?: string
    R2_UPLOAD_BUCKET?: string
    R2_PUBLIC_BASE_URL?: string
  }
}
