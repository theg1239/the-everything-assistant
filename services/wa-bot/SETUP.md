# WhatsApp Bot Setup Guide

This guide will help you set up the WhatsApp bot service for The Everything Assistant.

## Prerequisites

- Node.js 18+ installed
- The main application running on port 3000
- WhatsApp account for the bot
- Database with updated schema (WhatsApp models)

## Step 1: Environment Configuration

### Main Application (.env)

Add this to your main application's `.env` file:

```env
# WhatsApp Bot API Key (generate a secure random string)
WHATSAPP_BOT_API_KEY=your-secure-api-key-here
```

### WhatsApp Bot Service

1. Navigate to the WhatsApp bot directory:
```bash
cd services/wa-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy and configure environment variables:
```bash
cp example.env .env
```

4. Edit `.env` with your configuration:
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Main Application API
MAIN_APP_URL=http://localhost:3000
MAIN_APP_API_KEY=your-secure-api-key-here

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./whatsapp-session
WHATSAPP_PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox

# Security
WEBHOOK_SECRET=your-webhook-secret-here
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Message Processing
MAX_MESSAGE_LENGTH=4000
MESSAGE_BATCH_SIZE=5
MESSAGE_DELAY_MS=1000
```

## Step 2: Start the Services

### 1. Start the Main Application
```bash
# In the main project directory
npm run dev
```

### 2. Start the WhatsApp Bot Service
```bash
# In services/wa-bot directory
npm run dev
```

## Step 3: Connect WhatsApp

1. When you start the WhatsApp bot service, it will display a QR code in the terminal
2. Open WhatsApp on your phone
3. Go to **Settings** > **Linked Devices** > **Link a Device**
4. Scan the QR code displayed in the terminal
5. Wait for the "WhatsApp client is ready!" message

## Step 4: Test the Bot

Send a message to the connected WhatsApp number:

```
!help
```

You should receive a response with available commands.

Try the AI assistant:
```
!ask What is the weather today?
```

## Available Commands

- `!ask [question]` - Ask the AI assistant anything
- `!help` - Show available commands  
- `!status` - Check bot status

## Monitoring

### Health Checks

- Main app health: `http://localhost:3000/api/whatsapp-bot` (with valid API key)
- Bot service health: `http://localhost:3001/health`
- WhatsApp status: `http://localhost:3001/api/whatsapp/status`

### Logs

The bot service provides detailed logging with emojis:
- 🚀 Service startup
- 📱 WhatsApp events  
- 📨 Message processing
- 🧠 AI requests
- ⚡ Performance metrics
- ❌ Errors

## Production Deployment

### Environment Variables

Set these for production:

```env
NODE_ENV=production
MAIN_APP_URL=https://your-domain.com
WHATSAPP_PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage
```

### Process Management

Use PM2 for production:

```bash
# Install PM2
npm install -g pm2

# Start the bot service
pm2 start server.js --name "whatsapp-bot"

# Setup auto-start
pm2 startup
pm2 save
```

### Reverse Proxy (Nginx)

```nginx
# WhatsApp Bot Service
location /wa-bot/ {
    proxy_pass http://localhost:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

## Database Integration

The bot automatically:
- Creates WhatsApp users in the database
- Tracks conversations and messages
- Links to existing users when possible
- Stores performance metrics

### Database Models

- `WhatsAppConversation` - Tracks phone numbers and conversation metadata
- `WhatsAppMessage` - Stores all messages with AI responses and timing
- `User` - Extended to link WhatsApp conversations

## Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Check if puppeteer can run in your environment
   - Verify `WHATSAPP_PUPPETEER_ARGS` are correct for your system

2. **API Connection Failed**
   - Ensure main app is running on correct port
   - Verify `WHATSAPP_BOT_API_KEY` matches in both services
   - Check firewall settings

3. **WhatsApp Disconnects**
   - The service will automatically attempt to reconnect
   - Check if WhatsApp Web session expired
   - Verify session files are persistent

4. **Rate Limiting**
   - Users are limited to 10 messages per 15 minutes
   - Adjust limits in `whatsapp-service.js` if needed

5. **Memory Issues**
   - Monitor memory usage via health endpoint
   - Restart service if memory grows too large
   - Consider implementing session cleanup

### Debug Mode

Set `NODE_ENV=development` for verbose logging.

### Reset WhatsApp Session

If you need to reset the WhatsApp connection:

```bash
# Stop the service
pm2 stop whatsapp-bot

# Remove session data
rm -rf whatsapp-session/

# Start the service (new QR code will appear)
pm2 start whatsapp-bot
```

## Security Considerations

1. **API Key Security**
   - Use strong, unique API keys
   - Never commit API keys to version control
   - Rotate keys regularly

2. **Rate Limiting**
   - Implemented per-user message limits
   - API endpoint rate limiting
   - Consider additional DDoS protection

3. **Data Privacy**
   - All WhatsApp messages are stored in database
   - Consider data retention policies
   - Implement message encryption if required

4. **Access Control**
   - Only authenticated requests can access API
   - CORS protection enabled
   - Security headers via Helmet

## Features

### ✅ Implemented
- ✅ WhatsApp Web integration
- ✅ AI-powered responses via main application
- ✅ Command parsing (!ask, !help, !status)
- ✅ Rate limiting and security
- ✅ Database integration
- ✅ Message chunking for long responses
- ✅ Performance monitoring
- ✅ Automatic reconnection
- ✅ Health checks and status endpoints

### 🔮 Future Enhancements
- Group chat support
- Message encryption
- Media file handling
- Advanced analytics dashboard
- Multi-language support
- Custom command creation
- Webhook integrations

## Support

For issues and questions:
1. Check the logs for error messages
2. Verify configuration settings
3. Test API connectivity
4. Review the troubleshooting section

The WhatsApp bot is now ready to provide AI-powered assistance via WhatsApp messages!