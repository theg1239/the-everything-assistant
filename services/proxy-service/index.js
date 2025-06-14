const express = require('express')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const CryptoJS = require('crypto-js')
const helmet = require('helmet')
require('dotenv').config()

const app = express()

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

app.use(express.json({ limit: '10mb' }))

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://the-everything-assistant.vercel.app', 'http://localhost:3000']

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`)
  next()
})

function decryptPassword(encryptedData, sessionKey) {
  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, sessionKey).toString(CryptoJS.enc.Utf8)

    if (!decrypted) {
      throw new Error('Decryption resulted in empty string')
    }

    return decrypted
  } catch (error) {
    console.error('Decryption error, treating as plain text')
    return encryptedData
  }
}

function sanitizeErrorForResponse(error, command) {
  const sanitizedError = {
    error: error.error || error.message || 'Command execution failed',
    command: command,
    timestamp: new Date().toISOString(),
  }

  if (process.env.NODE_ENV !== 'production' && error.args) {
    sanitizedError.args = error.args.map(arg => (arg === error.args[2] ? '***' : arg))
  }

  return sanitizedError
}

function getCliExecutablePath() {
  if (process.env.CLI_TOP_PATH) {
    return process.env.CLI_TOP_PATH
  }

  const possibleNames =
    process.platform === 'win32'
      ? ['cli-top.exe', 'cli-top-windows-amd64.exe', 'main.exe']
      : ['cli-top', 'cli-top-linux-amd64', 'main']

  for (const name of possibleNames) {
    const fullPath = path.resolve(__dirname, `./${name}`)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  const baseName = process.platform === 'win32' ? 'cli-top.exe' : 'cli-top'
  return path.resolve(__dirname, `./${baseName}`)
}

const CLI_TOP_PATH = getCliExecutablePath()
const CLI_TIMEOUT = parseInt(process.env.CLI_TIMEOUT) || 120000

const COMMAND_MAPPING = {
  profile: 'profile',
  marks: 'marks',
  grades: 'grades',
  attendance: 'attendance',
  timetable: 'timetable',
  receipts: 'receipts',
  hostel: 'hostel',
  cgpa: 'cgpa',
  exams: 'exams',
  'exam-schedule': 'exams',
  'course-page': 'course-page',
  'library-dues': 'library-dues',
  calendar: 'calendar',
  nightslip: 'nightslip',
  leave: 'leave',
  'leave-status': 'leave',
  msg: 'msg',
  'class-message': 'msg',
  da: 'da',
  facility: 'facility',
  syllabus: 'syllabus',
}

const INTERACTIVE_COMMANDS = {
  marks: { requiresSemester: true },
  grades: { requiresSemester: true },
  attendance: { requiresSemester: true },
  timetable: { requiresSemester: true },
  exams: { requiresSemester: true },
  calendar: { requiresSemester: true, requiresClassGroup: true },
  'course-page': { requiresSemester: true, requiresCourse: true, requiresFaculty: true },
  syllabus: { requiresCourse: true },
  da: { autoCtrlC: true },
  facility: { autoCtrlC: true },
}

const SUPPORTED_COMMANDS = Object.keys(COMMAND_MAPPING)

async function executeVTOPCommand(username, password, command, flags) {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Executing VTOP command: ${command} for user: ${username}`)
    }

    if (!fs.existsSync(CLI_TOP_PATH)) {
      return reject({
        error: `CLI executable not found at path: ${CLI_TOP_PATH}`,
        command: command,
        args: ['proxy', username, '***', command],
      })
    }

    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(CLI_TOP_PATH, '755')
      } catch (chmodErr) {
        console.warn('Could not set executable permissions:', chmodErr.message)
      }
    }

    let cliArgs = ['proxy', username, password, command]
    if (flags && typeof flags === 'object') {
      for (const [key, value] of Object.entries(flags)) {
        if (value !== undefined && value !== null && value !== '' && key !== 'semesterQuery') {
          if (typeof value === 'boolean' && value) {
            cliArgs.push(`-${key.charAt(0)}`) // Use short flags like -s, -c, -f
          } else if (typeof value === 'number' || typeof value === 'string') {
            let flagName = key
            if (key === 'semester') flagName = 's'
            else if (key === 'course') flagName = 'c'
            else if (key === 'faculty') flagName = 'f'
            else if (key === 'classGroup') flagName = 'g'
            else if (key === 'fuzzyIndex') flagName = 'i'
            else if (key === 'debug') flagName = 'd'

            cliArgs.push(`-${flagName}`)
            cliArgs.push(value.toString())
          }
        }
      }
    }

    const options = {
      timeout: CLI_TIMEOUT,
      cwd: __dirname,
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `Executing: ${CLI_TOP_PATH} ${['proxy', username, '***', command, ...cliArgs.slice(4)].join(' ')}`
      )
    }

    // Check if this is an interactive command that might need automated responses
    const interactiveConfig = INTERACTIVE_COMMANDS[command]
    if (interactiveConfig) {
      return executeInteractiveCommand(
        CLI_TOP_PATH,
        cliArgs,
        options,
        command,
        flags,
        resolve,
        reject
      )
    }

    // For non-interactive commands, use the original execFile approach
    const { execFile } = require('child_process')
    execFile(CLI_TOP_PATH, cliArgs, options, (err, stdout, stderr) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `CLI execution completed. Error: ${!!err}, stdout length: ${stdout?.length || 0}, stderr length: ${stderr?.length || 0}`
        )
      }

      if (err) {
        console.error(`CLI Error: ${err.message}`)
        if (process.env.NODE_ENV !== 'production') {
          console.error(`stderr: ${stderr}`)
          console.error(`stdout: ${stdout}`)
        }

        return reject({
          error: stderr || stdout || err.message,
          command: command,
          args: ['proxy', username, '***', command, ...cliArgs.slice(4)],
        })
      }      if (process.env.NODE_ENV !== 'production') {
        console.log(`Command output: ${stdout}`)
      }

      try {
        const jsonOutput = JSON.parse(stdout)
        resolve(jsonOutput)
      } catch (parseErr) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Output is not JSON, treating as plain text:', parseErr.message)
        }
        
        const cleanedOutput = cleanVTOPOutput(stdout, command)
        resolve({
          success: true,
          command: command,
          output: cleanedOutput,
          raw: false,
        })
      }
    })
  })
}

function executeInteractiveCommand(cliPath, cliArgs, options, command, flags, resolve, reject) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing interactive command: ${command}`)
  }

  const child = spawn(cliPath, cliArgs, {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let currentPrompt = ''
  let processingComplete = false
  let interactionCount = 0
  const maxInteractions = 10
  let autoCtrlCSent = false

  child.stdout.on('data', data => {
    const output = data.toString()
    stdout += output
    currentPrompt += output

    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI stdout: ${output}`)
    }
    if (!processingComplete && interactionCount < maxInteractions) {
      const shouldAutoTerminate =
        (command === 'da' && output.includes('Choose a subject (enter a number):')) ||
        (command === 'facility' &&
          (output.includes('Enter the number of the facility') ||
            output.includes("type 'exit' to cancel") ||
            output.includes('Choose') ||
            output.includes('Select') ||
            output.includes('enter a number')))

      if (shouldAutoTerminate && !autoCtrlCSent) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `${command.toUpperCase()} command: Found selection prompt, sending Ctrl+C to terminate`
          )
        }
        autoCtrlCSent = true
        child.stdin.write('\x03')

        setTimeout(() => {
          if (!processingComplete) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `${command.toUpperCase()} command: Force killing process as it did not respond to Ctrl+C`
              )
            }
            processingComplete = true
            child.kill('SIGKILL')

            setTimeout(() => {
              try {
                const jsonOutput = JSON.parse(stdout)
                resolve(jsonOutput)              } catch (parseErr) {
                resolve({
                  success: true,
                  command: command,
                  output: cleanVTOPOutput(stdout, command),
                  raw: false,
                })
              }
            }, 50)
          }
        }, 500) // Reduced timeout to 500ms for faster response
        return
      }

      const response = handleInteractivePrompt(currentPrompt, command, flags)
      if (response !== null) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Sending automated response: ${response === '\x03' ? 'Ctrl+C' : response}`)
        }

        if (response === '\x03') {
          child.stdin.write(response)
        } else {
          child.stdin.write(response + '\n')
        }

        currentPrompt = ''
        interactionCount++
      }
    }
  })

  child.stderr.on('data', data => {
    const output = data.toString()
    stderr += output
    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI stderr: ${output}`)
    }
  })
  child.on('close', code => {
    processingComplete = true
    if (process.env.NODE_ENV !== 'production') {
      console.log(`CLI process closed with code: ${code}`)
    }
    if (code === 130 || code === null) {
      if (command === 'da' || command === 'facility') {
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `${command.toUpperCase()} command terminated by Ctrl+C as expected, returning data`
          )
        }
        try {
          const jsonOutput = JSON.parse(stdout)
          return resolve(jsonOutput)
        } catch (parseErr) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(
              `${command.toUpperCase()} command output is not JSON, treating as plain text`
            )
          }          return resolve({
            success: true,
            command: command,
            output: cleanVTOPOutput(stdout, command),
            raw: false,
          })
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('Process terminated by Ctrl+C, returning credentials required error')
      }
      return reject({
        error: 'VTOP credentials required',
        requiresCredentials: true,
        command: command,
        message: 'Please provide your VTOP username and password to access VTOP data.',
        args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)],
      })
    }

    if (code !== 0) {
      return reject({
        error: stderr || stdout || `Process exited with code ${code}`,
        command: command,
        args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)],
      })
    }

    try {
      const jsonOutput = JSON.parse(stdout)
      resolve(jsonOutput)
    } catch (parseErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Output is not JSON, treating as plain text:', parseErr.message)
      }      resolve({
        success: true,
        command: command,
        output: cleanVTOPOutput(stdout, command),
        raw: false,
      })
    }
  })

  child.on('error', err => {
    processingComplete = true
    console.error(`CLI process error: ${err.message}`)
    reject({
      error: err.message,
      command: command,
      args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)],
    })
  })

  setTimeout(() => {
    if (!processingComplete) {
      processingComplete = true
      child.kill()
      reject({
        error: 'Interactive command timeout',
        command: command,
        args: ['proxy', cliArgs[1], '***', command, ...cliArgs.slice(4)],
      })
    }
  }, CLI_TIMEOUT)
}

