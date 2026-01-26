import { tool } from 'ai'
import * as z from 'zod/v3';

export function syllabusTools() {
  const getSyllabus = tool({
    description:
      'Fetch the syllabus PDF for a given course. Looks up filenames from public/syllabi.json and constructs a Google Storage URL. Accepts course code or partial course name.',
    inputSchema: z.object({
      query: z.string().describe('Course code (e.g., ACXC101N) or course name (e.g., "Art of Advertising")'),
    }),
    execute: async ({ query }) => {
      try {
        if (!query || query.trim().length === 0) {
          return {
            success: false,
            error: 'Query required',
            message: 'Please provide a course code or course name to lookup the syllabus.',
          }
        }

        const base = typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000' : ''
        const res = await fetch(`${base}/syllabi.json`)
        if (!res.ok) {
          return { success: false, error: `Could not load syllabi.json (${res.status})` }
        }

        const data: any = await res.json()
        const qRaw = query.trim()
        const q = qRaw.toLowerCase()
        const tokens = q
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, ' ')
          .split(/\s+/)
          .filter(Boolean)

        const normalizeFilename = (fn: string) => {
          if (!fn || typeof fn !== 'string') return { code: null, title: null }
          const baseName = (fn.split('/').pop() || fn).replace(/\.[^.]+$/, '')
          const parts = baseName.split(/_(.+)/)
          const codePart = parts[0] || ''
          const titlePart = parts[1] || ''
          const title = titlePart
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase())
          return { code: codePart, title: title || null }
        }

        const scoreCandidate = (cand: any) => {
          let code = ''
          let title = ''
          let filename = ''
          if (typeof cand === 'string') {
            filename = cand
            code = cand.split('_')[0] || ''
          } else if (cand && typeof cand === 'object') {
            code = (cand.code || '').toString()
            title = (cand.title || '').toString()
            filename = (cand.file || cand.filename || '').toString()
          }
          const hay = (code + ' ' + title + ' ' + filename).toLowerCase()
          let score = 0
          if (code.toLowerCase() === q) score += 100
          if (filename.toLowerCase() === q) score += 80
          for (const t of tokens) {
            if (hay.includes(t)) score += 10
            const re = new RegExp('\\b' + t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b')
            if (re.test(hay)) score += 5
          }
          return score
        }

        const pick = (list: any[]): any | null => {
          let best: any = null
          let bestScore = 0
          for (const item of list) {
            const score = scoreCandidate(item)
            if (score > bestScore) {
              best = item
              bestScore = score
            }
          }
          return best
        }

        let best: any = null
        if (Array.isArray(data) && data.length > 0) {
          best = pick(data)
        } else if (Array.isArray(data?.syllabi)) {
          best = pick(data.syllabi)
        }

        if (!best) {
          return {
            success: false,
            message: `No syllabus found for "${query}".`,
          }
        }

        const filename = typeof best === 'string' ? best : best.file || best.filename
        const { code, title } = normalizeFilename(filename || '')
        const fileUrl = `https://storage.googleapis.com/examcooker/syllabi/${filename}`

        return {
          success: true,
          code,
          title,
          fileUrl,
          message: `Found syllabus for ${code || title || 'course'}`,
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to fetch syllabus',
          message: 'Unable to lookup syllabus right now.',
        }
      }
    },
  })

  return { getSyllabus }
}

export type SyllabusTools = ReturnType<typeof syllabusTools>

