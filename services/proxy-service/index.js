const express = require('express');
const { spawn } = require('child_process');
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

function sanitizeErrorForResponse(error, command) {
  const sanitizedError = {
    error: error.error || error.message || 'Command execution failed',
    command: command,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV !== 'production' && error.args) {
    sanitizedError.args = error.args.map(arg => arg === error.args[2] ? '***' : arg);
  }

  return sanitizedError;
}

function getCliExecutablePath() {
  if (process.env.CLI_TOP_PATH) {
    return process.env.CLI_TOP_PATH;
  }
  
  const possibleNames = process.platform === 'win32' 
    ? ['cli-top.exe', 'cli-top-windows-amd64.exe', 'main.exe']
    : ['cli-top', 'cli-top-linux-amd64', 'main'];
  
  for (const name of possibleNames) {
    const fullPath = path.resolve(__dirname, `./${name}`);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  
  const baseName = process.platform === 'win32' ? 'cli-top.exe' : 'cli-top';
  return path.resolve(__dirname, `./${baseName}`);
}

const CLI_TOP_PATH = getCliExecutablePath();
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

const INTERACTIVE_COMMANDS = {
  'marks': { requiresSemester: true },
  'grades': { requiresSemester: true },
  'attendance': { requiresSemester: true },
  'timetable': { requiresSemester: true },
  'exams': { requiresSemester: true },
  'calendar': { requiresSemester: true, requiresClassGroup: true },
  'course-page': { requiresSemester: true, requiresCourse: true, requiresFaculty: true },
  'syllabus': { requiresCourse: true },
  'da': { autoRespond: true },
  'facility': { autoRespond: true }
};

const SUPPORTED_COMMANDS = Object.keys(COMMAND_MAPPING);

async function executeVTOPCommand(username, password, command, flags) {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Executing VTOP command: ${command} for user: ${username}`);
    }
    
    if (!fs.existsSync(CLI_TOP_PATH)) {
      return reject({
        error: `CLI executable not found at path: ${CLI_TOP_PATH}`,
        command: command,
        args: ['proxy', username, '***', command]
      });
    }

    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(CLI_TOP_PATH, '755');
      } catch (chmodErr) {
        console.warn('Could not set executable permissions:', chmodErr.message);
      }
    }
    
    let cliArgs = ['proxy', username, password, command];    if (flags && typeof flags === 'object') {
      for (const [key, value] of Object.entries(flags)) {
        if (value !== undefined && value !== null && value !== '' && key !== 'semesterQuery') {
          if (typeof value === 'boolean' && value) {
            cliArgs.push(`-${key.charAt(0)}`); // Use short flags like -s, -c, -f
          } else if (typeof value === 'number' || typeof value === 'string') {
            let flagName = key;
            if (key === 'semester') flagName = 's';
            else if (key === 'course') flagName = 'c';
            else if (key === 'faculty') flagName = 'f';
            else if (key === 'classGroup') flagName = 'g';
            else if (key === 'fuzzyIndex') flagName = 'i';
            else if (key === 'debug') flagName = 'd';
            
            cliArgs.push(`-${flagName}`);
            cliArgs.push(value.toString());
          }
        }
      }
    }

    const options = {
      timeout: CLI_TIMEOUT,
      cwd: __dirname,
    };
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Executing: ${CLI_TOP_PATH} ${['proxy', username, '***', command, ...cliArgs.slice(4)].join(' ')}`);
    }

    // Check if this is an interactive command that might need automated responses
    const interactiveConfig = INTERACTIVE_COMMANDS[command];
    if (interactiveConfig) {
      return executeInteractiveCommand(CLI_TOP_PATH, cliArgs, options, command, flags, resolve, reject);
    }

    // For non-interactive commands, use the original execFile approach
    const { execFile } = require('child_process');
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
          args: ['proxy', username, '***', command, ...cliArgs.slice(4)]
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
}

