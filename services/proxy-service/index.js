const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(express.json({ limit: '10mb' }));

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://the-everything-assistant.vercel.app', 'http://localhost:3000'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

function decryptPassword(encryptedData, sessionKey) {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, sessionKey).toString(CryptoJS.enc.Utf8);
    
    if (!decrypted) {
      throw new Error('Decryption resulted in empty string');
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error, treating as plain text');
    return encryptedData;
  }
}

const CLI_TOP_PATH = process.env.CLI_TOP_PATH || path.resolve(__dirname, './cli-top.exe');
const CLI_TIMEOUT = parseInt(process.env.CLI_TIMEOUT) || 120000;

const COMMAND_MAPPING = {
  'profile': 'profile',
  'marks': 'marks', 
  'grades': 'grades',
  'attendance': 'attendance',
  'timetable': 'timetable',
  'receipts': 'receipts',
  'hostel': 'hostel',
  'cgpa': 'cgpa',
  'exams': 'exams',
  'exam-schedule': 'exams',
  'course-page': 'course-page',
  'library-dues': 'library-dues',
  'calendar': 'calendar',
  'nightslip': 'nightslip',
  'leave': 'leave',
  'leave-status': 'leave',
  'msg': 'msg',
  'class-message': 'msg',
  'da': 'da',
  'facility': 'facility',
  'syllabus': 'syllabus'
};

const SUPPORTED_COMMANDS = Object.keys(COMMAND_MAPPING);

async function executeVTOPCommand(username, password, command, flags) {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Executing VTOP command: ${command} for user: ${username}`);
    }
    
    let cliArgs = ['proxy', username, password, command];
    
    if (flags && typeof flags === 'object') {
      for (const [key, value] of Object.entries(flags)) {
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'boolean' && value) {
            cliArgs.push(`--${key}`);
          } else if (typeof value === 'number' || typeof value === 'string') {
            cliArgs.push(`--${key}=${value}`);
          }
        }
      }
    }

    const options = {
      timeout: CLI_TIMEOUT,
      cwd: __dirname,
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Executing: ${CLI_TOP_PATH} ${cliArgs.join(' ')}`);
    }

    execFile(CLI_TOP_PATH, cliArgs, options, (err, stdout, stderr) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`CLI execution completed. Error: ${!!err}, stdout length: ${stdout?.length || 0}, stderr length: ${stderr?.length || 0}`);
      }
      
      if (err) {
        console.error(`CLI Error: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
          console.error(`stderr: ${stderr}`);
          console.error(`stdout: ${stdout}`);
        }
        return reject({
          error: stderr || stdout || err.message,
          command: command,
          args: cliArgs.slice(0, 3).concat(['***', ...cliArgs.slice(4)])
        });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`Command output: ${stdout}`);
      }

      try {
        const jsonOutput = JSON.parse(stdout);
        resolve(jsonOutput);
      } catch (parseErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Output is not JSON, treating as plain text:', parseErr.message);
        }
        resolve({
          success: true,
          command: command,
          output: stdout,
          raw: true
        });
      }
    });
  });
}app.post('/vtop', async (req, res) => {
  const { command, username, password, encryptedPassword, sessionKey, flags } = req.body;
  
  if (!command || !username) {
    return res.status(400).json({ 
      error: 'Missing required fields: command, username' 
    });
  }
  
  if (!password && (!encryptedPassword || !sessionKey)) {
    return res.status(400).json({ 
      error: 'Missing credentials: provide either password or encryptedPassword with sessionKey' 
    });
  }
  
  if (!SUPPORTED_COMMANDS.includes(command)) {
    return res.status(400).json({ 
      error: 'Unsupported command', 
      supportedCommands: SUPPORTED_COMMANDS 
    });
  }

  let finalPassword;
  try {
    if (password) {
      finalPassword = password;
    } else {
      finalPassword = decryptPassword(encryptedPassword, sessionKey);
    }
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to decrypt password',
      message: 'Invalid encryption or session key'
    });
  }

  const actualCommand = COMMAND_MAPPING[command];
  
  let flagsForCLI = {};
  
  if (flags && typeof flags === 'object') {
    for (const [key, value] of Object.entries(flags)) {
      if (value !== undefined && value !== null && value !== '') {
        flagsForCLI[key] = value;
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing VTOP command: ${actualCommand} with flags:`, flagsForCLI);
  }
  
  try {
    const result = await executeVTOPCommand(username, finalPassword, actualCommand, flagsForCLI);
    res.json(result);
  } catch (error) {
    console.error('VTOP command execution failed:', error.error || error.message);
    return res.status(500).json(error);
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/commands', (req, res) => {
  res.json({
    commands: SUPPORTED_COMMANDS,
    mapping: COMMAND_MAPPING,
    description: 'Available VTOP commands',
    version: require('./package.json').version
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Service is running',
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      commands: '/commands',
      vtop: '/vtop (POST)'
    }
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Path ${req.path} not found`
  });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`🚀 VTOP Proxy Service running on port ${PORT}`);
  console.log(`📖 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 CLI Path: ${CLI_TOP_PATH}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
