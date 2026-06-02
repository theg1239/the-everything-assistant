# WhatsApp Bot Service

A standalone Express server that provides WhatsApp integration for The Everything Assistant.

## Features

- 🚀 Standalone Express server for WhatsApp bot functionality
- 📱 WhatsApp Web integration using whatsapp-web.js
- 🤖 AI-powered responses via main application API
- 🛡️ Rate limiting and security features
- 📊 Health monitoring and status endpoints
- 🔄 Automatic reconnection handling
- 📨 Message streaming and chunking for long responses

## Setup

### 1. Install Dependencies

```bash
cd services/wa-bot
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp example.env .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Main Application API
MAIN_APP_URL=http://localhost:3000
MAIN_APP_API_KEY=your-api-key-here

# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./whatsapp-session
WHATSAPP_PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox

# Security
WEBHOOK_SECRET=your-webhook-secret-here
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
```

### 3. Start the Service

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Usage

### WhatsApp Commands

Users can interact with the bot using these commands:

- `!ask [question]` - Ask the AI assistant anything
- `!no` - Get a random rejection reason
- `!help` - Show available commands
- `!status` - Check bot status

Example:

```
!ask What is the weather today?
!ask Explain quantum physics
```

### API Endpoints

#### Health Check

```
GET /health
```

Returns server health and status information.

#### WhatsApp Status

```
GET /api/whatsapp/status
```

Returns WhatsApp connection status and client information.

#### Send Message

```
POST /api/whatsapp/send
Content-Type: application/json

{
  "phoneNumber": "1234567890",
  "message": "Hello from the bot!"
}
```

#### Webhook for Main App

```
POST /api/webhook
Content-Type: application/json

{
  "type": "broadcast",
  "data": {
    "message": "System announcement",
    "recipients": ["1234567890", "0987654321"]
  }
}
```

## Architecture

### Components

1. **WhatsAppService** - Core WhatsApp client management
2. **APIClient** - Communication with main application
3. **WABotServer** - Express server and routing
4. **Rate Limiting** - User message throttling
5. **Message Processing** - Command parsing and response handling

### Message Flow

1. User sends WhatsApp message
2. WhatsAppService receives and processes message
3. If command detected (!ask), routes to AI processing
4. APIClient sends request to main application
5. Streaming response parsed and sent back to user
6. Long messages automatically chunked

### Security Features

- Rate limiting per user (10 messages per 15 minutes)
- CORS protection
- Helmet security headers
- Request size limits
- API key authentication for main app communication

## Development

### File Structure

```
services/wa-bot/
├── server.js              # Main Express server
├── whatsapp-service.js     # WhatsApp client wrapper
├── api-client.js           # Main app API communication
├── package.json            # Dependencies and scripts
├── example.env             # Environment template
└── README.md              # This file
```

### Adding New Commands

To add a new command, modify the `handleCommand` method in `whatsapp-service.js`:

```javascript
case '!newcommand':
    if (!args) {
        await this.sendMessage(from, 'Usage: !newcommand <argument>');
        return;
    }
    await this.handleNewCommand(from, fromName, args, messageData);
    break;
```

### Extending API Integration

Modify `api-client.js` to add new endpoints or change request handling:

```javascript
async newAPIMethod(data) {
    const response = await fetch(`${this.baseUrl}/api/new-endpoint`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(data)
    });

    return await response.json();
}
```

## Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables for Production

- Set `NODE_ENV=production`
- Configure proper `MAIN_APP_URL`
- Use strong `MAIN_APP_API_KEY`
- Set appropriate `ALLOWED_ORIGINS`
- Configure `WHATSAPP_PUPPETEER_ARGS` for your environment

### Process Management

Use PM2 for production process management:

```bash
npm install -g pm2
pm2 start server.js --name "wa-bot"
pm2 startup
pm2 save
```

## Monitoring

### Health Checks

The service provides comprehensive health monitoring:

- Server uptime
- WhatsApp connection status
- Memory usage
- Active conversations count

### Logging

All major events are logged with emojis for easy identification:

- 🚀 Service startup
- 📱 WhatsApp events
- 📨 Message processing
- ❌ Errors and failures
- 🔧 Tool calls and API requests

## Troubleshooting

### Common Issues

1. **WhatsApp Authentication Fails**
   - Check if QR code is properly scanned
   - Verify session files are writable
   - Ensure puppeteer can run in your environment

2. **API Connection Issues**
   - Verify `MAIN_APP_URL` is correct
   - Check `MAIN_APP_API_KEY` is valid
   - Ensure main application is running

3. **Rate Limiting**
   - Users hitting message limits will be throttled
   - Adjust limits in `whatsapp-service.js` if needed

4. **Memory Issues**
   - Monitor memory usage via health endpoint
   - Restart service if memory grows too large
   - Consider implementing automatic restarts

### Debug Mode

Set `NODE_ENV=development` for verbose logging and detailed error messages.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see the main project license for details.
