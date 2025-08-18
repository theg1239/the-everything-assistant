import { VIT_COMPREHENSIVE_KNOWLEDGE } from '@/lib/ai/knowledge-base'

const courseMapping: { [key: string]: string } = {
  calc: 'BMAT101L',
  DET: 'BMAT102L',
  complex: 'BMAT201L',
  'linear algebra': 'BMAT201L',
  probability: 'BMAT202L',
  'probs and stats': 'BMAT202L',
  stats: 'BMAT202L',
  discrete: 'BMAT205L',
  calculus: 'BMAT101L',
  'differential equations': 'BMAT102L',
  'complex variables': 'BMAT201L',
  'probability and statistics': 'BMAT202L',
  'discrete mathematics': 'BMAT205L',

  fluids: 'BMEE204L',
  'fluid mechanics': 'BMEE204L',

  python: 'BCSE101E',
  'python programming': 'BCSE101E',
  'computer programming': 'BCSE101E',
  'object oriented programming': 'BCSE102L',

  'data structures': 'BCSE202L',
  DSA: 'BCSE202L',
  DAA: 'BCSE204L',
  'computer architecture': 'BCSE205L',
  'software engineering': 'BCSE301L',
  'database systems': 'BCSE302L',
  'operating systems': 'BCSE303L',
  'artificial intelligence': 'BCSE306L',
  'computer networks': 'BCSE308L',
  cryptography: 'BCSE309L',
  'network security': 'BCSE309L',

  'digital logic': 'BITE202L',
  microprocessors: 'BECE204L',
  MPMC: 'BECE204L',
  DLM: 'BITE202L',
  'web technologies': 'BITE304L',

  kdom: 'BMEE207L',
  'mat science': 'BMEE209L',
  optimization: 'BMEE215L',
  CFD: 'BMEE409E',
  'engineering physics': 'BPHY101L',
  optics: 'BPHY201L',
  'classical mechanics': 'BPHY202L',
  'quantum mechanics': 'BPHY203L',

  'engineering chemistry': 'BCHY101L',

  'technical english': 'BENG101L',

  'basic electrical engineering': 'BEEE102L',
  'signals and systems': 'BEEE204L',
}

export function getCourseCode(courseName: string): string | null {
  const lowerCourseName = courseName.toLowerCase()

  for (const [key, value] of Object.entries(courseMapping)) {
    if (lowerCourseName.includes(key.toLowerCase())) {
      return value
    }
  }

  return null
}

export function isVTOPQuestion(question: string): boolean {
  const vtopKeywords = [
    'vtop',
    'marks',
    'attendance',
    'timetable',
    'cgpa',
    'grades',
    'receipts',
    'hostel',
    'exams',
    'library dues',
    'calendar',
    'nightslip',
    'leave',
    'class messages',
    'digital assignments',
    'facility',
    'thursday',
    'classes do i have',
  ]

  return vtopKeywords.some(keyword => question.toLowerCase().includes(keyword.toLowerCase()))
}

function extractSections(text: string): { [key: string]: string[] } {
  const sections: { [key: string]: string[] } = {}

  const sectionRegex = /## ([^\n]+)/gi
  let match
  let lastSection = ''

  while ((match = sectionRegex.exec(text)) !== null) {
    const sectionName = match[1].trim()
    lastSection = sectionName
    sections[sectionName] = []
  }

  const subSectionRegex = /### ([^\n]+)/gi
  while ((match = subSectionRegex.exec(text)) !== null) {
    const subSectionName = match[1].trim()
    let parentSection = lastSection
    for (const section of Object.keys(sections)) {
      if (
        text.indexOf(`## ${section}`) < text.indexOf(`### ${subSectionName}`) &&
        text.indexOf(`## ${section}`) > text.indexOf(`## ${lastSection}`)
      ) {
        parentSection = section
      }
    }
    if (parentSection && sections[parentSection]) {
      sections[parentSection].push(subSectionName)
    }
  }

  return sections
}

