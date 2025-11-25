const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')
const { BINARY_PATH, CLI_TIMEOUT } = require('../config')
const { cleanVTOPOutput } = require('../utils/text')

function resolveSemesterQuery(semesterQuery, semesterOptions) {
  if (!semesterQuery || !semesterOptions || semesterOptions.length === 0) {
    return null
  }

  const query = semesterQuery.toLowerCase().trim()

  if (query.includes('latest') || query.includes('current') || query.includes('ongoing')) {
    return semesterOptions[semesterOptions.length - 1].number
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

  const yearMatch = query.match(/20\d{2}[-\/]?\d{0,2}/)
  let yearFilter = null
  if (yearMatch) {
    const yearStr = yearMatch[0]
    yearFilter = opt => opt.description.toLowerCase().includes(yearStr.toLowerCase())
  }

  const seasonMap = {
    fall: ['fall'],
    winter: ['winter'],
    summer: ['summer'],
  }

  for (const [season, variants] of Object.entries(seasonMap)) {
    if (variants.some(variant => query.includes(variant))) {
      let allMatches = semesterOptions.filter(opt =>
        variants.some(variant => opt.description.toLowerCase().includes(variant))
      )

      if (yearFilter) {
        allMatches = allMatches.filter(yearFilter)
      }

      if (allMatches.length === 1) {
        return allMatches[0].number
      }

      if (allMatches.length > 1) {
        const queryYearMatch = query.match(/20\d{2}/)
        if (queryYearMatch) {
          const year = queryYearMatch[0]
          const filtered = allMatches.filter(opt => opt.description.includes(year))
          if (filtered.length === 1) {
            return filtered[0].number
          }
        }
        console.log(
          `Multiple semesters found for ${season} query`,
          allMatches.map(m => m.description)
        )
        return null
      }
    }
  }

  const semesterMappings = {
    1: ['first', '1st', 'sem 1', 'semester 1'],
    2: ['second', '2nd', 'sem 2', 'semester 2'],
    3: ['third', '3rd', 'sem 3', 'semester 3'],
    4: ['fourth', '4th', 'sem 4', 'semester 4'],
    5: ['fifth', '5th', 'sem 5', 'semester 5'],
    6: ['sixth', '6th', 'sem 6', 'semester 6'],
    7: ['seventh', '7th', 'sem 7', 'semester 7'],
    8: ['eighth', '8th', 'sem 8', 'semester 8'],
  }

  for (const option of semesterOptions) {
    for (const [key, terms] of Object.entries(semesterMappings)) {
      for (const term of terms) {
        if (query.includes(term) && option.description.toLowerCase().includes(term)) {
          return option.number
        }
      }
    }
  }

  const numberOnly = query.match(/\d+/)
  if (numberOnly) {
    const requestedNumber = parseInt(numberOnly[0])
    const validOption = semesterOptions.find(opt => opt.number === requestedNumber)
    if (validOption) {
      return requestedNumber
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
  try {
    const needsSemester = ['semester', 'course', 'faculty', 'materials', 'download'].includes(step)
    if (needsSemester) {
      const hasExplicitSemester =
        flags &&
        (typeof flags.semester === 'number' ||
          (typeof flags.semester === 'string' && flags.semester.trim() !== ''))
      const hasSemesterQuery =
        flags && typeof flags.semesterQuery === 'string' && flags.semesterQuery.trim() !== ''
      if (!hasExplicitSemester && !hasSemesterQuery) {
        flags = { ...(flags || {}), semesterQuery: 'latest' }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[course-page] Defaulting semesterQuery to "latest"')
        }
      }
    }
  } catch {}
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

  if (step === 'semester' && flags && flags.semester) {
    console.log(
      `Semester step with resolved semester ${flags.semester}, proceeding to show courses`
    )
    return await executeInteractiveCoursePageWorkflow(
      username,
      password,
      'course',
      flags,
      sessionData
    )
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

  const cliBaseArgs = ['proxy', username, password, 'course-page']
  const flagArgs = []
  if (flags && typeof flags === 'object') {
    if (flags.semester && flags.semester > 0) flagArgs.push('-s', flags.semester.toString())
    if (flags.course && flags.course > 0) flagArgs.push('-c', flags.course.toString())
    if (flags.faculty && flags.faculty > 0) flagArgs.push('-f', flags.faculty.toString())
  }
  const cliArgs = [...cliBaseArgs, ...flagArgs]

  if (flags && flags.semesterQuery && !flags.semester) {
    console.log(`Resolving semesterQuery: ${flags.semesterQuery}`)
  }


  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BINARY_PATH)) {
      return reject({
        error: `CLI executable not found at path: ${BINARY_PATH}`,
        command: 'course-page-interactive',
        step: step,
      })
    }

    const child = spawn(BINARY_PATH, cliArgs, {
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
      } else if (
        output.includes('Choose a Course (enter a number):') ||
        output.includes('Choose a course (enter a number):')
      ) {
        const courseOptions = parseCourseOptions(currentOutput)
        if (courseOptions.length > 0 && !hasReceivedPrompt) {
          hasReceivedPrompt = true
          promptData = {
            type: 'course',
            options: courseOptions,
            prompt: 'Please select a course:',
          }

          console.log(`Course selection prompt detected with ${courseOptions.length} options`)

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
      } else if (
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
            prompt: 'Please select a faculty:',
          }

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
      } else if (
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
            }
            if (selectedIndices.length > 0) {
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
          if (!flags.materialSelection) {
            flags.materialSelection = '0'
          }
          selection = flags.faculty.toString()
          shouldAutoProgress = true
        } else if (promptData.type === 'materials') {
          if (!flags.materialSelection) {
            flags.materialSelection = '0'
          }
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
          return
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
        console.log(`stdout: ${stdout.substring(0, 200)}...`)
        console.log(`hasReceivedPrompt: ${hasReceivedPrompt}`)
        console.log(`promptData: ${promptData ? JSON.stringify(promptData) : 'null'}`)
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
        const downloadPathMatch = stdout.match(/Download path:\s*(.*)/i)
        const hasDownloadPath = !!(downloadPathMatch && downloadPathMatch[1])
        const shouldParseDownloadInfo =
          step === 'materials' ||
          stdout.includes('Downloaded') ||
          stdout.includes('Downloading') ||
          stdout.includes('files downloaded') ||
          stdout.includes('download complete') ||
          hasDownloadPath

        if (process.env.NODE_ENV !== 'production') {
          console.log(`shouldParseDownloadInfo: ${shouldParseDownloadInfo} (step: ${step})`)
          if (hasDownloadPath) console.log('Detected download path:', downloadPathMatch[1])
        }

        let downloadInfo = shouldParseDownloadInfo
          ? parseDownloadInfo(stdout)
          : {
              filesDownloaded: 0,
              totalFiles: 0,
              downloadPath: null,
              files: [],
              errors: [],
            }
        if (hasDownloadPath && !downloadInfo.downloadPath) {
          downloadInfo.downloadPath = downloadPathMatch[1].trim()
        }

        const servedFiles = shouldParseDownloadInfo
          ? await serveDownloadedFiles(downloadInfo.downloadPath, downloadInfo)
          : []

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
        if (process.env.NODE_ENV !== 'production' && shouldParseDownloadInfo) {
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
              'Local downloadPath successfully excluded from response (served files available)'
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
      lines[i].includes('INDEX │ FACULTY') ||
      (lines[i].includes('INDEX │') && lines[i].toLowerCase().includes('faculty'))
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
    if (
      line.includes('INDEX │ COURSE') ||
      line.includes('Choose a Course') ||
      line.includes('Enter a search term or number for Course')
    ) {
      break
    }
    const facultyMatch = line.match(/^\s*(\d+)\s*│\s*([A-Z .'-]+)$/i)
    if (facultyMatch) {
      const description = facultyMatch[2].trim()
      if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(description)) {
        options.push({
          number: parseInt(facultyMatch[1]),
          description: description,
          text: line.trim(),
        })
      }
      continue
    }
    const simpleMatch = line.match(/^\s*(\d+)\.\s*([A-Z .'-]+)$/i)
    if (simpleMatch) {
      const description = simpleMatch[2].trim()
      if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(description)) {
        options.push({
          number: parseInt(simpleMatch[1]),
          description: description,
          text: line.trim(),
        })
      }
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
    console.log('Using production API base URL: https://everything-assistant.com')
    return 'https://everything-assistant.com'
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
  const lines = rawOutput.split('\n')
  const cleanedLines = []

  let semester = ''
  let course = ''
  let faculty = ''
  let downloadSummary = ''
  let downloadPath = ''
  let filesCount = 0

  const filteredLines = []
  for (const line of lines) {
    const trimmed = line.trim()

    if (
      trimmed.includes('Proxy command:') ||
      trimmed.includes('Proxy executing') ||
      trimmed.includes('Attempting login') ||
      trimmed.includes('Helper -') ||
      trimmed.includes('Login successful') ||
      trimmed.includes('captcha') ||
      trimmed.match(/^\{"command"/)
    ) {
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
        const expiry = Date.now() + 2 * 60 * 60 * 1000

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
        const downloadUrl = `https://assistant.nptelprep.in/download/${fileId}`

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

  if (
    process.env.NODE_ENV !== 'production' &&
    (downloadInfo.filesDownloaded > 0 ||
      downloadInfo.totalFiles > 0 ||
      downloadInfo.files.length > 0)
  ) {
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

module.exports = {
  executeInteractiveCoursePageWorkflow,
  cleanCliOutput,
  serveDownloadedFiles,
  parseDownloadInfo,
  getNextStep,
  tempFiles,
}
