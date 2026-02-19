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
    CODEX_BIN?: string
    CODEX_FLAGS?: string
    CODEX_FLAGS_JSON?: string
    CODEX_APP_SERVER_FLAGS?: string
    CODEX_APP_SERVER_FLAGS_JSON?: string
    CODEX_APP_SERVER_HOME_ROOT?: string
    CODEX_APP_SERVER_STARTUP_TIMEOUT_MS?: string
    CODEX_APP_SERVER_REQUEST_TIMEOUT_MS?: string
    CODEX_APP_SERVER_TURN_TIMEOUT_MS?: string
    CODEX_APP_SERVER_MODEL?: string
    CODEX_APP_SERVER_CWD?: string
    CODEX_PROXY_URL?: string
    CODEX_PROXY_AUTH_TOKEN?: string
    CODEX_PROXY_TIMEOUT_MS?: string

    R2_ENDPOINT?: string
    R2_ACCESS_KEY_ID?: string
    R2_SECRET_ACCESS_KEY?: string
    R2_UPLOAD_BUCKET?: string
    R2_PUBLIC_BASE_URL?: string
  }
}