function generateQuestionsByCategory(): { [key: string]: string[] } {
  const sections = extractSections(VIT_COMPREHENSIVE_KNOWLEDGE)

  return {
    admission: [
      'what are the admission requirements for vit?',
      'how does the viteee exam work?',
      'what are the eligibility criteria for admission?',
      'tell me about the fee structure at vit',
      'what are the different admission categories?',
    ],
    academics: [
      'explain the ffcs system at vit',
      'how does the grading system work?',
      'what is the credit structure at vit?',
      'how are examinations conducted?',
      'explain the cat and fat system',
    ],
    vtop: [
  'show my marks for the current semester',
  'check my attendance percentage',
  'show my timetable for this week',
  'what is my current cgpa?',
  'show my semester grades',
  'show my fee receipts',
  'show my hostel allocation and details',
  'show upcoming exams from vtop',
  'check my library dues',
  'show my nightslip status',
  'check my leave application status',
  'show class announcements from vtop',
  'list my digital assignments',
  'show my facility bookings',
  'what classes do i have on thursday?',
  'when is my next exam?',
  'how much attendance do i need to be eligible?',
  "what's my last class tomorrow?",
    ],
    campus: [
  'what are the hostel facilities like?',
  'tell me about the campus infrastructure',
  'what sports facilities are available?',
  'what are the dining options on campus?',
  'what medical facilities are available?',
  "what's today's mess menu?",
  "what's for lunch in men's hostel special mess?",
  "show me today's dinner menu for ladies hostel",
  "what's for breakfast tomorrow?",
  'check the veg mess menu for today',
  'show me nonveg mess menu',
  "what's the special mess menu for this week?",
    ],
    research: [
      'what research opportunities are available?',
      'tell me about the research centers at vit',
      'what are the ongoing research projects?',
      'how can students participate in research?',
      'what are the innovation initiatives at vit?',
    ],
    papers: [
  'find past papers for BCSE202L (data structures)',
  'search past papers for specific questions',
  'index past papers for a course for detailed q&a',
  'ask an indexed paper a question',
  'analyze common question patterns for a course',
    ],
    faculty: [
  'tell me about faculty in a department',
  'how can i contact a faculty member?',
  'find faculty in the cse department',
    ],
    courses: [
      'what programs are offered at vit?',
      'tell me about the cse curriculum',
      'what specializations are available in ece?',
      'how are the laboratory facilities?',
      'what are the popular elective courses?',
  'get the syllabus for a course (e.g., BMAT101L)',
  'show the syllabus for BMAT101L',
      "what's the syllabus for data structures and algorithms?",
      'get me past papers for operating systems',
  'i need past papers for BCSE303L',
  'get course info for BMAT101L in smec',
      'download course materials for this semester',
      'show me course materials',
      'get course materials for my current semester',
      'download materials from course page',
    ],
    placements: [
  'show placement statistics for a year',
  'which companies visited vit for placements this year?',
  'what is the highest package offered this year?',
  'show recent placement offers',
  'what is the average package for cse students?',
    ],
    helpers: [
      'search the knowledge base for vit policies or campus info',
      'save a memory about the user',
      'perform a semantic search of past papers for a question',
      'smart-search past papers for a specific question',
      'get a reddit overview of trending vit topics',
      'search reddit for student discussions about a topic',
      'get campus block information (e.g., where is tt?)',
      'get the official syllabus for a course code',
      "get today's mess menu for a specific hostel and mess type",
      'open the ffcs planner ui',
      'analyze repeated question patterns for a course',
    ],
    international: [
      'what international collaborations does vit have?',
      'tell me about the semester abroad program',
      'what are the exchange programs available?',
      'how can I apply for dual degree programs?',
      'what is the process for international students?',
    ],
    // placement: [
    //   'show me placement statistics for VIT Vellore',
    //   'what companies visited VIT for placements this year?',
    //   'what is the highest package offered at VIT?',
    //   'show me recent placement offers at VIT',
    //   'compare placement statistics between VIT Vellore and Chennai',
    //   'what is the average package for CSE students?',
    //   'which companies offer the highest packages at VIT?',
    //   'show me placement trends over the last 5 years',
    //   'what is the placement percentage at VIT Vellore?',
    //   'which departments have the best placement records?',
    //   'show me internship opportunities for CSE students',
    //   'what is the placement scenario for core branches?',
    //   'show me placement statistics for international offers',
    //   'what are the top recruiting companies at VIT?',
    //   'how does VIT support students for placements?',
    // ],
    extracurricular: [
      'what clubs and chapters are there?',
      'tell me about the cultural events at vit',
      'what technical competitions are organized?',
      'how can I join clubs at vit?',
      'what are riviera and gravitas festivals?',
    ],
    reddit: [
      'what do students think about the food at vit?',
      'share some study tips from seniors at vit',
      'what are the best hostels according to students?',
      'any advice for freshers from vit alumni?',
      'what are the most common placement experiences?',
      'can you find project ideas from vit reddit?',
      'what are some fun stories from r/VIT?',
      'what is the general opinion on the grading system?',
      'how do students prepare for viteee?',
      'what are some must-visit places on campus according to students?',
      'what are the most popular clubs as per reddit?',
      'any tips for surviving the first year at vit?',
      'what are the most upvoted posts about vit?',
      'what do students say about the mess food?',
      'can you show trending discussions from vit reddit?',
    ],
  }
}

export function getRandomQuestions(count: number = 6, isFirstMessage: boolean = true): string[] {
  const allCategories = generateQuestionsByCategory()
  const categories = Object.keys(allCategories)

  const priorityCategories = isFirstMessage
    ? ['vtop', 'academics', 'admission', 'campus', 'reddit']
    : ['vtop', 'courses', 'extracurricular', 'reddit']

  let questions: string[] = []

  if (allCategories['vtop'] && allCategories['vtop'].length > 0) {
    const vtopQuestions = [...allCategories['vtop']]
    for (let i = 0; i < Math.min(2, vtopQuestions.length) && questions.length < count; i++) {
      const randomIndex = Math.floor(Math.random() * vtopQuestions.length)
      const question = vtopQuestions.splice(randomIndex, 1)[0]
      questions.push(question)
    }
  }

  // Add at least one Reddit question if available and not already included
  if (allCategories['reddit'] && allCategories['reddit'].length > 0 && questions.length < count) {
    const redditQuestions = [...allCategories['reddit']]
    const randomIndex = Math.floor(Math.random() * redditQuestions.length)
    const redditQuestion = redditQuestions[randomIndex]
    if (!questions.includes(redditQuestion)) {
      questions.push(redditQuestion)
    }
  }

  priorityCategories.forEach(category => {
    if (
      allCategories[category] &&
      questions.length < count &&
      category !== 'vtop' &&
      category !== 'reddit'
    ) {
      const randomIndex = Math.floor(Math.random() * allCategories[category].length)
      const question = allCategories[category][randomIndex]
      if (!questions.includes(question)) {
        questions.push(question)
      }
    }
  })

  while (questions.length < count) {
    const randomCategory = categories[Math.floor(Math.random() * categories.length)]
    const categoryQuestions = allCategories[randomCategory]
    if (categoryQuestions && categoryQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * categoryQuestions.length)
      const question = categoryQuestions[randomIndex]
      if (!questions.includes(question)) {
        questions.push(question)
      }
    }
  }

  return questions.slice(0, count)
}
