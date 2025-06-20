import {
  findFullCourseName,
  searchCoursesByName,
  getAllCourseMatches,
  recognizeCourseInText,
  COURSE_ACRONYMS,
  COURSE_MAP,
} from './course-map'

export interface CourseRecognition {
  original: string
  expanded: string
  confidence: number
  type: 'exact_code' | 'acronym' | 'partial_match' | 'fuzzy_match'
}

export interface CourseContext {
  recognitions: CourseRecognition[]
  suggestedCourses: Array<{ code: string; name: string }>
  hasCourseMentions: boolean
}

export function recognizeCoursesInBackground(text: string): CourseContext {
  const recognitions: CourseRecognition[] = []
  const suggestedCourses: Array<{ code: string; name: string }> = []

  try {
    const directMatches = recognizeCourseInText(text)
    directMatches.forEach(match => {
      match.matches.forEach(courseMatch => {
        recognitions.push({
          original: match.original,
          expanded: courseMatch.name,
          confidence: 0.95,
          type: 'exact_code',
        })
        suggestedCourses.push({
          code: courseMatch.code,
          name: courseMatch.name,
        })
      })
    })

    const words = text
      .toUpperCase()
      .split(/\W+/)
      .filter(word => word.length >= 2)
    words.forEach(word => {
      if (COURSE_ACRONYMS[word]) {
        const courses = COURSE_ACRONYMS[word]
        const courseName =
          courses.length === 1
            ? COURSE_MAP[courses[0]]
            : `${courses.length} courses (${courses.map(c => COURSE_MAP[c] || c).join(', ')})`

        if (!recognitions.some(r => r.original.toUpperCase() === word)) {
          recognitions.push({
            original: word,
            expanded: courseName || word,
            confidence: courses.length === 1 ? 0.85 : 0.7,
            type: 'acronym',
          })
        }

        courses.forEach(code => {
          if (COURSE_MAP[code] && !suggestedCourses.some(s => s.code === code)) {
            suggestedCourses.push({
              code,
              name: COURSE_MAP[code],
            })
          }
        })
      }
    })

    const phrases = text
      .toLowerCase()
      .split(/[.!?;]/)
      .filter(phrase => phrase.trim().length > 10)
    phrases.forEach(phrase => {
      const phraseWords = phrase.split(/\s+/).filter(word => word.length > 3)
      phraseWords.forEach(word => {
        const searchResults = searchCoursesByName(word)
        if (searchResults.length === 1) {
          const course = searchResults[0]
          if (!recognitions.some(r => r.expanded === course.name)) {
            recognitions.push({
              original: word,
              expanded: course.name,
              confidence: 0.6,
              type: 'partial_match',
            })

            if (!suggestedCourses.some(s => s.code === course.code)) {
              suggestedCourses.push(course)
            }
          }
        } else if (searchResults.length > 1 && searchResults.length <= 3) {
          searchResults.forEach(course => {
            if (!suggestedCourses.some(s => s.code === course.code)) {
              suggestedCourses.push(course)
            }
          })
        }
      })
    })

    const courseKeywords = [
      'syllabus',
      'curriculum',
      'assignment',
      'exam',
      'cat1',
      'cat2',
      'fat',
      'quiz',
      'professor',
      'faculty',
      'lecture',
      'lab',
      'practical',
      'theory',
      'credits',
      'semester',
      'course',
      'subject',
      'module',
      'unit',
      'chapter',
    ]

    const hasCourseMentions =
      courseKeywords.some(keyword => text.toLowerCase().includes(keyword)) ||
      recognitions.length > 0

    return {
      recognitions: recognitions.sort((a, b) => b.confidence - a.confidence),
      suggestedCourses: suggestedCourses.slice(0, 8), // Limit suggestions
      hasCourseMentions,
    }
  } catch (error) {
    console.error('Error in background course recognition:', error)
    return {
      recognitions: [],
      suggestedCourses: [],
      hasCourseMentions: false,
    }
  }
}

export function quickExpandCourse(input: string): string {
  const trimmed = input.trim().toUpperCase()

  if (COURSE_MAP[trimmed]) {
    return COURSE_MAP[trimmed]
  }

  if (COURSE_ACRONYMS[trimmed]) {
    const courses = COURSE_ACRONYMS[trimmed]
    if (courses.length === 1) {
      return COURSE_MAP[courses[0]] || input
    } else {
      return `Multiple courses: ${courses.map(c => COURSE_MAP[c] || c).join(', ')}`
    }
  }

  return input
}

export function getCourseSuggestions(
  partial: string,
  limit: number = 5
): Array<{ code: string; name: string }> {
  const results = getAllCourseMatches(partial)
  return results.slice(0, limit).map(r => ({
    code: r.code,
    name: r.name,
  }))
}

export function hasCourseContext(text: string): boolean {
  const context = recognizeCoursesInBackground(text)
  return context.hasCourseMentions || context.recognitions.length > 0
}
