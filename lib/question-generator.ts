import { VIT_COMPREHENSIVE_KNOWLEDGE } from "@/lib/knowledge-base"

function extractSections(text: string): { [key: string]: string[] } {
  const sections: { [key: string]: string[] } = {}
  
  const sectionRegex = /## ([^\n]+)/gi
  let match;
  let lastSection = ""
  
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
      if (text.indexOf(`## ${section}`) < text.indexOf(`### ${subSectionName}`) && 
          text.indexOf(`## ${section}`) > text.indexOf(`## ${lastSection}`)) {
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
      "what are the admission requirements for vit?",
      "how does the viteee exam work?",
      "what are the eligibility criteria for admission?",
      "tell me about the fee structure at vit",
      "what are the different admission categories?",
    ],
    academics: [
      "explain the ffcs system at vit",
      "how does the grading system work?",
      "what is the credit structure at vit?",
      "how are examinations conducted?",
      "explain the cat and fat system",
    ],
    placements: [
      "what are the placement statistics at vit?",
      "which companies recruit from vit?",
      "tell me about the highest packages at vit",
      "how is the placement process for cse students?",
      "what is the average placement package?",
    ],
    campus: [
      "what are the hostel facilities like?",
      "tell me about the campus infrastructure",
      "what sports facilities are available?",
      "what are the dining options on campus?",
      "what medical facilities are available?",
    ],
    research: [
      "what research opportunities are available?",
      "tell me about the research centers at vit",
      "what are the ongoing research projects?",
      "how can students participate in research?",
      "what are the innovation initiatives at vit?",
    ],
    faculty: [
      "tell me about the faculty at vit",
      "how many faculty members have phd degrees?",
      "what is the faculty strength in computer science?",
      "who are the top researchers at vit?",
      "how can I contact faculty members?",
    ],
    courses: [
      "what programs are offered at vit?",
      "tell me about the cse curriculum",
      "what specializations are available in ece?",
      "how are the laboratory facilities?",
      "what are the popular elective courses?",
    ],
    international: [
      "what international collaborations does vit have?",
      "tell me about the semester abroad program",
      "what are the exchange programs available?",
      "how can I apply for dual degree programs?",
      "what is the process for international students?",
    ],
    extracurricular: [
      "what clubs and organizations are there?",
      "tell me about the cultural events at vit",
      "what technical competitions are organized?",
      "how can I join clubs at vit?",
      "what are riviera and gravitas festivals?",
    ],
  }
}

export function getRandomQuestions(count: number = 6, isFirstMessage: boolean = true): string[] {
  const allCategories = generateQuestionsByCategory()
  const categories = Object.keys(allCategories)
  
  const priorityCategories = isFirstMessage 
    ? ['admission', 'academics', 'placements', 'campus'] 
    : ['research', 'faculty', 'courses', 'international', 'extracurricular']
  
  let questions: string[] = []
  
  priorityCategories.forEach(category => {
    if (allCategories[category] && questions.length < count) {
      const randomIndex = Math.floor(Math.random() * allCategories[category].length)
      questions.push(allCategories[category][randomIndex])
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
