# Discord Bot - The Everything Assistant

A Discord bot version of The Everything Assistant with AI-powered responses, conversation context, and advanced features.

## Features

- 🤖 **AI Assistant**: Ask questions about academics, VIT, or general topics
- 📚 **Context Analysis**: Analyze recent channel history (owner only)
- 🔔 **@everyone Tags**: Tag everyone in servers (owner only)
- 💬 **Conversation Memory**: Maintains context across conversations
- 🛡️ **Rate Limiting**: Built-in protection against spam
- 📊 **Smart Routing**: Long responses sent to DMs (except for owner)
- 🎯 **Owner Privileges**: Special features for the bot owner

## Commands

### General Commands
- `!ask [question]` - Ask the AI assistant anything
- `!status` - Check bot status and uptime
- `!help` - Show available commands

### Owner-Only Commands
- `!context [question]` - Analyze recent channel history
- `!everyone [message]` - Tag everyone in the server

## Setup Instructions

### 1. Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token
5. Under "Privileged Gateway Intents", enable:
   - Server Members Intent
   - Message Content Intent

### 2. Bot Permissions

When inviting the bot to your server, make sure it has these permissions:
- Send Messages
- Read Messages
- Read Message History
- Use External Emojis
- Embed Links
- Mention Everyone (for @everyone functionality)

### 3. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your configuration:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   BOT_OWNER_ID=your_discord_user_id_here
   MAIN_APP_URL=http://localhost:3000
   MAIN_APP_API_KEY=default-key
   ```

3. To get your Discord User ID:
   - Enable Developer Mode in Discord (User Settings > App Settings > Advanced > Developer Mode)
   - Right-click your username and select "Copy User ID"

### 4. Installation and Running

```bash
# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run in development mode
npm run dev

# Run in production mode
npm start
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/discord/status` - Discord bot status
- `POST /api/discord/restart` - Restart the Discord service
- `POST /api/webhook` - Webhook for system messages

## Project Structure

```
src/
├── index.ts              # Main entry point
├── server.ts             # Express server setup
├── discord-service.ts    # Discord bot logic
└── api-client.ts         # API client for main app
```

## Features Comparison with WhatsApp Bot

| Feature | WhatsApp Bot | Discord Bot |
|---------|--------------|-------------|
| AI Assistant | ✅ | ✅ |
| Context Analysis | ✅ | ✅ |
| Conversation Memory | ✅ | ✅ |
| Smart Routing | ✅ | ✅ |
| Owner Privileges | ✅ | ✅ |
| @everyone Tags | ✅ | ✅ |
| Rate Limiting | ✅ | ✅ |
| Rich Embeds | ❌ | ✅ |
| Slash Commands | ❌ | 🔄 (Future) |

## Development

The bot is built with:
- **Discord.js v14** - Discord API wrapper
- **TypeScript** - Type safety and modern JavaScript
- **Express.js** - Web server for API endpoints
- **Node.js** - Runtime environment

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check if the bot token is correct and the bot is online
2. **Permission errors**: Ensure the bot has necessary permissions in the server
3. **Context not working**: Only the bot owner can use context analysis
4. **Rate limiting**: Users are limited to 10 commands per 5 minutes

### Logs

The bot provides detailed logging:
- `🤖` Command processing
- `📚` Context analysis
- `🧠` AI request processing
- `✅` Successful responses
- `❌` Errors and failures

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Part of The Everything Assistant project.