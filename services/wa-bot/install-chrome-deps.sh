#!/bin/bash

# Install Chrome dependencies for Ubuntu/Debian (Updated for Ubuntu 24.10)
echo "Installing Chrome dependencies for WhatsApp Web..."

# Fix repository issues first
echo "Fixing repository issues..."
sudo sed -i 's/oracular-security/noble-security/g' /etc/apt/sources.list.d/* 2>/dev/null || true
sudo sed -i 's/oracular-security/noble-security/g' /etc/apt/sources.list 2>/dev/null || true

# Update package list
sudo apt-get update

# Install Google Chrome directly (which includes all dependencies)
echo "Installing Google Chrome (includes all required dependencies)..."
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list

sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install additional dependencies for headless operation
echo "Installing additional dependencies..."
sudo apt-get install -y \
    libasound2t64 \
    libatk1.0-0t64 \
    libatk-bridge2.0-0t64 \
    libcups2t64 \
    libdrm2 \
    libgtk-3-0t64 \
    libgtk-4-1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libgconf-2-4 \
    xvfb \
    fonts-liberation \
    libappindicator3-1 \
    ca-certificates

# Alternative: Install Chromium as fallback
echo "Installing Chromium as fallback..."
sudo apt-get install -y chromium-browser

echo "✅ Chrome dependencies installed successfully!"
echo ""
echo "🔧 Additional recommended steps:"
echo "1. Make sure your .env file has the correct Puppeteer arguments"
echo "2. Consider using Xvfb if running completely headless"
echo ""
echo "You can now start the WhatsApp bot service."