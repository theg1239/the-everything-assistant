import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { findFullCourseName } from '../course-map'

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

export async function scrapePapersCodeChef(
  courseCode: string,
  examType?: string,
  year?: string
): Promise<ScraperResult> {
  try {
    const apiResult = await tryAPIApproach(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error) {
    console.error('Error in scrapePapersCodeChef:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: 'papers.codechefvit.com',
    }
  }
}

async function tryAPIApproach(
  courseCode: string,
  examType?: string,
  year?: string
): Promise<ScraperResult> {
  try {
    const fullCourseName = findFullCourseName(courseCode)

    const searchUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(fullCourseName)}`

    const response = await fetch(searchUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        Referer: `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`,
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })

    if (response.ok) {
      const data = await response.json()

      const papersArray = Array.isArray(data) ? data : data.papers || []

      if (papersArray && papersArray.length > 0) {
        const validatedPapers = await Promise.all(
          papersArray.map(async (paper: ApiPaper) => {
            const title =
              paper.title ||
              paper.name ||
              paper.paperName ||
              `${paper.subject || courseCode} ${paper.exam || ''} ${paper.slot || ''} ${paper.year || ''} ${paper.semester || ''}`.trim()

            let extractedExamType = paper.examType || paper.exam || examType || ''
            if (!extractedExamType || extractedExamType === 'unknown') {
              const titleLower = title.toLowerCase()
              if (titleLower.includes('cat-1') || titleLower.includes('cat 1'))
                extractedExamType = 'CAT-1'
              else if (titleLower.includes('cat-2') || titleLower.includes('cat 2'))
                extractedExamType = 'CAT-2'
              else if (titleLower.includes('fat') || titleLower.includes('final'))
                extractedExamType = 'FAT'
              else if (titleLower.includes('quiz')) extractedExamType = 'Quiz'
            }

            let extractedYear = paper.year || paper.academicYear || year || ''
            if (!extractedYear || extractedYear === 'unknown') {
              const yearMatch = title.match(/20\d{2}/)
              if (yearMatch) extractedYear = yearMatch[0]
            }

            const paperUrl =
              paper.finalUrl ||
              (paper._id ? `https://papers.codechefvit.com/paper/${paper._id}` : '')

            let isValid = true
            if (paper.finalUrl) {
              try {
                const validateResponse = await fetch(paper.finalUrl, { method: 'HEAD' })
                isValid = validateResponse.ok
              } catch (error) {
                console.warn(`Paper validation failed for ${title}:`, error)
                isValid = false
              }
            }

            // If finalUrl is not available or invalid, skip this paper
            if (!paper.finalUrl || !isValid) {
              return null
            }

            return {
              title,
              url: paperUrl,
              source: 'papers.codechefvit.com',
              metadata:
                paper.metadata ||
                paper.description ||
                `${paper.slot || ''} ${paper.semester || ''}`.trim(),
              examType: extractedExamType,
              year: extractedYear,
            }
          })
        )

        let papers = validatedPapers.filter(paper => paper !== null) as Paper[]
        papers = deduplicatePapers(papers)

        if (examType) {
          papers = papers.filter(paper => {
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
          papers = papers.filter(paper => {
            const paperTitle = paper.title.toLowerCase()
            const paperMeta = paper.metadata.toLowerCase()

            return (
              paperTitle.includes(year) ||
              paperMeta.includes(year) ||
              (paper.year && paper.year.includes(year))
            )
          })
        }

        return {
          success: true,
          papers: papers,
          source: 'papers.codechefvit.com',
          searchUrl: searchUrl,
        }
      }
    }

    const codeOnlyUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(courseCode)}`
    const codeResponse = await fetch(codeOnlyUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (codeResponse.ok) {
      const codeData = await codeResponse.json()
      const papersArray = Array.isArray(codeData) ? codeData : codeData.papers || []

      if (papersArray && papersArray.length > 0) {
        const validatedPapers = await Promise.all(
          papersArray.map(async (paper: ApiPaper) => {
            const title =
              paper.title ||
              paper.name ||
              paper.paperName ||
              `${paper.subject || courseCode} ${paper.exam || ''} ${paper.slot || ''} ${paper.year || ''} ${paper.semester || ''}`.trim()

            let extractedExamType = paper.examType || paper.exam || examType || ''
            if (!extractedExamType) {
              const titleLower = title.toLowerCase()
              if (titleLower.includes('cat-1') || titleLower.includes('cat 1'))
                extractedExamType = 'CAT-1'
              else if (titleLower.includes('cat-2') || titleLower.includes('cat 2'))
                extractedExamType = 'CAT-2'
              else if (titleLower.includes('fat') || titleLower.includes('final'))
                extractedExamType = 'FAT'
              else if (titleLower.includes('quiz')) extractedExamType = 'Quiz'
            }

            let extractedYear = paper.year || paper.academicYear || year || ''
            if (!extractedYear) {
              const yearMatch = title.match(/20\d{2}/)
              if (yearMatch) extractedYear = yearMatch[0]
            }

            const paperUrl =
              paper.finalUrl ||
              (paper._id ? `https://papers.codechefvit.com/paper/${paper._id}` : '')

            let isValid = true
            if (paper.finalUrl) {
              try {
                const validateResponse = await fetch(paper.finalUrl, { method: 'HEAD' })
                isValid = validateResponse.ok
              } catch (error) {
                console.warn(`Paper validation failed for ${title}:`, error)
                isValid = false
              }
            }

            // If finalUrl is not available or invalid, skip this paper
            if (!paper.finalUrl || !isValid) {
              return null
            }

            return {
              title,
              url: paperUrl,
              source: 'papers.codechefvit.com',
              metadata:
                paper.metadata ||
                paper.description ||
                `${paper.slot || ''} ${paper.semester || ''}`.trim(),
              examType: extractedExamType,
              year: extractedYear,
            }
          })
        )

        let papers = validatedPapers.filter(paper => paper !== null) as Paper[]
        papers = deduplicatePapers(papers)

        return {
          success: true,
          papers: papers,
          source: 'papers.codechefvit.com',
          searchUrl: codeOnlyUrl,
        }
      }
    }

    return { success: false, papers: [], source: 'papers.codechefvit.com' }
  } catch (error) {
    console.error('API approach error:', error)
    return { success: false, papers: [], source: 'papers.codechefvit.com' }
  }
}

