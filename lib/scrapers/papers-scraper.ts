interface Paper {
  title: string
  url: string
  source: string
  metadata: string
  examType: string
  year: string
}

interface ApiPaper {
  _id: string
  title?: string
  name?: string
  paperName?: string
  url?: string
  downloadUrl?: string
  link?: string
  paperUrl?: string
  finalUrl?: string
  metadata?: string
  description?: string
  examType?: string
  exam?: string
  year?: string
  academicYear?: string
  slot?: string
  semester?: string
  subject?: string
  courseCode?: string
  thumbnailUrl?: string
  originalFilename?: string
  fileSize?: number
  mimeType?: string
  createdAt?: string
}

interface ScraperResult {
  success: boolean
  papers: Paper[]
  error?: string
  source: string
  searchUrl?: string
}

function deduplicatePapers(papers: Paper[]): Paper[] {
  const seen = new Set<string>()
  const uniquePapers: Paper[] = []

  for (const paper of papers) {
    const normalizedTitle = paper.title.replace(/Select$/, '').trim()
    const key = `${normalizedTitle}-${paper.examType}-${paper.year}-${paper.metadata}`.toLowerCase()

    if (!seen.has(key)) {
      seen.add(key)
      uniquePapers.push({
        ...paper,
        title: normalizedTitle,
      })
    }
  }

  return uniquePapers
}

export async function scrapePapersService(
  courseCode: string,
  examType?: string,
  year?: string
): Promise<ScraperResult> {
  try {
    const baseUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:3001' 
      : process.env.PAPERS_SERVICE_URL || 'https://papers.vitassistant.com'
    
    const params = new URLSearchParams()
    if (courseCode) params.append('courseCode', courseCode)
    if (examType) params.append('examType', examType)
    if (year) params.append('year', year)
    params.append('limit', '50')

    const searchUrl = `${baseUrl}/api/papers?${params.toString()}`

    const response = await fetch(searchUrl, {
      headers: {
        accept: 'application/json',
        'User-Agent': 'the-everything-assistant/1.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Papers service returned ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      return {
        success: false,
        papers: [],
        error: data.error || 'Papers service returned error',
        source: 'VIT Papers Archive',
        searchUrl,
      }
    }

    const papersArray = Array.isArray(data.papers) ? data.papers : []

    if (papersArray.length === 0) {
      return {
        success: false,
        papers: [],
        error: 'No papers found',
        source: 'VIT Papers Archive',
        searchUrl,
      }
    }

    const papers = papersArray
      .map((paper: ApiPaper) => {
        const title = paper.title || paper.name || paper.paperName || 'Untitled Paper'
        const url = paper.finalUrl || paper.downloadUrl || paper.url || ''
        
        let extractedExamType = paper.examType || paper.exam || examType || ''
        if (!extractedExamType) {
          const titleLower = title.toLowerCase()
          if (titleLower.includes('cat-1') || titleLower.includes('cat 1')) extractedExamType = 'CAT-1'
          else if (titleLower.includes('cat-2') || titleLower.includes('cat 2')) extractedExamType = 'CAT-2'
          else if (titleLower.includes('fat') || titleLower.includes('final')) extractedExamType = 'FAT'
          else if (titleLower.includes('quiz')) extractedExamType = 'Quiz'
        }

        let extractedYear = paper.year || paper.academicYear || year || ''
        if (!extractedYear) {
          const yearMatch = title.match(/20\d{2}/)
          if (yearMatch) extractedYear = yearMatch[0]
        }

        return {
          title,
          url,
          source: 'VIT Papers Archive',
          metadata: paper.metadata || `${paper.slot || ''} ${paper.semester || ''}`.trim(),
          examType: extractedExamType,
          year: extractedYear,
        }
      })
      .filter((paper: Paper) => paper.url)

    let filteredPapers = papers

    if (examType) {
      filteredPapers = filteredPapers.filter((paper: Paper) => {
        const paperTitle = paper.title.toLowerCase()
        const paperMeta = paper.metadata.toLowerCase()
        const examTypeLower = examType.toLowerCase()

        return (
          paperTitle.includes(examTypeLower) ||
          paperMeta.includes(examTypeLower) ||
          (paper.examType && paper.examType.toLowerCase().includes(examTypeLower))
        )
      })
    }

    if (year) {
      filteredPapers = filteredPapers.filter((paper: Paper) => {
        const paperTitle = paper.title.toLowerCase()
        const paperMeta = paper.metadata.toLowerCase()

        return (
          paperTitle.includes(year) ||
          paperMeta.includes(year) ||
          (paper.year && paper.year.includes(year))
        )
      })
    }

    const uniquePapers = deduplicatePapers(filteredPapers)

    return {
      success: true,
      papers: uniquePapers,
      source: 'VIT Papers Archive',
      searchUrl,
    }

  } catch (error) {
    console.error('Error in scrapePapersService:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: 'VIT Papers Archive',
    }
  }
}
