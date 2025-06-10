#!/bin/bash

echo "🚀 Deploying VTOP Proxy Service to Heroku..."

if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI is not installed. Please install it first."
    exit 1
fi

if ! heroku auth:whoami &> /dev/null; then
    echo "🔐 Please log in to Heroku first:"
    heroku login
fi

APP_NAME="vtop-proxy-service"
if ! heroku apps:info $APP_NAME &> /dev/null; then
    echo "📱 Creating Heroku app: $APP_NAME"
    heroku create $APP_NAME
fi

echo "⚙️ Setting environment variables..."
heroku config:set NODE_ENV=production --app $APP_NAME
heroku config:set CLI_TIMEOUT=120000 --app $APP_NAME
heroku config:set ALLOWED_ORIGINS=https://the-everything-assistant.vercel.app --app $APP_NAME

echo "📦 Deploying application..."
git add .
git commit -m "Deploy VTOP proxy service" || true
git push heroku main

echo "✅ Deployment complete!"
echo "🌐 App URL: https://$APP_NAME.herokuapp.com"