async function tryBrowserScraping(
  courseCode: string,
  examType?: string,
  year?: string
): Promise<ScraperResult> {
  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    const fullCourseName = findFullCourseName(courseCode)
    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 })

    await new Promise(res => setTimeout(res, 3000))

    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll(
            'a[href*="/paper/"], .paper-card, .paper-item, [data-testid*="paper"], .card, .grid > div, .paper-link'
          )
        )

        const results: {
          title: string
          url: string
          source: string
          metadata: string
          examType: string
          year: string
        }[] = []

        paperElements.forEach(element => {
          const titleElement = element.querySelector('h3, h2, .title, .paper-title, .card-title')
          const linkElement = element.tagName === 'A' ? element : element.querySelector('a')
          const metaElement = element.querySelector('.meta, .details, .paper-meta, .subtitle')

          const title = titleElement?.textContent?.trim() || element.textContent?.trim()
          const href = linkElement?.getAttribute('href')
          const meta = metaElement?.textContent?.trim()

          if (title && href && title.length > 5) {
            // Remove "Select" suffix from title
            const cleanTitle = title.replace(/Select$/, '').trim()

            const titleLower = cleanTitle.toLowerCase()
            const courseLower = courseCode.toLowerCase()
            const metaLower = (meta || '').toLowerCase()

            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, ' $1')) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, '$1 $2')) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)([a-z])/, '$1 $2 $3'))

            const matchesExam =
              !examType ||
              titleLower.includes(examType.toLowerCase()) ||
              metaLower.includes(examType.toLowerCase()) ||
              (examType.toLowerCase() === 'cat1' &&
                (titleLower.includes('cat 1') || titleLower.includes('cat-1'))) ||
              (examType.toLowerCase() === 'cat2' &&
                (titleLower.includes('cat 2') || titleLower.includes('cat-2'))) ||
              (examType.toLowerCase() === 'fat' && titleLower.includes('final'))

            const matchesYear = !year || titleLower.includes(year) || metaLower.includes(year)

            if (matchesCourse && matchesExam && matchesYear) {
              let extractedExamType = examType || ''
              if (!extractedExamType) {
                if (titleLower.includes('cat-1') || titleLower.includes('cat 1'))
                  extractedExamType = 'CAT-1'
                else if (titleLower.includes('cat-2') || titleLower.includes('cat 2'))
                  extractedExamType = 'CAT-2'
                else if (titleLower.includes('fat') || titleLower.includes('final'))
                  extractedExamType = 'FAT'
                else if (titleLower.includes('quiz')) extractedExamType = 'Quiz'
                else extractedExamType = 'unknown'
              }

              let extractedYear = year || ''
              if (!extractedYear) {
                const yearMatch = cleanTitle.match(/20\d{2}/)
                if (yearMatch) extractedYear = yearMatch[0]
                else extractedYear = 'unknown'
              }

              results.push({
                title: cleanTitle.substring(0, 100),
                url: href.startsWith('http') ? href : `https://papers.codechefvit.com${href}`,
                source: 'papers.codechefvit.com',
                metadata: meta || '',
                examType: extractedExamType,
                year: extractedYear,
              })
            }
          }
        })

        return results
      },
      courseCode,
      examType,
      year
    )

    const papersWithFinalUrls = await Promise.all(
      papers.map(async paper => {
        if (paper.url.includes('.pdf') || paper.url.includes('cloudinary.com')) {
          return paper
        }

        try {
          const finalUrlPromise = extractFinalUrlFromPaperPage(paper.url)
          const timeoutPromise = new Promise<string | null>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 15000)
          )

          const finalUrl = await Promise.race([finalUrlPromise, timeoutPromise])

          if (finalUrl && finalUrl.includes('cloudinary.com')) {
            try {
              const response = await fetch(finalUrl, { method: 'HEAD' })
              if (response.ok) {
                return {
                  ...paper,
                  url: finalUrl, // Use the Cloudinary PDF URL instead of the paper page URL
                }
              }
            } catch (validationError) {
              console.warn(`Final URL validation failed for ${paper.title}:`, validationError)
            }
          }
        } catch (error) {
          console.warn(`Failed to extract finalUrl for ${paper.title}:`, error)
        }

        return paper
      })
    )

    const deduplicatedPapers = deduplicatePapers(papersWithFinalUrls as Paper[])

    return {
      success: true,
      papers: deduplicatedPapers,
      source: 'papers.codechefvit.com',
    }
  } catch (error) {
    console.error('Error in browser scraping:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: 'papers.codechefvit.com',
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function extractFinalUrlFromPaperPage(paperPageUrl: string): Promise<string | null> {
  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    await page.goto(paperPageUrl, { waitUntil: 'networkidle2', timeout: 8000 })

    await new Promise(res => setTimeout(res, 1000))

    const finalUrl = await page.evaluate(() => {
      const cloudinaryLinks = Array.from(document.querySelectorAll('a[href*="cloudinary.com"]'))
      if (cloudinaryLinks.length > 0) {
        return (cloudinaryLinks[0] as HTMLAnchorElement).href
      }

      const downloadButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      for (const button of downloadButtons) {
        const text = button.textContent?.toLowerCase() || ''
        if (
          text.includes('download') ||
          text.includes('view') ||
          text.includes('open') ||
          text.includes('pdf')
        ) {
          const href =
            button.getAttribute('href') ||
            button.getAttribute('data-url') ||
            button.getAttribute('data-href') ||
            button.getAttribute('onclick')?.match(/window\.open\(['"]([^'"]+)['"]/)?.[1]
          if (href && href.includes('cloudinary.com')) {
            return href
          }
        }
      }

      const scripts = Array.from(document.querySelectorAll('script'))
      for (const script of scripts) {
        const content = script.textContent || ''

        const finalUrlMatch = content.match(/finalUrl['"]?\s*:\s*['"]([^'"]+)['"]/i)
        if (finalUrlMatch && finalUrlMatch[1].includes('cloudinary.com')) {
          return finalUrlMatch[1]
        }

        const cloudinaryMatch = content.match(/https?:\/\/[^"']*cloudinary\.com[^"']*\.pdf/g)
        if (cloudinaryMatch && cloudinaryMatch.length > 0) {
          return cloudinaryMatch[0]
        }
      }

      const iframes = Array.from(document.querySelectorAll('iframe'))
      for (const iframe of iframes) {
        const src = iframe.getAttribute('src')
        if (src && src.includes('cloudinary.com') && src.includes('.pdf')) {
          return src
        }
      }

      const embeds = Array.from(document.querySelectorAll('embed, object'))
      for (const embed of embeds) {
        const src = embed.getAttribute('src') || embed.getAttribute('data')
        if (src && src.includes('cloudinary.com') && src.includes('.pdf')) {
          return src
        }
      }

      return null
    })

    return finalUrl
  } catch (error) {
    console.warn(`Failed to extract finalUrl from ${paperPageUrl}:`, error)
    return null
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