function handleInteractivePrompt(prompt, command, flags) {
  const lowerPrompt = prompt.toLowerCase()

  if (
    lowerPrompt.includes('choose a semester') ||
    lowerPrompt.includes('select a semester') ||
    (lowerPrompt.includes('semester') && lowerPrompt.includes('number'))
  ) {
    if (flags && flags.semester && flags.semester > 0) {
      return flags.semester.toString()
    }

    const semesterChoice = findBestSemesterMatch(prompt, flags)
    if (semesterChoice) {
      return semesterChoice
    }
    const semesterMatches = prompt.match(/(\d+)\.\s*(Fall|Winter|Summer)?\s*\d{4}/g)
    if (semesterMatches && semesterMatches.length > 0) {
      const semesterNumbers = semesterMatches.map(match => {
        const num = match.match(/^(\d+)\./)
        return num ? parseInt(num[1]) : 0
      })
      const maxSemester = Math.max(...semesterNumbers)
      if (maxSemester > 0) {
        return maxSemester.toString()
      }
    }

    const tableRows = prompt.match(/^\s*(\d+)\s*│/gm)
    if (tableRows && tableRows.length > 0) {
      const numbers = tableRows.map(row => {
        const match = row.match(/^\s*(\d+)\s*│/)
        return match ? parseInt(match[1]) : 0
      })
      const lastOption = Math.max(...numbers)
      if (lastOption > 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Defaulting to last semester option: ${lastOption}`)
        }
        return lastOption.toString()
      }
    }

    return '\x03'
  }

  if (
    lowerPrompt.includes('choose a course') ||
    lowerPrompt.includes('select a course') ||
    (lowerPrompt.includes('course') && lowerPrompt.includes('number'))
  ) {
    if (flags && flags.course && flags.course > 0) {
      return flags.course.toString()
    }

    return '\x03'
  }

  if (
    lowerPrompt.includes('choose a faculty') ||
    lowerPrompt.includes('select a faculty') ||
    (lowerPrompt.includes('faculty') && lowerPrompt.includes('number'))
  ) {
    if (flags && flags.faculty && flags.faculty > 0) {
      return flags.faculty.toString()
    }

    return '\x03'
  }

  if (
    lowerPrompt.includes('choose a class') ||
    lowerPrompt.includes('select a class') ||
    lowerPrompt.includes('class group') ||
    (lowerPrompt.includes('group') && lowerPrompt.includes('number'))
  ) {
    if (flags && flags.classGroup && flags.classGroup > 0) {
      return flags.classGroup.toString()
    }

    return '\x03'
  }

  if (
    lowerPrompt.includes('enter a number') ||
    lowerPrompt.includes('enter the number') ||
    lowerPrompt.includes('select by entering') ||
    (lowerPrompt.includes('enter') && lowerPrompt.includes('number'))
  ) {
    return '\x03'
  }

  if (
    lowerPrompt.includes('(yes/no)') ||
    lowerPrompt.includes('(y/n)') ||
    lowerPrompt.includes('proceed')
  ) {
    return '\x03'
  }

  if (
    lowerPrompt.includes("type 'exit'") ||
    lowerPrompt.includes('exit to quit') ||
    lowerPrompt.includes('exit to cancel')
  ) {
    return '\x03'
  }
  return null
}

function findBestSemesterMatch(prompt, flags) {
  if (flags && flags.semesterQuery) {
    const query = flags.semesterQuery.toLowerCase()

    const lines = prompt.split('\n')
    const semesterOptions = []

    for (const line of lines) {
      const tableMatch = line.match(/^\s*(\d+)\s*│.*?│\s*(.+?)\s*$/)
      if (tableMatch) {
        const number = parseInt(tableMatch[1])
        const description = tableMatch[2].toLowerCase().trim()
        semesterOptions.push({ number, description, line: line.trim() })
        continue
      }

      const simpleMatch = line.match(/^\s*(\d+)\.\s*(.+)$/)
      if (simpleMatch) {
        const number = parseInt(simpleMatch[1])
        const description = simpleMatch[2].toLowerCase()
        semesterOptions.push({ number, description, line: line.trim() })
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Semester query: "${query}"`)
      console.log('Parsed semester options:', semesterOptions)
    }

    for (const option of semesterOptions) {
      if (option.description.includes(query)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            `Found semester match: "${query}" -> ${option.number} (${option.description})`
          )
        }
        return option.number.toString()
      }
    }

    const semesterMappings = {
      summer: ['summer', 'intersession', 'inter session'],
      winter: ['winter', 'intersession', 'inter session'],
      fall: ['fall', 'autumn', 'odd'],
      spring: ['spring', 'even'],
      current: ['current', 'present', 'ongoing'],
      latest: ['latest', 'recent', 'last'],
      1: ['first', '1st', 'one'],
      2: ['second', '2nd', 'two'],
      3: ['third', '3rd', 'three'],
      4: ['fourth', '4th', 'four'],
      5: ['fifth', '5th', 'five'],
      6: ['sixth', '6th', 'six'],
      7: ['seventh', '7th', 'seven'],
      8: ['eighth', '8th', 'eight'],
    }

    for (const option of semesterOptions) {
      for (const [key, terms] of Object.entries(semesterMappings)) {
        for (const term of terms) {
          if (query.includes(term) && option.description.includes(term)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log(
                `Found fuzzy semester match: "${query}" -> ${option.number} via "${term}"`
              )
            }
            return option.number.toString()
          }
        }
      }
    }

    const numberMatch = query.match(/\d+/)
    if (numberMatch) {
      const requestedNumber = parseInt(numberMatch[0])
      const validOption = semesterOptions.find(opt => opt.number === requestedNumber)
      if (validOption) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Found direct number match: "${query}" -> ${requestedNumber}`)
        }
        return requestedNumber.toString()
      }
    }
  }
  return null
}

function resolveSemesterQuery(semesterQuery, semesterOptions) {
  if (!semesterQuery || !semesterOptions || semesterOptions.length === 0) {
    return null
  }

  const query = semesterQuery.toLowerCase().trim()

  if (query.includes('latest') || query.includes('current') || query.includes('ongoing')) {
    return semesterOptions[0].number
  }

  const numberMatch = query.match(/(?:semester\s*)?(\d+)(?:rd|th|st|nd)?/)
  if (numberMatch) {
    const requestedNumber = parseInt(numberMatch[1])
    const found = semesterOptions.find(
      opt =>
        opt.description.toLowerCase().includes(`semester ${requestedNumber}`) ||
        opt.description.toLowerCase().includes(`sem ${requestedNumber}`) ||
        opt.description.toLowerCase().includes(`${requestedNumber}`)
    )
    if (found) {
      return found.number
    }
  }

  const seasonMap = {
    fall: ['fall', 'autumn'],
    winter: ['winter'],
    summer: ['summer'],
    spring: ['spring'],
  }

  for (const [season, variants] of Object.entries(seasonMap)) {
    if (variants.some(variant => query.includes(variant))) {
      const found = semesterOptions.find(opt =>
        variants.some(variant => opt.description.toLowerCase().includes(variant))
      )
      if (found) {
        return found.number
      }
    }
  }

  const yearMatch = query.match(/20\d{2}/)
  if (yearMatch) {
    const year = yearMatch[0]
    const found = semesterOptions.find(opt => opt.description.includes(year))
    if (found) {
      return found.number
    }
  }
  return null
}

function calculateFuzzyMatchScore(query, description) {
  if (!query || !description) return 0

  query = query.toLowerCase().trim()
  description = description.toLowerCase().trim()

  if (description.includes(query)) {
    return 1.0
  }

  const cleanQuery = query
    .replace(/\b(engineering|advanced|basic|introduction to|intro to)\b/g, '')
    .trim()
  const cleanDescription = description
    .replace(/\b(engineering|advanced|basic|introduction to|intro to)\b/g, '')
    .trim()

  if (cleanDescription.includes(cleanQuery)) {
    return 0.95
  }

  const queryWords = query.split(/\s+/).filter(word => word.length > 1)
  const descWords = description.split(/\s+/).filter(word => word.length > 1)

  if (queryWords.length === 0) return 0

  for (let i = 0; i <= descWords.length - queryWords.length; i++) {
    const sequence = descWords.slice(i, i + queryWords.length).join(' ')
    if (sequence === query) {
      return 0.9
    }
  }

  let exactWordMatches = 0
  let partialWordMatches = 0
  let abbreviationMatches = 0

  for (const queryWord of queryWords) {
    let foundExactMatch = false
    let foundPartialMatch = false

    for (const descWord of descWords) {
      if (queryWord === descWord) {
        exactWordMatches++
        foundExactMatch = true
        break
      } else if (
        queryWord.length > 2 &&
        (descWord.includes(queryWord) || queryWord.includes(descWord))
      ) {
        if (!foundPartialMatch) {
          partialWordMatches++
          foundPartialMatch = true
        }
      }
    }

    if (!foundExactMatch && !foundPartialMatch && queryWord.length <= 4) {
      const abbreviationPattern = new RegExp(queryWord.split('').join('.*'), 'i')
      if (abbreviationPattern.test(description.replace(/\s+/g, ''))) {
        abbreviationMatches++
      }
    }
  }
  const totalWords = queryWords.length
  const exactScore = exactWordMatches / totalWords
  const partialScore = (partialWordMatches / totalWords) * 0.7
  const abbreviationScore = (abbreviationMatches / totalWords) * 0.5

  let courseCodeBonus = 0
  const courseCodePattern = /[A-Z]{4}\d{3}[A-Z]?/g
  const queryCodeMatches = query.match(courseCodePattern)
  const descCodeMatches = description.match(courseCodePattern)

  if (queryCodeMatches && descCodeMatches) {
    for (const queryCode of queryCodeMatches) {
      for (const descCode of descCodeMatches) {
        if (queryCode === descCode) {
          courseCodeBonus = 0.8
          break
        }
      }
    }
  }

  let finalScore = Math.max(exactScore, partialScore + abbreviationScore) + courseCodeBonus

  if (query.length < 4) {
    finalScore *= 0.8
  }

  return Math.min(finalScore, 1.0)
}

async function executeInteractiveCoursePageWorkflow(username, password, step, flags, sessionData) {
  if (sessionData && typeof sessionData === 'string') {
    try {
      const parsedSession = JSON.parse(sessionData)
      if (parsedSession.username === username && parsedSession.flags) {
        flags = { ...parsedSession.flags, ...flags }
        console.log('Resuming session from step:', parsedSession.currentStep)

        if (parsedSession.targetStep && parsedSession.targetStep !== step) {
          const targetStep = parsedSession.targetStep
          const stepOrder = ['semester', 'course', 'faculty', 'materials']
          const currentStepIndex = stepOrder.indexOf(step)
          const targetStepIndex = stepOrder.indexOf(targetStep)

          if (targetStepIndex > currentStepIndex) {
            const requiredFlags = {
              course: ['semester'],
              faculty: ['semester', 'course'],
              materials: ['semester', 'course', 'faculty'],
            }

            let nextPossibleStep = step
            for (let i = currentStepIndex + 1; i <= targetStepIndex; i++) {
              const stepName = stepOrder[i]
              const required = requiredFlags[stepName] || []
              const hasAllRequired = required.every(flag => flags && flags[flag])

              if (hasAllRequired) {
                nextPossibleStep = stepName
              } else {
                break
              }
            }

            if (nextPossibleStep !== step) {
              console.log(
                `Auto-progressing from ${step} to ${nextPossibleStep} toward target ${targetStep}`
              )
              step = nextPossibleStep
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse session data:', error.message)
    }
  }

  const stepOrder = ['semester', 'course', 'faculty', 'materials']
  const currentStepIndex = stepOrder.indexOf(step)

  if (currentStepIndex > 0) {
    const requiredFlags = {
      course: ['semester'],
      faculty: ['semester', 'course'],
      materials: ['semester', 'course', 'faculty'],
    }

    const required = requiredFlags[step] || []
    const missing = required.filter(flag => !flags || !flags[flag])
    if (missing.length > 0) {
      const firstMissing = missing[0]
      console.log(
        `Step "${step}" requires prerequisite "${firstMissing}". Redirecting to "${firstMissing}" step with preserved context.`
      )

      const preservedSession = {
        originalStep: step,
        targetStep: step,
        username: username,
        flags: flags,
        timestamp: Date.now(),
      }

      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        firstMissing,
        flags,
        JSON.stringify(preservedSession)
      )
    }
  }

  if (step === 'smart-search' && flags && flags.materialQuery) {
    try {
      let materials = []
      if (sessionData) {
        const parsed = JSON.parse(sessionData)
        materials = parsed.materials || []
      }

      if (materials.length === 0) {
        return {
          success: false,
          error: 'No materials data available for smart search',
          message: 'Please complete the previous steps first',
        }
      }
      const baseUrl = getBaseUrl()
      const matchResponse = await fetch(`${baseUrl}/api/smart-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: flags.materialQuery,
          options: materials,
          type: 'materials',
        }),
      })

      if (!matchResponse.ok) {
        throw new Error('Smart matching service unavailable')
      }

      const matchResult = await matchResponse.json()

      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'download',
        {
          ...flags,
          materialSelection: matchResult.selectionString,
        },
        sessionData
      )
    } catch (error) {
      console.error('Smart search error:', error)
      return {
        success: false,
        error: 'Smart search failed',
        message: 'Could not process natural language query. Please select materials manually.',
      }
    }
  }
  if (step === 'materials' && flags && flags.materialQuery && !flags.materialSelection) {
    console.log(`Processing materialQuery: "${flags.materialQuery}" for materials step`)
    
    const query = flags.materialQuery.toLowerCase()
    if (query.includes('all') || query.includes('everything') || query.includes('bulk')) {
      console.log('User requested all materials, setting selection to "0"')
      flags.materialSelection = '0'
      delete flags.materialQuery
    }
  }

  if (step === 'download' && flags && flags.materialSelection) {
    console.log(`Executing download with selection: ${flags.materialSelection}`)
    
    step = 'materials'
  }

  if (step === 'course' && (!flags || !flags.semester)) {
    console.log('Course step requested but no semester selected. Getting semester options first.')
    return await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'semester',
      flags,
      sessionData
    )
  }

  if (step === 'faculty' && (!flags || !flags.semester || !flags.course)) {
    console.log('Faculty step requested but missing prerequisites (semester/course).')

    if (flags && flags.semesterQuery && !flags.semester) {
      console.log('Starting with semester selection due to semesterQuery')
      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'semester',
        flags,
        sessionData
      )
    }

    if (flags && flags.semester && !flags.course) {
      console.log('Have semester, moving to course selection')
      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'course',
        flags,
        sessionData
      )
    }

    console.log('Missing both semester and course, starting from semester')
    return await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'semester',
      flags,
      sessionData
    )
  }

  if (step === 'materials' && (!flags || !flags.semester || !flags.course || !flags.faculty)) {
    console.log('Materials step requested but missing prerequisites.')

    if (!flags || !flags.semester) {
      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'semester',
        flags,
        sessionData
      )
    } else if (!flags.course) {
      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'course',
        flags,
        sessionData
      )
    } else if (!flags.faculty) {
      return await executeInteractiveCoursePageWorkflow(
        username,
        password,
        'faculty',
        flags,
        sessionData
      )
    }
  }

  if (step === 'course' && flags && flags.semesterQuery && !flags.semester) {
    console.log(
      `Step is "course" but semesterQuery provided: ${flags.semesterQuery}. Getting semester options first.`
    )

    const tempResult = await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'semester',
      {},
      sessionData
    )
    if (tempResult.success && tempResult.options) {
      const resolvedSemester = resolveSemesterQuery(flags.semesterQuery, tempResult.options)
      if (resolvedSemester) {
        console.log(
          `Resolved semesterQuery "${flags.semesterQuery}" to semester ${resolvedSemester}`
        )
        flags.semester = resolvedSemester
        delete flags.semesterQuery
      } else {
        return {
          ...tempResult,
          message: `Could not automatically resolve "${flags.semesterQuery}". Please select a semester:`,
        }
      }
    } else {
      return tempResult
    }
  }
  if (step === 'course' && flags && flags.courseQuery && !flags.course) {
    console.log(`Smart course matching for query: ${flags.courseQuery}`)

    const tempResult = await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'course',
      { ...flags, courseQuery: undefined },
      sessionData
    )
    if (tempResult.success && tempResult.options) {
      try {
        const baseUrl = getBaseUrl()
        const matchResponse = await fetch(`${baseUrl}/api/smart-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: flags.courseQuery,
            options: tempResult.options,
            type: 'course',
          }),
        })

        if (matchResponse.ok) {
          const matchResult = await matchResponse.json()
          if (matchResult.bestMatches && matchResult.bestMatches.length > 0) {
            const bestMatch = matchResult.bestMatches[0]
            if (bestMatch.confidence >= 0.7) {
              console.log(
                `Auto-selected course: ${bestMatch.index} (confidence: ${bestMatch.confidence})`
              )
              flags.course = bestMatch.index
              delete flags.courseQuery
              return await executeInteractiveCoursePageWorkflow(
                username,
                password,
                'faculty',
                flags,
                sessionData
              )
            }
          }
        }
      } catch (error) {
        console.error('Smart course matching failed:', error)
      }
      const query = flags.courseQuery.toLowerCase()
      let bestMatch = null
      let bestScore = 0

      for (const option of tempResult.options) {
        const description = option.description.toLowerCase()
        const score = calculateFuzzyMatchScore(query, description)

        if (score > bestScore && score >= 0.4) {
          bestScore = score
          bestMatch = option
        }
      }

      if (bestMatch && bestScore >= 0.4) {
        console.log(
          `Auto-selected course via fuzzy matching: ${bestMatch.number} (${bestMatch.description}) - score: ${bestScore.toFixed(2)}`
        )
        flags.course = bestMatch.number
        delete flags.courseQuery
        return await executeInteractiveCoursePageWorkflow(
          username,
          password,
          'faculty',
          flags,
          sessionData
        )
      }
    }

    return tempResult
  }

  if (step === 'faculty' && flags && flags.facultyQuery && !flags.faculty) {
    console.log(`Smart faculty matching for query: ${flags.facultyQuery}`)

    const tempResult = await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'faculty',
      { ...flags, facultyQuery: undefined },
      sessionData
    )
    if (tempResult.success && tempResult.options) {
      try {
        const baseUrl = getBaseUrl()
        const matchResponse = await fetch(`${baseUrl}/api/smart-match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: flags.facultyQuery,
            options: tempResult.options,
            type: 'faculty',
          }),
        })

        if (matchResponse.ok) {
          const matchResult = await matchResponse.json()
          if (matchResult.bestMatches && matchResult.bestMatches.length > 0) {
            const bestMatch = matchResult.bestMatches[0]
            if (bestMatch.confidence >= 0.6) {
              console.log(
                `Auto-selected faculty: ${bestMatch.index} (confidence: ${bestMatch.confidence})`
              )
              flags.faculty = bestMatch.index
              delete flags.facultyQuery
              return await executeInteractiveCoursePageWorkflow(
                username,
                password,
                'materials',
                flags,
                sessionData
              )
            }
          }
        }
      } catch (error) {
        console.error('Smart faculty matching failed:', error)
      }
      const query = flags.facultyQuery.toLowerCase()
      let bestMatch = null
      let bestScore = 0

      for (const option of tempResult.options) {
        const description = option.description.toLowerCase()
        const score = calculateFuzzyMatchScore(query, description)

        if (score > bestScore && score >= 0.3) {
          bestScore = score
          bestMatch = option
        }
      }

      if (bestMatch && bestScore >= 0.3) {
        console.log(
          `Auto-selected faculty via fuzzy matching: ${bestMatch.number} (${bestMatch.description}) - score: ${bestScore.toFixed(2)}`
        )
        flags.faculty = bestMatch.number
        delete flags.facultyQuery
        return await executeInteractiveCoursePageWorkflow(
          username,
          password,
          'materials',
          flags,
          sessionData
        )
      }
    }

    return tempResult
  }

  const cliArgs = ['proxy', username, password, 'course-page']

  if (flags && flags.semesterQuery && !flags.semester) {
    console.log(`Resolving semesterQuery: ${flags.semesterQuery}`)
  }

  if (flags && typeof flags === 'object') {
    for (const [key, value] of Object.entries(flags)) {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'semester' && value > 0) {
          cliArgs.push('-s', value.toString())
        } else if (key === 'course' && value > 0) {
          cliArgs.push('-c', value.toString())
        } else if (key === 'faculty' && value > 0) {
          cliArgs.push('-f', value.toString())
        }
      }
    }
  }

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI_TOP_PATH)) {
      return reject({
        error: `CLI executable not found at path: ${CLI_TOP_PATH}`,
        command: 'course-page-interactive',
        step: step,
      })
    }

    const child = spawn(CLI_TOP_PATH, cliArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname,
    })
    let stdout = ''
    let stderr = ''
    let currentOutput = ''
    let hasReceivedPrompt = false
    let promptData = null
    let parsedSession = null
    let isResolved = false

    if (sessionData && typeof sessionData === 'string') {
      try {
        parsedSession = JSON.parse(sessionData)
      } catch (error) {
        console.warn('Failed to parse session data during CLI execution:', error.message)
      }
    }

    child.stdout.on('data', data => {
      const output = data.toString()
      stdout += output
      currentOutput += output

      if (process.env.NODE_ENV !== 'production') {
        console.log(`Interactive CLI stdout: ${output}`)
      }
      if (
        output.includes('Choose a semester') ||
        (output.includes('semester') && output.includes('enter a number'))
      ) {
        const semesterOptions = parseSemesterOptions(currentOutput)
        if (semesterOptions.length > 0 && !hasReceivedPrompt) {
          hasReceivedPrompt = true
          promptData = {
            type: 'semester',
            options: semesterOptions,
            prompt: 'Please select a semester:',
          }

          if (flags && flags.semesterQuery) {
            const resolvedSemester = resolveSemesterQuery(flags.semesterQuery, semesterOptions)
            if (resolvedSemester) {
              console.log(
                `Auto-resolved semester query "${flags.semesterQuery}" to option ${resolvedSemester}`
              )
              flags.semester = resolvedSemester
            }
          }
        }
      }
      else if (
        output.includes('Choose a Course (enter a number):') ||
        output.includes('Choose a course (enter a number):')
      ) {
        const courseOptions = parseCourseOptions(currentOutput)
        if (courseOptions.length > 0 && !hasReceivedPrompt) {
          hasReceivedPrompt = true
          promptData = {
            type: 'course',
            options: courseOptions,
            prompt: 'Please select a course:',          }
          
          console.log(`Course selection prompt detected with ${courseOptions.length} options`)

          // Auto-select if there's only one course option
          if (courseOptions.length === 1) {
            console.log(
              `Only one course option available: ${courseOptions[0].description}. Auto-selecting.`
            )
            child.stdin.write('1\n')
            hasReceivedPrompt = false
            promptData = null
            return
          }

          if (flags && flags.courseQuery) {
            console.log(`Attempting to auto-select course for query: "${flags.courseQuery}"`)
            const query = flags.courseQuery.toLowerCase()
            let bestMatch = null
            let bestScore = 0

            for (const option of courseOptions) {
              const description = option.description.toLowerCase()
              const score = calculateFuzzyMatchScore(query, description)

              console.log(
                `Checking option ${option.number}: "${option.description}" - score: ${score.toFixed(2)}`
              )

              if (score > bestScore && score >= 0.4) {
                bestScore = score
                bestMatch = option
              }
            }

            if (bestMatch && bestScore >= 0.4) {
              console.log(
                `Auto-selected course via direct fuzzy matching: ${bestMatch.number} (${bestMatch.description}) - score: ${bestScore.toFixed(2)}`
              )
              child.stdin.write(bestMatch.number.toString() + '\n')
              hasReceivedPrompt = false
              promptData = null
              return
            } else {
              console.log(
                `No suitable match found. Best score was ${bestScore.toFixed(2)} (threshold: 0.4)`
              )
            }
          }
        }
      }
      else if (
        output.includes('Choose a faculty') ||
        output.includes('Choose a Faculty') ||
        output.includes('Enter a search term or number for Faculty') ||
        (output.includes('faculty') && output.includes('enter a number')) ||
        (output.includes('Faculty') && output.includes('search term'))
      ) {
        const facultyOptions = parseFacultyOptions(currentOutput)
        if (facultyOptions.length > 0 && !hasReceivedPrompt) {
          hasReceivedPrompt = true
          promptData = {
            type: 'faculty',
            options: facultyOptions,
            prompt: 'Please select a faculty:',          }
          
          console.log(`Faculty selection prompt detected with ${facultyOptions.length} options`)

          if (facultyOptions.length === 1) {
            console.log(
              `Only one faculty option available: ${facultyOptions[0].description}. Auto-selecting.`
            )
            child.stdin.write('1\n')
            hasReceivedPrompt = false
            promptData = null
            return
          }

          if (flags && flags.facultyQuery) {
            console.log(`Attempting to auto-select faculty for query: "${flags.facultyQuery}"`)
            const query = flags.facultyQuery.toLowerCase()
            let bestMatch = null
            let bestScore = 0

            for (const option of facultyOptions) {
              const description = option.description.toLowerCase()
              const score = calculateFuzzyMatchScore(query, description)

              console.log(
                `Checking faculty option ${option.number}: "${option.description}" - score: ${score.toFixed(2)}`
              )

              if (score > bestScore && score >= 0.3) {
                bestScore = score
                bestMatch = option
              }
            }

            if (bestMatch && bestScore >= 0.3) {
              console.log(
                `Auto-selected faculty via direct fuzzy matching: ${bestMatch.number} (${bestMatch.description}) - score: ${bestScore.toFixed(2)}`
              )
              child.stdin.write(bestMatch.number.toString() + '\n')
              hasReceivedPrompt = false
              promptData = null
              return
            } else {
              console.log(
                `No suitable faculty match found. Best score was ${bestScore.toFixed(2)} (threshold: 0.3)`
              )
            }
          }
        }
      }
      else if (
        output.includes('Reference Materials') ||
        output.includes('Materials') ||
        output.includes('Select materials') ||
        output.includes('Enter the index numbers of the topics to download')
      ) {
        const materialOptions = parseMaterialOptions(currentOutput)
        if (materialOptions.length > 0 && !hasReceivedPrompt) {
          hasReceivedPrompt = true
          promptData = {
            type: 'materials',
            options: materialOptions,
            prompt: 'Select materials to download (e.g., "1-5", "0" for all, or "1,3,5"):',
          }
          console.log(`Materials selection prompt detected with ${materialOptions.length} options`)
          if (flags && flags.materialQuery) {
            console.log(`Attempting to auto-select materials for query: "${flags.materialQuery}"`)
            const query = flags.materialQuery.toLowerCase()
            let selectedIndices = []

            if (query.includes('all') || query.includes('everything') || query.includes('bulk')) {
              selectedIndices = ['0']
            } else {
              for (const option of materialOptions) {
                const combinedText =
                  `${option.topic || ''} ${option.description || ''}`.toLowerCase()

                if (
                  combinedText.includes(query) ||
                  query.split(/\s+/).some(word => word.length > 2 && combinedText.includes(word))
                ) {
                  selectedIndices.push(option.number.toString())
                }
              }

              if (selectedIndices.length === 0) {
                console.log(`No specific matches for "${query}", selecting recent materials`)
                selectedIndices = materialOptions
                  .slice(0, Math.min(3, materialOptions.length))
                  .map(opt => opt.number.toString())
              }
            }            if (selectedIndices.length > 0) {
              const selectionString = selectedIndices.join(',')
              console.log(`Auto-selected materials: ${selectionString} for query "${query}"`)
              child.stdin.write(selectionString + '\n')
              hasReceivedPrompt = false
              promptData = null
              return
            }
          } else {
            console.log('No materialQuery provided, returning materials options for user selection')
            promptData.formattedList = formatMaterialsList(materialOptions)
          }
        }
      }
      if (hasReceivedPrompt && promptData && flags) {
        let selection = null
        let shouldAutoProgress = false

        if (promptData.type === 'semester' && flags.semester) {
          selection = flags.semester.toString()
          shouldAutoProgress = true
        } else if (promptData.type === 'course' && flags.course) {
          selection = flags.course.toString()
          shouldAutoProgress = true
        } else if (promptData.type === 'faculty' && flags.faculty) {
          selection = flags.faculty.toString()
          shouldAutoProgress = true
        } else if (promptData.type === 'materials' && flags.materialSelection) {
          selection = flags.materialSelection
          shouldAutoProgress = true
        }
        if (selection && shouldAutoProgress) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Auto-progressing with selection: ${selection}`)
          }
          child.stdin.write(selection + '\n')

          hasReceivedPrompt = false
          promptData = null
        } else {
          const sessionInfo = {
            currentStep: step,
            actualStep: promptData.type,
            targetStep: parsedSession?.targetStep || step,
            username: username,
            flags: flags,
            stepData: promptData,
            timestamp: Date.now(),
          }

          child.kill()

          if (!isResolved) {
            isResolved = true
            resolve({
              success: true,
              step: promptData.type,
              data: promptData,
              options: promptData.options,
              prompt: promptData.prompt,
              nextStep: getNextStep(promptData.type),
              sessionData: JSON.stringify(sessionInfo),
              message: `Please make your selection for ${promptData.type}`,
              raw: false,
              availableFlags: flags || {},
              nextSteps: stepOrder.slice(stepOrder.indexOf(promptData.type) + 1),
              canResume: true,
              interactiveState: 'waiting_for_input',
            })
          }
          return
        }
      }
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
    })
    child.on('close', async code => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Interactive CLI process closed with code: ${code}`)
      }

      if (isResolved) {
        return
      }

      if (hasReceivedPrompt && promptData) {
        const sessionInfo = {
          currentStep: step,
          actualStep: promptData.type,
          targetStep: parsedSession?.targetStep || step,
          username: username,
          flags: flags,
          stepData: promptData,
          timestamp: Date.now(),
        }

        isResolved = true
        resolve({
          success: true,
          step: promptData.type,
          data: promptData,
          options: promptData.options,
          prompt: promptData.prompt,
          nextStep: getNextStep(promptData.type),
          sessionData: JSON.stringify(sessionInfo),
          message: `Please make your selection for ${promptData.type}`,
          raw: false,
          availableFlags: flags || {},
          nextSteps: stepOrder.slice(stepOrder.indexOf(promptData.type) + 1),
          canResume: true,
          interactiveState: 'waiting_for_input',
        })
      } else if (code === 0) {
        const downloadInfo = parseDownloadInfo(stdout)

        const servedFiles = await serveDownloadedFiles(downloadInfo.downloadPath, downloadInfo)

        const cleanedOutput = cleanCliOutput(stdout, servedFiles.length > 0)

        const sessionInfo = {
          currentStep: step,
          username: username,
          flags: flags,
          completed: true,
          downloadInfo: downloadInfo,
          timestamp: Date.now(),
        }

        let completionMessage = 'Course page workflow completed successfully'
        if (downloadInfo.filesDownloaded > 0) {
          completionMessage = `Successfully downloaded ${downloadInfo.filesDownloaded} course materials`
          if (servedFiles.length > 0) {
            completionMessage += ` and made them available for download`
          }
        }
        const responseDownloadInfo = {
          filesDownloaded: downloadInfo.filesDownloaded,
          totalFiles: downloadInfo.totalFiles,
          servedFiles: servedFiles,
          files: downloadInfo.files,
          errors: downloadInfo.errors,
        }

        isResolved = true
        resolve({
          success: true,
          step: step,
          data: cleanedOutput,
          message: completionMessage,
          completed: true,
          downloadInfo: responseDownloadInfo,
          sessionData: JSON.stringify(sessionInfo),
          interactiveState: 'completed',
          raw: false,
        })
        if (process.env.NODE_ENV !== 'production') {
          console.log('Final response structure:')
          console.log('- downloadInfo.filesDownloaded:', downloadInfo.filesDownloaded)
          console.log('- downloadInfo.totalFiles:', downloadInfo.totalFiles)
          console.log(
            '- responseDownloadInfo.downloadPath:',
            responseDownloadInfo.downloadPath || 'EXCLUDED'
          )
          console.log('- downloadPath included in response:', !!responseDownloadInfo.downloadPath)
          console.log('- servedFiles.length:', servedFiles.length)
          if (servedFiles.length > 0) {
            console.log('- First served file:', servedFiles[0])
            console.log(
              '✅ Local downloadPath successfully excluded from response (served files available)'
            )
          }
        }
      } else {
        if (!isResolved) {
          isResolved = true
          reject({
            error: stderr || stdout || `Process exited with code ${code}`,
            command: 'course-page-interactive',
            step: step,
          })
        }
      }
    })
    child.on('error', err => {
      if (!isResolved) {
        isResolved = true
        reject({
          error: err.message,
          command: 'course-page-interactive',
          step: step,
        })
      }
    })
    setTimeout(() => {
      child.kill()
      if (!hasReceivedPrompt && !isResolved) {
        isResolved = true
        reject({
          error: 'Interactive workflow timeout',
          command: 'course-page-interactive',
          step: step,
        })
      }
    }, CLI_TIMEOUT)
  })
}

