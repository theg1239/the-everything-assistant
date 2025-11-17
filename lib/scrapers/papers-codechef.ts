import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { findFullCourseName } from '../course-map'

const DEBUG_PAPERS =
  process.env.DEBUG_PAPERS_CODECHEF === '1' ||
  process.env.DEBUG_PAPERS_CODECHEF === 'true' ||
  process.env.DEBUG_SCRAPERS === '1' ||
  process.env.DEBUG_SCRAPERS === 'true'

function dbg(...args: any[]) {
  if (DEBUG_PAPERS) console.log('[papers-codechef]', ...args)
}

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
  final_url?: string
  file_url?: string
  metadata?: string
  description?: string
  examType?: string
  exam?: string
  paperType?: string
  year?: string
  academicYear?: string
  slot?: string
  semester?: string
  subject?: string
  paperDate?: string
  paper_link?: string
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
    dbg('start', { courseCode, examType, year })
    const apiResult = await tryAPIApproach(courseCode, examType, year)
    dbg('apiResult', {
      success: apiResult.success,
      count: apiResult.papers?.length || 0,
      source: apiResult.source,
      searchUrl: apiResult.searchUrl,
      error: apiResult.error,
    })

    if (apiResult.success) {
      return apiResult
    }

    dbg('API failed, falling back to browser scraping')
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
    dbg('tryAPIApproach fullCourseName', { courseCode, fullCourseName })
    const searchUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(fullCourseName)}`
    dbg('fetch fullCourseName url', searchUrl)
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
      dbg('response ok for fullCourseName search')
      const data = await response.json()

      const papersArray = Array.isArray(data) ? data : data.papers || []
      dbg('api returned items', papersArray.length)

      if (papersArray && papersArray.length > 0) {
        let skippedNoFinalUrl = 0
        let headFailCount = 0
        let headOkCount = 0
        const validatedPapers = await Promise.all(
          papersArray.map(async (paper: ApiPaper) => {
            const title =
              paper.title ||
              paper.name ||
              paper.paperName ||
              `${paper.subject || courseCode} ${paper.exam || ''} ${paper.slot || ''} ${paper.year || ''} ${paper.semester || ''}`.trim()

            let extractedExamType =
              paper.examType || paper.exam || (paper as any).paperType || examType || ''
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

            const finalUrlCandidate =
              paper.finalUrl ||
              (paper as any).final_url ||
              paper.downloadUrl ||
              (paper as any).file_url
            const paperUrl =
              finalUrlCandidate ||
              paper.paperUrl ||
              paper.url ||
              paper.link ||
              (paper._id ? `https://papers.codechefvit.com/paper/${paper._id}` : '')

            let isValid = true
            if (finalUrlCandidate) {
              try {
                const validateResponse = await fetch(finalUrlCandidate, { method: 'HEAD' })
                isValid = validateResponse.ok
                if (isValid) headOkCount++
                else headFailCount++
              } catch (error) {
                console.warn(`Paper validation failed for ${title}:`, error)
                isValid = false
                headFailCount++
              }
            }

            if (!finalUrlCandidate || !isValid) {
              if (!finalUrlCandidate) skippedNoFinalUrl++
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
        dbg('post-validate counts', {
          totalIn: papersArray.length,
          keptAfterValidate: papers.length,
          skippedNoFinalUrl,
          headOkCount,
          headFailCount,
        })
        const beforeDedupe = papers.length
        papers = deduplicatePapers(papers)
        if (beforeDedupe !== papers.length)
          dbg('deduped', { before: beforeDedupe, after: papers.length })

        if (examType) {
          const before = papers.length
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
          dbg('examType filter', { examType, before, after: papers.length })
        }

        if (year) {
          const before = papers.length
          papers = papers.filter(paper => {
            const paperTitle = paper.title.toLowerCase()
            const paperMeta = paper.metadata.toLowerCase()

            return (
              paperTitle.includes(year) ||
              paperMeta.includes(year) ||
              (paper.year && paper.year.includes(year))
            )
          })
          dbg('year filter', { year, before, after: papers.length })
        }

        return {
          success: true,
          papers: papers,
          source: 'papers.codechefvit.com',
          searchUrl: searchUrl,
        }
      }
    } else {
      let text = ''
      try {
        text = await response.text()
      } catch {}
      dbg('response not ok for fullCourseName search', {
        status: response.status,
        bodySnippet: text?.slice(0, 200),
      })
    }

    const codeOnlyUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(courseCode)}`
    dbg('fetch codeOnly url', codeOnlyUrl)
    const codeResponse = await fetch(codeOnlyUrl, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (codeResponse.ok) {
      dbg('response ok for codeOnly search')
      const codeData = await codeResponse.json()
      const papersArray = Array.isArray(codeData) ? codeData : codeData.papers || []
      dbg('api returned items (codeOnly)', papersArray.length)

      if (papersArray) {
        let skippedNoFinalUrl = 0
        let headFailCount = 0
        let headOkCount = 0
        const validatedPapers = await Promise.all(
          papersArray.map(async (paper: ApiPaper) => {
            const title =
              paper.title ||
              paper.name ||
              paper.paperName ||
              `${paper.subject || courseCode} ${paper.exam || ''} ${paper.slot || ''} ${paper.year || ''} ${paper.semester || ''}`.trim()

            let extractedExamType =
              paper.examType || paper.exam || (paper as any).paperType || examType || ''
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

            const finalUrlCandidate =
              paper.finalUrl ||
              (paper as any).final_url ||
              paper.downloadUrl ||
              (paper as any).file_url
            const paperUrl =
              finalUrlCandidate ||
              paper.paperUrl ||
              paper.url ||
              paper.link ||
              (paper._id ? `https://papers.codechefvit.com/paper/${paper._id}` : '')

            let isValid = true
            if (finalUrlCandidate) {
              try {
                const validateResponse = await fetch(finalUrlCandidate, { method: 'HEAD' })
                isValid = validateResponse.ok
                if (isValid) headOkCount++
                else headFailCount++
              } catch (error) {
                console.warn(`Paper validation failed for ${title}:`, error)
                isValid = false
                headFailCount++
              }
            }

            if (!finalUrlCandidate || !isValid) {
              if (!finalUrlCandidate) skippedNoFinalUrl++
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
        dbg('post-validate counts (codeOnly)', {
          totalIn: papersArray.length,
          keptAfterValidate: papers.length,
          skippedNoFinalUrl,
          headOkCount,
          headFailCount,
        })
        const beforeDedupe = papers.length
        papers = deduplicatePapers(papers)
        if (beforeDedupe !== papers.length)
          dbg('deduped (codeOnly)', { before: beforeDedupe, after: papers.length })

        return {
          success: true,
          papers: papers,
          source: 'papers.codechefvit.com',
          searchUrl: codeOnlyUrl,
        }
      }
    } else {
      let text = ''
      try {
        text = await codeResponse.text()
      } catch {}
      dbg('response not ok for codeOnly search', {
        status: codeResponse.status,
        bodySnippet: text?.slice(0, 200),
      })
    }

    dbg('API approached completed, returning 0 papers')
    return { success: true, papers: [], source: 'papers.codechefvit.com' }
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
    dbg('launching puppeteer for browser scraping')
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    const fullCourseName = findFullCourseName(courseCode)
    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`
    dbg('browser goto', { searchUrl, fullCourseName })
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }) // Faster loading

    await new Promise(res => setTimeout(res, 1500)) // Reduced wait time

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

    dbg('initial scraped paper cards', papers.length)
    const papersWithFinalUrls: Paper[] = []

    for (const paper of papers) {
      if (paper.url.includes('.pdf') || paper.url.includes('cloudinary.com')) {
        papersWithFinalUrls.push(paper)
        continue
      }

      try {
        const finalUrlPromise = extractFinalUrlFromPaperPage(paper.url)
        const timeoutPromise = new Promise<string | null>(
          (_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000) // Reduced from 15000 to 8000
        )

        const finalUrl = await Promise.race([finalUrlPromise, timeoutPromise])

        if (finalUrl && finalUrl.includes('cloudinary.com')) {
          try {
            const response = await fetch(finalUrl, { method: 'HEAD' })
            if (response.ok) {
              papersWithFinalUrls.push({
                ...paper,
                url: finalUrl, // Use the Cloudinary PDF URL instead of the paper page URL
              })
              continue
            }
          } catch (validationError) {
            console.warn(`Final URL validation failed for ${paper.title}:`, validationError)
            dbg('finalUrl HEAD failed (browser scraping)', { title: paper.title, finalUrl })
          }
        }
      } catch (error) {
        console.warn(`Failed to extract finalUrl for ${paper.title}:`, error)
        dbg('finalUrl extraction error or timeout', { title: paper.title, pageUrl: paper.url })
      }

      papersWithFinalUrls.push(paper)
    }

    const deduplicatedPapers = deduplicatePapers(papersWithFinalUrls as Paper[])
    dbg('browser scraping result count', deduplicatedPapers.length)

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
      try {
        await browser.close()
      } catch (closeError) {
        console.warn('Browser cleanup error in tryBrowserScraping:', closeError)
      }
    }
  }
}

async function extractFinalUrlFromPaperPage(paperPageUrl: string): Promise<string | null> {
  let browser
  try {
    await new Promise(resolve => setTimeout(resolve, 200)) // Reduced from 500ms

    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    await page.goto(paperPageUrl, { waitUntil: 'domcontentloaded', timeout: 6000 })

    await new Promise(res => setTimeout(res, 500))

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
      try {
        await browser.close()
      } catch (closeError) {
        console.warn(`Browser cleanup error for ${paperPageUrl}:`, closeError)
      }
    }
  }
}
