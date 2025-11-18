import React, { useState, useEffect, useMemo } from 'react'
import { Course, FFCSToolData, getCourseData } from '@/lib/ffcs-tool'
import TimetableGrid, { TimetableEntry, TimetableSchema } from '../timetable-grid'
import { v4 as uuidv4 } from 'uuid'
import { Calendar, X } from 'lucide-react'
import { readJson } from '@/lib/http'

const FFCSArtifact: React.FC = () => {
  const [school, setSchool] = useState<
    'smec' | 'score' | 'scope' | 'sbst' | 'sce' | 'scheme' | 'select' | 'sense'
  >(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ffcs_school')
      const valid = ['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense']
      if (saved && valid.includes(saved)) return saved as any
    }
    return 'smec'
  })
  const campus = 'vellore'
  const [courseData, setCourseData] = useState<FFCSToolData>({ allCourses: [], uniqueCourses: [] })
  const [timetableSchema, setTimetableSchema] = useState<TimetableSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Course[]>([])
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [showTimetable, setShowTimetable] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ffcs_school', school)
    }
  }, [school])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setSelectedCourse(null)
      setTimetableSchema(null)

      const savedTimetable = localStorage.getItem(`ffcs_timetable_${school}`)
      if (savedTimetable) {
        setTimetable(JSON.parse(savedTimetable))
      } else {
        setTimetable([])
      }

      try {
        const data = await getCourseData(school)
        setCourseData(data)

        const schemaResponse = await fetch(`/ffcs/schemas/${campus}.json`)
        if (!schemaResponse.ok) {
          throw new Error('Failed to load timetable schema')
        }
        const schemaData = await readJson<TimetableSchema>(schemaResponse)
        setTimetableSchema(schemaData)
      } catch (error) {
        console.error(`Failed to load courses or schema for ${campus}:`, error)
        setCourseData({ allCourses: [], uniqueCourses: [] })
        setTimetableSchema(null)
      }
      setLoading(false)
    }
    loadData()
  }, [school])

  useEffect(() => {
    localStorage.setItem(`ffcs_timetable_${school}`, JSON.stringify(timetable))
  }, [timetable, campus])

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([])
      return
    }
    const results = courseData.uniqueCourses.filter(
      course =>
        course.CODE.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.TITLE.toLowerCase().includes(searchQuery.toLowerCase())
    )
    setSearchResults(results.slice(0, 100))
  }, [searchQuery, courseData.uniqueCourses])

  const availableSlots = useMemo(() => {
    if (!selectedCourse) return []
    return courseData.allCourses.filter(
      c => c.CODE === selectedCourse.CODE && c.TITLE === selectedCourse.TITLE
    )
  }, [selectedCourse, courseData.allCourses])

  const parseSlots = (slotStr: string): string[] => slotStr.split('+')

  const checkConflict = (newCourse: Course): boolean => {
    const newSlots = parseSlots(newCourse.SLOT)
    const currentSlots = new Set(timetable.flatMap(entry => parseSlots(entry.course.SLOT)))
    return newSlots.some(slot => currentSlots.has(slot))
  }

  const addToTimetable = (courseToAdd: Course) => {
    if (checkConflict(courseToAdd)) {
      alert(`Conflict detected! Cannot add ${courseToAdd.CODE} in slot ${courseToAdd.SLOT}.`)
      return
    }
    setTimetable(prev => [...prev, { id: uuidv4(), course: courseToAdd }])
  }

  const removeFromTimetable = (id: string) => {
    setTimetable(prev => prev.filter(item => item.id !== id))
  }

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course)
    setSearchQuery('')
    setSearchResults([])
  }

  return (
    <div className="p-4 bg-gray-900 text-white rounded-lg font-sans">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">FFCS Planner</h2>
        <button
          onClick={() => setShowTimetable(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-transform transform hover:scale-105"
        >
          <Calendar size={18} />
          View Timetable
          {timetable.length > 0 && (
            <span className="bg-rose-500 text-white text-xs font-semibold rounded-full h-5 w-5 flex items-center justify-center">
              {timetable.length}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-4 rounded-lg space-y-4">
          <h3 className="text-xl font-semibold">Course Selection</h3>
          <select
            value={school}
            onChange={e => setSchool(e.target.value as any)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
          >
            <option value="smec">SMEC</option>
            <option value="score">SCORE</option>
            <option value="scope">SCOPE</option>
            <option value="sbst">SBST</option>
            <option value="sce">SCE</option>
            <option value="scheme">SCHEME</option>
            <option value="select">SELECT</option>
            <option value="sense">SENSE</option>
          </select>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by course code or title..."
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2"
            />
            {searchQuery && (
              <div className="absolute z-10 w-full mt-1 bg-gray-900 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map(course => (
                  <div
                    key={course.CODE}
                    onClick={() => handleSelectCourse(course)}
                    className="p-3 cursor-pointer hover:bg-gray-700 border-b border-gray-700"
                  >
                    <p className="font-bold">{course.CODE}</p>
                    <p className="text-sm text-gray-400">{course.TITLE}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedCourse && (
            <div className="mt-4">
              <h4 className="font-bold text-lg">
                {selectedCourse.CODE} - {selectedCourse.TITLE}
              </h4>
              <p className="text-sm text-gray-400 mb-2">Available Slots:</p>
              <div className="max-h-48 overflow-y-auto bg-gray-900 p-2 rounded-md">
                {availableSlots.map((slot, index) => (
                  <div
                    key={`${slot.SLOT}-${index}`}
                    className="p-2 border-b border-gray-700 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-semibold">{slot.SLOT}</p>
                      <p className="text-xs text-gray-400">{slot.FACULTY}</p>
                    </div>
                    <button
                      onClick={() => addToTimetable(slot)}
                      className="bg-green-600 hover:bg-green-700 rounded-md px-3 py-1 text-xs font-semibold"
                    >
                      ADD
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 p-4 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Added Courses</h3>
          <div className="h-96 overflow-y-auto bg-gray-900 p-2 rounded-md">
            {timetable.length === 0 ? (
              <p className="text-gray-500 text-center mt-10">Your timetable is empty.</p>
            ) : (
              timetable.map(entry => (
                <div
                  key={entry.id}
                  className="p-3 border-b border-gray-700 flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold">
                      {entry.course.CODE} - {entry.course.TITLE}
                    </p>
                    <p className="text-sm text-gray-400">
                      {entry.course.FACULTY} |{' '}
                      <span className="font-semibold text-teal-400">{entry.course.SLOT}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromTimetable(entry.id)}
                    className="bg-red-600 hover:bg-red-700 rounded-md px-3 py-1 text-xs font-semibold"
                  >
                    REMOVE
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showTimetable && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold">Generated Timetable</h3>
              <button
                onClick={() => setShowTimetable(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4 overflow-auto">
              {timetableSchema ? (
                <TimetableGrid timetable={timetable} schema={timetableSchema as TimetableSchema} />
              ) : (
                <p className="text-center text-gray-400">Loading timetable view...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FFCSArtifact