function parseSemesterOptions(output) {
  const options = []
  const lines = output.split('\n')

  for (const line of lines) {
    const tableMatch = line.match(/^\s*(\d+)\s*│.*?│\s*(.+?)\s*$/)
    if (tableMatch) {
      options.push({
        number: parseInt(tableMatch[1]),
        description: tableMatch[2].trim(),
        text: line.trim(),
      })
    }
  }

  return options
}

function parseCourseOptions(output) {
  const options = []
  const lines = output.split('\n')

  const hasPromptLine = lines.some(
    line =>
      line.includes('Choose a Course (enter a number):') ||
      line.includes('Choose a course (enter a number):')
  )

  if (!hasPromptLine) {
    return options
  }

  let startParsingIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes('INDEX │ COURSE NAME') ||
      (lines[i].includes('INDEX') && lines[i].includes('COURSE'))
    ) {
      startParsingIndex = i
      break
    }
  }

  if (startParsingIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes('Choose a Course (enter a number):') ||
        lines[i].includes('Choose a course (enter a number):')
      ) {
        startParsingIndex = i
        break
      }
    }
  }

  if (startParsingIndex === -1) {
    return options
  }

  for (let i = startParsingIndex + 1; i < lines.length; i++) {
    const line = lines[i]

    if (line.includes('─') || line.trim() === '') {
      continue
    }

    const tableMatch = line.match(/^\s*(\d+)\s*│\s*(.+?)\s*$/)
    if (tableMatch) {
      const description = tableMatch[2].trim()

      if (description.includes('VL20') || description.includes('Semester 20')) {
        continue
      }

      if (
        description.toUpperCase().includes('COURSE NAME') ||
        description.toUpperCase().includes('SEMESTER ID')
      ) {
        continue
      }

      options.push({
        number: parseInt(tableMatch[1]),
        description: description,
        text: line.trim(),
      })
      continue
    }

    const simpleMatch = line.match(/^\s*(\d+)\.\s*(.+)$/)
    if (simpleMatch) {
      const description = simpleMatch[2].trim()
      if (description.includes('VL20') || description.includes('Semester 20')) {
        continue
      }

      options.push({
        number: parseInt(simpleMatch[1]),
        description: description,
        text: line.trim(),
      })
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `Parsed ${options.length} course options:`,
      options.map(opt => `${opt.number}: ${opt.description}`)
    )
  }

  return options
}

