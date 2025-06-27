import React from 'react'

interface CourseResult {
  code: string
  slot: string
  type: string
  title: string
  faculty: string
}

interface FfcsCourseSearchResultProps {
  data: {
    results: CourseResult[]
    message: string
  }
}

const FfcsCourseSearchResult: React.FC<FfcsCourseSearchResultProps> = ({ data }) => {
  const { results } = data

  if (!results || results.length === 0) {
    return (
      <div className="p-4 bg-gray-800 text-white rounded-lg">
        <p>{data.message || 'No results found.'}</p>
      </div>
    )
  }

  const facultyMap = new Map<string, Map<string, { title: string; slots: string[] }>>()
  results.forEach(course => {
    if (!facultyMap.has(course.faculty)) {
      facultyMap.set(course.faculty, new Map())
    }
    const coursesMap = facultyMap.get(course.faculty)!

    if (!coursesMap.has(course.code)) {
      coursesMap.set(course.code, {
        title: course.title,
        slots: [],
      })
    }
    const courseData = coursesMap.get(course.code)!
    if (!courseData.slots.includes(course.slot)) {
      courseData.slots.push(course.slot)
    }
  })

  const facultyCount = facultyMap.size
  const dynamicMessage = `Found ${facultyCount} matching facult${facultyCount > 1 ? 'ies' : 'y'}.`

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg font-sans">
      <h3 className="text-xl font-bold mb-4">{results[0].title}</h3>
      <p className="text-gray-400 mb-4">{dynamicMessage}</p>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {Array.from(facultyMap.entries()).map(([faculty, coursesMap]) => (
          <div key={faculty} className="bg-gray-800 p-3 rounded-lg">
            <p className="font-bold text-lg">{faculty}</p>
            {Array.from(coursesMap.entries()).map(([code, courseData]) => (
              <div key={code} className="mt-2 pl-2 border-l-2 border-gray-700">
                <p className="text-sm font-semibold text-gray-300">
                  {courseData.title} ({code})
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {courseData.slots.map((slot, index) => (
                    <span
                      key={index}
                      className="bg-teal-600/50 text-teal-200 text-xs font-semibold px-2 py-1 rounded-full"
                    >
                      {slot}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default FfcsCourseSearchResult
