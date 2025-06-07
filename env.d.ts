declare namespace NodeJS {
  interface ProcessEnv {
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    NEXTAUTH_SECRET: string
    NODE_ENV: 'development' | 'production' | 'test'
  }
}