function parseFacultyOptions(output) {
  const options = []
  const lines = output.split('\n')

  const hasFacultyPrompt = lines.some(
    line =>
      line.includes('Enter a search term or number for Faculty') ||
      line.includes('Choose a faculty') ||
      line.includes('Choose a Faculty')
  )

  if (!hasFacultyPrompt) {
    return options
  }

  let startParsingIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes('INDEX │') &&
      (lines[i].includes('NAME') || lines[i].includes('FACULTY'))
    ) {
      startParsingIndex = i
      break
    }
  }

  if (startParsingIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Enter a search term or number for Faculty')) {
        startParsingIndex = i
        break
      }
    }
  }

  if (startParsingIndex === -1) {
    return options
  }

  for (let i = startParsingIndex + 1; i < lines.length; i++) {
    const line = lines[i]

    if (line.includes('─') || line.trim() === '') {
      continue
    }

    const tableMatch = line.match(/^\s*(\d+)\s*│\s*(.+?)\s*│/)
    if (tableMatch) {
      const description = tableMatch[2].trim()

      options.push({
        number: parseInt(tableMatch[1]),
        description: description,
        text: line.trim(),
      })
      continue
    }

    const simpleMatch = line.match(/^\s*(\d+)\.\s*(.+)$/)
    if (simpleMatch) {
      const description = simpleMatch[2].trim()

      options.push({
        number: parseInt(simpleMatch[1]),
        description: description,
        text: line.trim(),
      })
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `Parsed ${options.length} faculty options:`,
      options.map(opt => `${opt.number}: ${opt.description}`)
    )
  }

  return options
}

