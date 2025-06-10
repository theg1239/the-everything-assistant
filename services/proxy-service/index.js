const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://the-everything-assistant.vercel.app');
  // res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

function decryptPassword(encryptedData, sessionKey) {
  try {
    //console.log('Decrypting password with session key');
    
    const decrypted = CryptoJS.AES.decrypt(encryptedData, sessionKey).toString(CryptoJS.enc.Utf8);
    
    if (!decrypted) {
      throw new Error('Decryption resulted in empty string');
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    console.log('Treating as plain text password');
    return encryptedData;
  }
}

const CLI_TOP_PATH = path.resolve(__dirname, './cli-top.exe');

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
    console.log(`Executing VTOP command: ${command} for user: ${username}`);
    
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
      timeout: 120000,
      cwd: __dirname,
    };

    console.log(`Executing: ${CLI_TOP_PATH} ${cliArgs.join(' ')}`);    execFile(CLI_TOP_PATH, cliArgs, options, (err, stdout, stderr) => {
      console.log(`CLI execution completed. Error: ${!!err}, stdout length: ${stdout?.length || 0}, stderr length: ${stderr?.length || 0}`);
      
      if (err) {
        console.error(`CLI Error: ${err.message}`);
        console.error(`stderr: ${stderr}`);
        console.error(`stdout: ${stdout}`);
        return reject({
          error: stderr || stdout || err.message,
          command: command,
          args: cliArgs
        });
      }

      console.log(`Command output: ${stdout}`);

      try {
        const jsonOutput = JSON.parse(stdout);
        resolve(jsonOutput);
      } catch (parseErr) {
        console.warn('Output is not JSON, treating as plain text:', parseErr.message);
        resolve({
          success: true,
          command: command,
          output: stdout,
          raw: true
        });
      }
    });
  });
}

app.post('/vtop', async (req, res) => {
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

  console.log(`Executing VTOP command: ${actualCommand} with flags:`, flagsForCLI);
  
  try {
    const result = await executeVTOPCommand(username, finalPassword, actualCommand, flagsForCLI);
    
    res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
});

app.get('/commands', (req, res) => {
  res.json({
    commands: SUPPORTED_COMMANDS,
    mapping: COMMAND_MAPPING,
    description: 'Available commands'
  });
});

app.get('/', (req, res) => {
  res.send('service is running.');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`service running on port ${PORT}`);
});