function executeInteractiveCommand(cliPath, cliArgs, options, command, flags, resolve, reject) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing interactive command: ${command}`);
  }

  const child = spawn(cliPath, cliArgs, {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let currentPrompt = '';
  let processingComplete = false;
  let interactionCount = 0;
  const maxInteractions = 10;
  
  const commandTimeout = (command === 'da' || command === 'facility') ? 30000 : CLI_TIMEOUT;

  child.stdout.on('data', (data) => {
    const output = data.toString();
    stdout += output;
    currentPrompt += output;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI stdout: ${output}`);
    }

    if (!processingComplete && interactionCount < maxInteractions) {
      const response = handleInteractivePrompt(currentPrompt, command, flags);
      if (response !== null) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Sending automated response: ${response}`);
        }
        
        try {
          child.stdin.write(response + '\n');
        } catch (writeErr) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Failed to write to stdin: ${writeErr.message}`);
          }
        }
        
        currentPrompt = ''; // Reset prompt buffer
        interactionCount++;
      }
    }
  });

  child.stderr.on('data', (data) => {
    const output = data.toString();
    stderr += output;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI stderr: ${output}`);
    }
  });
  child.on('close', (code) => {
    processingComplete = true;
    clearTimeout(timeoutId);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI process closed with code: ${code}`);
    }

    if (code !== 0) {
      return reject({
        error: stderr || stdout || `Process exited with code ${code}`,
        command: command,
        args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)]
      });
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

  child.on('error', (err) => {
    processingComplete = true;
    clearTimeout(timeoutId);
    console.error(`CLI process error: ${err.message}`);
    reject({
      error: err.message,
      command: command,
      args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)]
    });
  });

  const timeoutId = setTimeout(() => {
    if (!processingComplete) {
      processingComplete = true;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Command ${command} timed out after ${commandTimeout}ms, terminating process`);
      }
      
      if ((command === 'da' || command === 'facility') && !child.killed) {
        try {
          child.stdin.write('\x03');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGTERM');
              setTimeout(() => {
                if (!child.killed) {
                  child.kill('SIGKILL');
                }
              }, 2000);
            }
          }, 1000);
        } catch (err) {
          child.kill('SIGTERM');
        }
      } else {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 2000);
      }
      
      reject({
        error: `Interactive command timeout (${commandTimeout}ms)`,
        command: command,
        args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)]
      });
    }
  }, commandTimeout);
}

function handleInteractivePrompt(prompt, command, flags) {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('choose a semester') || 
      lowerPrompt.includes('select a semester') ||
      (lowerPrompt.includes('semester') && lowerPrompt.includes('number'))) {
    
    if (flags && flags.semester && flags.semester > 0) {
      return flags.semester.toString();
    }
    
    const semesterChoice = findBestSemesterMatch(prompt, flags);
    if (semesterChoice) {
      return semesterChoice;
    }
    const semesterMatches = prompt.match(/(\d+)\.\s*(Fall|Winter|Summer)?\s*\d{4}/g);
    if (semesterMatches && semesterMatches.length > 0) {
      const semesterNumbers = semesterMatches.map(match => {
        const num = match.match(/^(\d+)\./);
        return num ? parseInt(num[1]) : 0;
      });
      const maxSemester = Math.max(...semesterNumbers);
      if (maxSemester > 0) {
        return maxSemester.toString();
      }
    }
    
    const tableRows = prompt.match(/^\s*(\d+)\s*│/gm);
    if (tableRows && tableRows.length > 0) {
      const numbers = tableRows.map(row => {
        const match = row.match(/^\s*(\d+)\s*│/);
        return match ? parseInt(match[1]) : 0;
      });
      const lastOption = Math.max(...numbers);
      if (lastOption > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Defaulting to last semester option: ${lastOption}`);
        }
        return lastOption.toString();
      }
    }
    
    return '1';
  }
  
  if (lowerPrompt.includes('choose a course') || 
      lowerPrompt.includes('select a course') ||
      (lowerPrompt.includes('course') && lowerPrompt.includes('number'))) {
    
    if (flags && flags.course && flags.course > 0) {
      return flags.course.toString();
    }
    
    return '1';
  }
  
  if (lowerPrompt.includes('choose a faculty') ||
      lowerPrompt.includes('select a faculty') ||
      (lowerPrompt.includes('faculty') && lowerPrompt.includes('number'))) {
    
    if (flags && flags.faculty && flags.faculty > 0) {
      return flags.faculty.toString();
    }
    
    return '1';
  }
  
  if (lowerPrompt.includes('choose a class') ||
      lowerPrompt.includes('select a class') ||
      lowerPrompt.includes('class group') ||
      (lowerPrompt.includes('group') && lowerPrompt.includes('number'))) {
    
    if (flags && flags.classGroup && flags.classGroup > 0) {
      return flags.classGroup.toString();
    }
    
    return '1';
  }
  
  if (lowerPrompt.includes('enter a number') ||
      lowerPrompt.includes('enter the number') ||
      lowerPrompt.includes('select by entering') ||
      (lowerPrompt.includes('enter') && lowerPrompt.includes('number'))) {
    
    return '1';
  }
  
  if (lowerPrompt.includes('(yes/no)') || 
      lowerPrompt.includes('(y/n)') ||
      lowerPrompt.includes('proceed')) {
    
    return 'yes';
  }
    if (lowerPrompt.includes("type 'exit'") || 
      lowerPrompt.includes('exit to quit') ||
      lowerPrompt.includes('exit to cancel')) {
    
    return '1';
  }

  if (command === 'da' || command === 'facility') {
    // For DA and facility commands, default to Ctrl+C to terminate any interactive prompts
    // This allows the command to return whatever output it has generated so far
    return '\x03';
  }
  
  return null;
}