function parseMaterialOptions(output) {
  const options = []
  const lines = output.split('\n')

  const hasMaterialPrompt = lines.some(
    line =>
      line.includes('Enter the index numbers of the topics to download') ||
      line.includes('Select materials') ||
      line.includes('Reference Materials')
  )

  if (!hasMaterialPrompt) {
    return options
  }

  let startParsingIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes('INDEX │') &&
      (lines[i].includes('DATE') || lines[i].includes('TOPIC') || lines[i].includes('REF COUNT'))
    ) {
      startParsingIndex = i
      break
    }
  }

  if (startParsingIndex === -1) {
    return options
  }

  for (let i = startParsingIndex + 1; i < lines.length; i++) {
    const line = lines[i]

    if (line.includes('─') || line.trim() === '') {
      continue
    }

    const tableMatch = line.match(/^\s*(\d+)\s*│\s*([^│]+)\s*│\s*([^│]+)\s*│/)
    if (tableMatch) {
      const number = parseInt(tableMatch[1])
      const date = tableMatch[2].trim()
      const topic = tableMatch[3].trim()

      options.push({
        number: number,
        description: `${date}: ${topic}`,
        date: date,
        topic: topic,
        text: line.trim(),
      })
      continue
    }

    const simpleMatch = line.match(/^\s*(\d+)\.\s*(.+)$/)
    if (simpleMatch) {
      const number = parseInt(simpleMatch[1])
      const description = simpleMatch[2].trim()

      options.push({
        number: number,
        description: description,
        text: line.trim(),
      })
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `Parsed ${options.length} material options:`,
      options.map(opt => `${opt.number}: ${opt.description}`)
    )
  }

  return options
}

