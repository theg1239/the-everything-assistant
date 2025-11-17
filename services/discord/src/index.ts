import DiscordBotServer from './server'

if (require.main === module) {
  const server = new DiscordBotServer()
  server.start().catch(error => {
    console.error('Failed to start Discord Bot Server:', error)
    process.exit(1)
  })
}

export default DiscordBotServer
