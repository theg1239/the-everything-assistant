#!/bin/bash

# Simple Chrome installation for Ubuntu 24.10
echo "🚀 Installing Google Chrome for WhatsApp Web..."

# Download and install Chrome directly
cd /tmp
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb

# Fix any missing dependencies
sudo apt-get install -f -y

# Verify installation
echo "✅ Chrome installation complete!"
google-chrome --version

# Create a test script to verify Chrome can run headless
echo "🧪 Testing Chrome headless mode..."
google-chrome --headless --no-sandbox --disable-gpu --dump-dom https://www.google.com > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Chrome headless mode working!"
else
    echo "❌ Chrome headless mode failed. Installing additional dependencies..."
    sudo apt-get install -y xvfb
fi

echo ""
echo "🎉 Setup complete! Your WhatsApp bot should now work."
echo ""
echo "💡 If you still get errors, try running with xvfb:"
echo "   xvfb-run -a node server.js"