const tempFiles = new Map()

function getBaseUrl() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Using production API base URL: https://the-everything-assistant.vercel.app')
    return 'https://the-everything-assistant.vercel.app'
  } else {
    console.log('Using development API base URL: http://localhost:3000')
    return 'http://localhost:3000'
  }
}

setInterval(
  () => {
    const now = Date.now()
    for (const [fileId, fileInfo] of tempFiles.entries()) {
      if (now > fileInfo.expiry) {
        tempFiles.delete(fileId)
        console.log(`Cleaned up expired file: ${fileInfo.filename}`)
      }
    }
  },
  30 * 60 * 1000
)

function cleanCliOutput(rawOutput, hasServedFiles = false) {
  // For interactive course page workflows, we need more selective cleaning
  // Don't use the general cleanVTOPOutput function as it's too aggressive for interactive data
  
  const lines = rawOutput.split('\n')
  const cleanedLines = []

  let semester = ''
  let course = ''
  let faculty = ''
  let downloadSummary = ''
  let downloadPath = ''
  let filesCount = 0

  // First pass: extract important information and clean debug lines
  const filteredLines = []
  for (const line of lines) {
    const trimmed = line.trim()
    
    // Skip debug and login information
    if (trimmed.includes('Proxy command:') ||
        trimmed.includes('Proxy executing') ||
        trimmed.includes('Attempting login') ||
        trimmed.includes('Helper -') ||
        trimmed.includes('Login successful') ||
        trimmed.includes('captcha') ||
        trimmed.match(/^\{"command"/)) {
      continue
    }
    
    filteredLines.push(line)
  }

  for (const line of filteredLines) {
    const trimmed = line.trim()

    if (trimmed.includes('Your selected semester:')) {
      const semesterMatch = trimmed.match(/Your selected semester:\s*(.+)/)
      if (semesterMatch) {
        semester = semesterMatch[1].trim()
      }
    }

    if (trimmed.includes('Your selected Course:')) {
      const courseMatch = trimmed.match(/Your selected Course:\s*(.+)/)
      if (courseMatch) {
        course = courseMatch[1].trim()
      }
    }

    if (trimmed.includes('Your selected Faculty:')) {
      const facultyMatch = trimmed.match(/Your selected Faculty:\s*(.+)/)
      if (facultyMatch) {
        faculty = facultyMatch[1].trim()
      }
    }

    if (trimmed.includes('Download Summary:')) {
      downloadSummary = 'Download Summary:'
    }

    if (trimmed.includes('Total files:')) {
      const filesMatch = trimmed.match(/Total files:\s*(\d+)/)
      if (filesMatch) {
        filesCount = parseInt(filesMatch[1])
        downloadSummary += `\nTotal files: ${filesCount}`
      }
    }

    if (trimmed.includes('Successfully downloaded:')) {
      const downloadedMatch = trimmed.match(/Successfully downloaded:\s*(\d+)/)
      if (downloadedMatch) {
        downloadSummary += `\nSuccessfully downloaded: ${downloadedMatch[1]}`
      }
    }
    if (trimmed.includes('Files have been saved to:')) {
      const pathMatch = trimmed.match(/Files have been saved to:\s*(.+)/)
      if (pathMatch) {
        downloadPath = pathMatch[1].trim()
        if (!hasServedFiles) {
          downloadSummary += `\nFiles saved to: ${downloadPath}`
          if (process.env.NODE_ENV !== 'production') {
            console.log('📁 Including local path in cleaned output (no served files available)')
          }
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.log('🚫 Excluding local path from cleaned output (served files available)')
          }
        }
      }
    }

    if (trimmed.includes('All files were downloaded successfully!')) {
      downloadSummary += '\n✅ All files were downloaded successfully!'
    }
  }

  if (semester) cleanedLines.push(`📚 **Semester**: ${semester}`)
  if (course) cleanedLines.push(`📖 **Course**: ${course}`)
  if (faculty) cleanedLines.push(`👨‍🏫 **Faculty**: ${faculty}`)

  if (filesCount > 0) {
    cleanedLines.push('')
    cleanedLines.push(`📥 **Materials Downloaded**: ${filesCount} files`)
    if (downloadSummary) {
      cleanedLines.push('')
      cleanedLines.push(downloadSummary)
    }
  }

  return cleanedLines.join('\n')
}

