import DiscordBotServer from './server'

const createServer = (): DiscordBotServer => {
  try {
    return new DiscordBotServer()
  } catch (error) {
    // e.g. DISCORD_BOT_API_SECRET missing: fail closed with a readable message.
    console.error(`Failed to start Discord Bot Server: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (require.main === module) {
  const server = createServer()
  server.start().catch(error => {
    console.error('Failed to start Discord Bot Server:', error)
    process.exit(1)
  })
}

export default DiscordBotServer