function findBestSemesterMatch(prompt, flags) {
  if (flags && flags.semesterQuery) {
    const query = flags.semesterQuery.toLowerCase();
    
    const lines = prompt.split('\n');
    const semesterOptions = [];
    
    for (const line of lines) {
      const tableMatch = line.match(/^\s*(\d+)\s*│.*?│\s*(.+?)\s*$/);
      if (tableMatch) {
        const number = parseInt(tableMatch[1]);
        const description = tableMatch[2].toLowerCase().trim();
        semesterOptions.push({ number, description, line: line.trim() });
        continue;
      }
      
      const simpleMatch = line.match(/^\s*(\d+)\.\s*(.+)$/);
      if (simpleMatch) {
        const number = parseInt(simpleMatch[1]);
        const description = simpleMatch[2].toLowerCase();
        semesterOptions.push({ number, description, line: line.trim() });
      }
    }    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Semester query: "${query}"`);
      console.log('Parsed semester options:', semesterOptions);
    }
    
    for (const option of semesterOptions) {
      if (option.description.includes(query)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Found semester match: "${query}" -> ${option.number} (${option.description})`);
        }
        return option.number.toString();
      }
    }
    
    const semesterMappings = {
      'summer': ['summer', 'intersession', 'inter session'],
      'winter': ['winter', 'intersession', 'inter session'],
      'fall': ['fall', 'autumn', 'odd'],
      'spring': ['spring', 'even'],
      'current': ['current', 'present', 'ongoing'],
      'latest': ['latest', 'recent', 'last'],
      '1': ['first', '1st', 'one'],
      '2': ['second', '2nd', 'two'],
      '3': ['third', '3rd', 'three'],
      '4': ['fourth', '4th', 'four'],
      '5': ['fifth', '5th', 'five'],
      '6': ['sixth', '6th', 'six'],
      '7': ['seventh', '7th', 'seven'],
      '8': ['eighth', '8th', 'eight']
    };
    
    for (const option of semesterOptions) {
      for (const [key, terms] of Object.entries(semesterMappings)) {
        for (const term of terms) {
          if (query.includes(term) && option.description.includes(term)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`Found fuzzy semester match: "${query}" -> ${option.number} via "${term}"`);
            }
            return option.number.toString();
          }
        }
      }
    }
    
    const numberMatch = query.match(/\d+/);
    if (numberMatch) {
      const requestedNumber = parseInt(numberMatch[0]);
      const validOption = semesterOptions.find(opt => opt.number === requestedNumber);
      if (validOption) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Found direct number match: "${query}" -> ${requestedNumber}`);
        }
        return requestedNumber.toString();
      }
    }
  }
  
  return null;
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

  const interactiveConfig = INTERACTIVE_COMMANDS[actualCommand];
  if (interactiveConfig) {
    
    if (interactiveConfig.requiresCourse && !flagsForCLI.course) {
      flagsForCLI.course = 1;
    }
    
    if (interactiveConfig.requiresFaculty && !flagsForCLI.faculty) {
      flagsForCLI.faculty = 1;
    }
    
    if (interactiveConfig.requiresClassGroup && !flagsForCLI.classGroup) {
      flagsForCLI.classGroup = 1;
    }
    
    // Note: We intentionally do NOT set a default semester
    // The CLI will prompt interactively and we'll handle it in executeInteractiveCommand
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing VTOP command: ${actualCommand} with flags:`, flagsForCLI);
  }
  
  try {
    const result = await executeVTOPCommand(username, finalPassword, actualCommand, flagsForCLI);
    res.json(result);
  } catch (error) {
    console.error('VTOP command execution failed:', error.error || error.message);
    const sanitizedError = sanitizeErrorForResponse(error, actualCommand);
    return res.status(500).json(sanitizedError);
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
    interactive: INTERACTIVE_COMMANDS,
    description: 'Available VTOP commands with interactive handling support',
    version: require('./package.json').version,
    supportedFlags: {
      semester: 'Semester number for semester-specific commands',
      course: 'Course selection number for course-specific commands',
      faculty: 'Faculty selection number for faculty-specific commands',
      classGroup: 'Class group selection number for calendar commands',
      fuzzyIndex: 'Fuzzy search index for course-page commands'
    }
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

function performStartupChecks() {
  console.log(`🔧 CLI Path: ${CLI_TOP_PATH}`);
  
  if (!fs.existsSync(CLI_TOP_PATH)) {
    console.error(`❌ CLI executable not found at: ${CLI_TOP_PATH}`);
    console.error('Please ensure the cli-top executable is available in the correct location.');
    process.exit(1);
  }
  
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(CLI_TOP_PATH, '755');
      console.log('✅ Executable permissions set for CLI tool');
    } catch (chmodErr) {
      console.warn('⚠️  Could not set executable permissions:', chmodErr.message);
    }
  }
  
  console.log('✅ CLI executable found and configured');
}

performStartupChecks();

const server = app.listen(PORT, () => {
  console.log(`🚀 VTOP Proxy Service running on port ${PORT}`);
  console.log(`📖 Environment: ${process.env.NODE_ENV || 'development'}`);
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