function formatMaterialsList(materials) {
  if (!materials || materials.length === 0) {
    return 'No materials found.'
  }

  const formatted = materials.map(material => {
    if (material.date && material.topic) {
      return `${material.number}. ${material.date}: ${material.topic}`
    } else {
      return `${material.number}. ${material.description}`
    }
  })

  return formatted.join('\n')
}

async function serveDownloadedFiles(downloadPath, downloadInfo) {
  const servedFiles = []

  if (!downloadPath || !fs.existsSync(downloadPath)) {
    console.log("Download path not found or doesn't exist:", downloadPath)
    return servedFiles
  }

  try {
    const files = fs.readdirSync(downloadPath)
    console.log(`Found ${files.length} files to serve from: ${downloadPath}`)

    for (const filename of files) {
      const filePath = path.join(downloadPath, filename)
      const stat = fs.statSync(filePath)

      if (stat.isFile()) {
        const fileId = uuidv4()
        const expiry = Date.now() + 2 * 60 * 60 * 1000 // 2 hours

        tempFiles.set(fileId, {
          path: filePath,
          filename: filename,
          expiry: expiry,
        })

        setTimeout(
          () => {
            tempFiles.delete(fileId)
          },
          2 * 60 * 60 * 1000
        )
        let downloadUrl
        if (process.env.NODE_ENV === 'production') {
          downloadUrl = `https://the-everything-assistant.onrender.com/download/${fileId}`
          console.log(`🌐 Production mode detected - using Render domain for file: ${filename}`)
        } else {
          const host = process.env.PROXY_HOST || 'localhost'
          const port = process.env.PORT || 3001
          downloadUrl = `http://${host}:${port}/download/${fileId}`
          console.log(`🏠 Development mode detected - using localhost for file: ${filename}`)
        }

        servedFiles.push({
          name: filename,
          downloadUrl: downloadUrl,
          size: stat.size,
          expiry: new Date(expiry).toISOString(),
        })

        console.log(`Served file: ${filename} with ID: ${fileId}`)
      }
    }
  } catch (error) {
    console.error('Error serving downloaded files:', error)
  }

  console.log(`Successfully served ${servedFiles.length} files`)
  return servedFiles
}

function parseDownloadInfo(output) {
  const downloadInfo = {
    filesDownloaded: 0,
    totalFiles: 0,
    downloadPath: null,
    files: [],
    errors: [],
  }

  const lines = output.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.includes('Downloaded:') || trimmed.includes('Downloading:')) {
      const fileMatch = trimmed.match(/(?:Downloaded|Downloading):\s*(.+)/)
      if (fileMatch) {
        downloadInfo.files.push({
          name: fileMatch[1].trim(),
          status: trimmed.includes('Downloaded:') ? 'completed' : 'downloading',
        })
      }
    }

    if (trimmed.includes('Total files:')) {
      const countMatch = trimmed.match(/Total files:\s*(\d+)/)
      if (countMatch) {
        downloadInfo.totalFiles = parseInt(countMatch[1])
      }
    }

    if (trimmed.includes('Successfully downloaded:')) {
      const countMatch = trimmed.match(/Successfully downloaded:\s*(\d+)/)
      if (countMatch) {
        downloadInfo.filesDownloaded = parseInt(countMatch[1])
      }
    }

    if (trimmed.includes('Files have been saved to:')) {
      const pathMatch = trimmed.match(/Files have been saved to:\s*(.+)/)
      if (pathMatch) {
        downloadInfo.downloadPath = pathMatch[1].trim()
      }
    }

    if (trimmed.includes('Files saved to:') && !downloadInfo.downloadPath) {
      const pathMatch = trimmed.match(/Files saved to:\s*(.+)/)
      if (pathMatch) {
        downloadInfo.downloadPath = pathMatch[1].trim()
      }
    }

    if (trimmed.includes('Error:') || trimmed.includes('Failed:')) {
      downloadInfo.errors.push(trimmed)
    }
  }

  if (
    !downloadInfo.filesDownloaded &&
    downloadInfo.totalFiles > 0 &&
    downloadInfo.errors.length === 0
  ) {
    downloadInfo.filesDownloaded = downloadInfo.totalFiles
  }

  if (!downloadInfo.totalFiles && downloadInfo.files.length > 0) {
    downloadInfo.totalFiles = downloadInfo.files.length
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('Parsed download info:', {
      filesDownloaded: downloadInfo.filesDownloaded,
      totalFiles: downloadInfo.totalFiles,
      downloadPath: downloadInfo.downloadPath,
      filesCount: downloadInfo.files.length,
    })
  }

  return downloadInfo
}

function getNextStep(currentStep) {
  const stepFlow = {
    semester: 'course',
    course: 'faculty',
    faculty: 'materials',
    materials: 'complete',
  }

  return stepFlow[currentStep] || 'complete'
}

