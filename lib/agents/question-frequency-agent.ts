import { getCourseCode } from '../question-generator'
import { getAllCourseMatches } from '../course-map'
import { getCoursePapers, loadChunksAndQuestions } from '../papers-db'

function resolveCourse(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  const up = trimmed.toUpperCase()
  if (/^[A-Z]{4}\d{3}[A-Z]?$/.test(up)) return up
  const mapped = getCourseCode(trimmed)
  if (mapped) return mapped
  const matches = getAllCourseMatches(trimmed)
  if (matches.length) return matches[0].code
  return null
}

function normalizeQuestion(text: string): string {
  let t = (text || '').toLowerCase()
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^\(?[a-z]\)|^\(?[ivxlcdm]+\)|^\d+\.|^\d+\)|^\(\d+\)/i, '').trim()
  t = t.replace(/[-+]?\b\d+(?:\.\d+)?\b/g, '#')
  return t
}

function tokens(s: string): string[] {
  return Array.from(new Set(s.split(/[^a-z0-9#]+/).filter(Boolean)))
}

function jaccard(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.length || !B.length) return 0
  let inter = 0
  for (const t of A) if (B.includes(t)) inter++
  const uni = new Set([...A, ...B]).size || 1
  return inter / uni
}

export async function analyzeQuestionFrequencies(opts: {
  course: string
  examType?: string
  topN?: number
  debug?: boolean
}) {
  const courseCode = resolveCourse(opts.course || '')
  if (!courseCode)
    return { success: false, error: 'Could not resolve course code', input: opts.course }

  const useDB = !!process.env.DATABASE_URL2
  if (!useDB) {
    return {
      success: false,
      error: 'Database not configured. Please enable persistence or run indexing first.',
      suggestion: 'Set DATABASE_URL2 and re-run, or use indexPastPapers first.',
      courseCode,
    }
  }

  const coursePapers = await getCoursePapers(courseCode)
  const filtered = (coursePapers || []).filter(p =>
    opts.examType
      ? String(p.exam_type || '')
          .toLowerCase()
          .replace(/[-\s]/g, '') === String(opts.examType).toLowerCase().replace(/[-\s]/g, '')
      : true
  )
  const paperIds = filtered.map(p => p.id)
  const loaded = await loadChunksAndQuestions(paperIds)
  const questionsRaw: { paper_id: string; text: string }[] = []
  for (const p of filtered) {
    const eq = p.extracted_questions as any as string[] | undefined
    if (Array.isArray(eq)) {
      for (const q of eq) questionsRaw.push({ paper_id: p.id, text: String(q) })
    }
  }
  for (const q of (loaded.questions as any[]) || []) {
    if (q && q.question) questionsRaw.push({ paper_id: q.paper_id, text: String(q.question) })
  }

  const byPaper: Map<string, { title: string; year: string; examType: string; url?: string }> =
    new Map()
  for (const p of filtered) {
    byPaper.set(p.id, {
      title: p.title || '',
      year: p.year || '',
      examType: p.exam_type || '',
      url: p.url || undefined,
    })
  }

  const normList = questionsRaw
    .map(q => ({ ...q, norm: normalizeQuestion(q.text) }))
    .filter(q => q.norm && q.norm.length >= 8)

  const used = new Array(normList.length).fill(false)
  const clusters: { rep: string; members: typeof normList; score: number }[] = []
  for (let i = 0; i < normList.length; i++) {
    if (used[i]) continue
    const base = normList[i]
    used[i] = true
    const members = [base]
    for (let j = i + 1; j < normList.length; j++) {
      if (used[j]) continue
      if (jaccard(base.norm, normList[j].norm) >= 0.88) {
        used[j] = true
        members.push(normList[j])
      }
    }
    clusters.push({ rep: base.norm, members, score: members.length })
  }
  clusters.sort((a, b) => b.score - a.score)

  const topN = Math.max(3, Math.min(opts.topN || 12, 50))
  const topPatterns = clusters.slice(0, topN).map(c => {
    const sample = c.members.slice(0, 3).map(m => m.text)
    const paperRefs = Array.from(new Set(c.members.map(m => m.paper_id)))
      .slice(0, 5)
      .map(id => byPaper.get(id))
      .filter(Boolean)
    return {
      pattern: c.rep,
      count: c.members.length,
      sampleQuestions: sample,
      samplePapers: paperRefs,
    }
  })

  const stop = new Set([
    'the',
    'a',
    'an',
    'of',
    'to',
    'and',
    'for',
    'in',
    'on',
    'with',
    'by',
    'is',
    'are',
    'be',
    'or',
    'as',
    'from',
    'that',
    'this',
    'it',
    'its',
    'let',
    'given',
  ])
  const freq = new Map<string, number>()
  for (const q of normList) {
    for (const t of tokens(q.norm)) {
      if (t.length < 3 || stop.has(t)) continue
      freq.set(t, (freq.get(t) || 0) + 1)
    }
  }
  const topKeywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([token, count]) => ({ token, count }))

  const summary = {
    success: true as const,
    courseCode,
    examType: opts.examType,
    totals: {
      papers: filtered.length,
      questions: normList.length,
      distinctPatterns: clusters.length,
    },
    topPatterns,
    topKeywords,
    source: 'question-patterns',
    message: `found ${topPatterns.length} repeated patterns from ${normList.length} questions across ${filtered.length} paper(s) for ${courseCode}${opts.examType ? ` (${opts.examType})` : ''}`,
  }

  return summary
}