app.post('/vtop', async (req, res) => {
  const { command, username, password, encryptedPassword, sessionKey, flags } = req.body

  if (!command || !username) {
    return res.status(400).json({
      error: 'Missing required fields: command, username',
    })
  }

  if (!password && (!encryptedPassword || !sessionKey)) {
    return res.status(400).json({
      error: 'Missing credentials: provide either password or encryptedPassword with sessionKey',
    })
  }

  if (!SUPPORTED_COMMANDS.includes(command)) {
    return res.status(400).json({
      error: 'Unsupported command',
      supportedCommands: SUPPORTED_COMMANDS,
    })
  }

  let finalPassword
  try {
    if (password) {
      finalPassword = password
    } else {
      finalPassword = decryptPassword(encryptedPassword, sessionKey)
    }
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to decrypt password',
      message: 'Invalid encryption or session key',
    })
  }

  const actualCommand = COMMAND_MAPPING[command]

  let flagsForCLI = {}

  if (flags && typeof flags === 'object') {
    for (const [key, value] of Object.entries(flags)) {
      if (value !== undefined && value !== null && value !== '') {
        flagsForCLI[key] = value
      }
    }
  }

  const interactiveConfig = INTERACTIVE_COMMANDS[actualCommand]
  if (interactiveConfig) {
    if (interactiveConfig.requiresCourse && !flagsForCLI.course) {
      flagsForCLI.course = 1
    }

    if (interactiveConfig.requiresFaculty && !flagsForCLI.faculty) {
      flagsForCLI.faculty = 1
    }

    if (interactiveConfig.requiresClassGroup && !flagsForCLI.classGroup) {
      flagsForCLI.classGroup = 1
    }

    // Note: We intentionally do NOT set a default semester
    // The CLI will prompt interactively and we'll handle it in executeInteractiveCommand
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing VTOP command: ${actualCommand} with flags:`, flagsForCLI)
  }

  try {
    const result = await executeVTOPCommand(username, finalPassword, actualCommand, flagsForCLI)
    res.json(result)
  } catch (error) {
    console.error('VTOP command execution failed:', error.error || error.message)
    const sanitizedError = sanitizeErrorForResponse(error, actualCommand)
    return res.status(500).json(sanitizedError)
  }
})

app.post('/vtop-interactive', async (req, res) => {
  const { command, step, username, password, encryptedPassword, sessionKey, flags, sessionData } =
    req.body

  if (!command || !step || !username) {
    return res.status(400).json({
      error: 'Missing required fields: command, step, username',
    })
  }

  if (!password && (!encryptedPassword || !sessionKey)) {
    return res.status(400).json({
      error: 'Missing credentials: provide either password or encryptedPassword with sessionKey',
    })
  }

  let finalPassword
  try {
    if (password) {
      finalPassword = password
    } else {
      finalPassword = decryptPassword(encryptedPassword, sessionKey)
    }
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to decrypt password',
      message: 'Invalid encryption or session key',
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Executing interactive VTOP workflow: ${command}, step: ${step}`)
  }

  try {
    const result = await executeInteractiveCoursePageWorkflow(
      username,
      finalPassword,
      step,
      flags,
      sessionData
    )
    res.json(result)
  } catch (error) {
    console.error('Interactive VTOP workflow failed:', error.error || error.message)
    const sanitizedError = sanitizeErrorForResponse(error, `${command}-${step}`)
    return res.status(500).json(sanitizedError)
  }
})

app.post('/vtop-interactive-continue', async (req, res) => {
  const { sessionData, selection, step } = req.body

  if (!sessionData || !selection || !step) {
    return res.status(400).json({
      error: 'Missing required fields: sessionData, selection, step',
    })
  }

  let parsedSession
  try {
    parsedSession = JSON.parse(sessionData)
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid session data format',
    })
  }

  if (!parsedSession.username) {
    return res.status(400).json({
      error: 'Invalid session: missing username',
    })
  }

  let nextStep = getNextStep(step)
  let updatedFlags = { ...parsedSession.flags }

  if (step === 'semester') {
    updatedFlags.semester = parseInt(selection)
  } else if (step === 'course') {
    updatedFlags.course = parseInt(selection)
  } else if (step === 'faculty') {
    updatedFlags.faculty = parseInt(selection)
  } else if (step === 'materials') {
    updatedFlags.materialSelection = selection
    nextStep = 'download' // Materials selection leads to download
  }

  // Get credentials from session (they should be in the original request context)
  // For security, we'll require the password to be provided again or use encrypted form
  const password = req.body.password || req.body.encryptedPassword
  if (!password) {
    return res.status(400).json({
      error: 'Password required to continue workflow',
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `Continuing interactive workflow from ${step} to ${nextStep} with selection: ${selection}`
    )
  }

  try {
    // Execute the next step with updated flags
    const result = await executeInteractiveCoursePageWorkflow(
      parsedSession.username,
      password,
      nextStep,
      updatedFlags,
      JSON.stringify(parsedSession)
    )
    res.json(result)
  } catch (error) {
    console.error('Interactive VTOP workflow continuation failed:', error.error || error.message)
    const sanitizedError = sanitizeErrorForResponse(error, `${step}-continue`)
    return res.status(500).json(sanitizedError)
  }
})

app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params

  const fileInfo = tempFiles.get(fileId)
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found or expired' })
  }

  if (Date.now() > fileInfo.expiry) {
    tempFiles.delete(fileId)
    return res.status(410).json({ error: 'File has expired' })
  }

  if (!fs.existsSync(fileInfo.path)) {
    tempFiles.delete(fileId)
    return res.status(404).json({ error: 'File no longer available' })
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`)
  res.setHeader('Content-Type', 'application/octet-stream')

  const fileStream = fs.createReadStream(fileInfo.path)
  fileStream.pipe(res)

  fileStream.on('error', error => {
    console.error('Error streaming file:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error downloading file' })
    }
  })
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
  })
})

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
      fuzzyIndex: 'Fuzzy search index for course-page commands',
    },
  })
})

app.get('/', (req, res) => {
  res.json({
    message: 'Service is running',
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      commands: '/commands',
      vtop: '/vtop (POST)',
    },
  })
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  })
})

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Path ${req.path} not found`,
  })
})

const PORT = process.env.PORT || 3001

function performStartupChecks() {
  console.log(`🔧 CLI Path: ${CLI_TOP_PATH}`)

  if (!fs.existsSync(CLI_TOP_PATH)) {
    console.error(`❌ CLI executable not found at: ${CLI_TOP_PATH}`)
    console.error('Please ensure the cli-top executable is available in the correct location.')
    process.exit(1)
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(CLI_TOP_PATH, '755')
      console.log('✅ Executable permissions set for CLI tool')
    } catch (chmodErr) {
      console.warn('⚠️  Could not set executable permissions:', chmodErr.message)
    }
  }

  console.log('✅ CLI executable found and configured')
}

performStartupChecks()

const server = app.listen(PORT, () => {
  console.log(`🚀 VTOP Proxy Service running on port ${PORT}`)
  console.log(`📖 Environment: ${process.env.NODE_ENV || 'development'}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})

function cleanVTOPOutput(output, command) {
  if (!output || typeof output !== 'string') return output

  let cleaned = output
  
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[mGKH]/g, '')
  
  cleaned = cleaned.replace(/^Proxy command:.*$/gm, '')
  cleaned = cleaned.replace(/^Proxy executing command:.*$/gm, '')
  cleaned = cleaned.replace(/^username: \w+.*$/gm, '')
  cleaned = cleaned.replace(/^args: \[.*\]$/gm, '')
  cleaned = cleaned.replace(/^Attempting login for user:.*$/gm, '')
  cleaned = cleaned.replace(/^\(Helper - .*?\):.*$/gm, '')
  cleaned = cleaned.replace(/^No captcha image found.*$/gm, '')
  cleaned = cleaned.replace(/^Login successful for user:.*$/gm, '')
  cleaned = cleaned.replace(/^\{"command":".*","success":true\}$/gm, '')
  
  cleaned = cleaned.replace(/^Your selected semester:.*$/gm, '')
  cleaned = cleaned.replace(/^Your selected Course:.*$/gm, '')
  cleaned = cleaned.replace(/^Your selected Faculty:.*$/gm, '')
  
  cleaned = cleaned.replace(/^Choose a semester \(enter a number\):.*$/gm, '')
  cleaned = cleaned.replace(/^Choose a Course \(enter a number\):.*$/gm, '')
  cleaned = cleaned.replace(/^Enter a search term.*$/gm, '')
  
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n')
  cleaned = cleaned.replace(/^\s+|\s+$/g, '')
  
  if (command === 'marks') {
    const lines = cleaned.split('\n')
    const meaningfulLines = []
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      
      if (!trimmedLine || 
          trimmedLine.startsWith('Proxy') ||
          trimmedLine.startsWith('Helper') ||
          trimmedLine.startsWith('Login') ||
          trimmedLine.startsWith('Attempting') ||
          trimmedLine.startsWith('captcha') ||
          trimmedLine.startsWith('Choose') ||
          trimmedLine.startsWith('Your selected') ||
          trimmedLine.match(/^\{"command"/)) {
        continue
      }
      
      if (trimmedLine.includes(' - ') || 
          trimmedLine.includes('TITLE') ||
          trimmedLine.includes('/') ||
          trimmedLine.includes('Quiz') ||
          trimmedLine.includes('Mid Term') ||
          trimmedLine.includes('Assignment') ||
          trimmedLine.match(/^\d+$/) ||
          trimmedLine.match(/[0-9]+\.[0-9]+/) ||
          trimmedLine.length > 5) {
        meaningfulLines.push(trimmedLine)
      }
    }
    
    cleaned = meaningfulLines.join('\n')
  }
  
  return cleaned
}
