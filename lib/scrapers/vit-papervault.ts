import { findFullCourseName } from '../course-map'
import { BROWSER_TOOLS_ENABLED } from '../browser-flags'

interface PaperVaultEntry {
  subjectName: string
  paperType: string
  paperDate: string
  paperLink: string
  paperSlot: string
}

export async function scrapeVITPaperVault(courseCode: string, examType?: string, year?: string) {
  try {
    const apiResult = await tryVITVaultListAPI(courseCode, examType, year)

    if (apiResult.success) {
      return apiResult
    }

    if (!BROWSER_TOOLS_ENABLED) {
      return {
        success: false,
        papers: [],
        error: 'Browser scraping is disabled (BROWSER_TOOLS_ENABLED = false)',
        source: 'vitpapervault.in',
      }
    }

    console.log('[vitpapervault] API failed, falling back to browser scraping')
    // return await tryBrowserScraping(courseCode, examType, year)
  } catch (error: any) {
    console.error('Error scraping vitpapervault.in:', error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: 'vitpapervault.in',
    }
  }
}

async function tryVITVaultListAPI(courseCode: string, examType?: string, year?: string) {
  try {
    const resp = await fetch('https://api.vitpapervault.in/api/paper/list', {
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) throw new Error(`status ${resp.status}`)

    const body = (await resp.json()) as { data?: PaperVaultEntry[] }
    const all: PaperVaultEntry[] = Array.isArray(body.data) ? body.data : []

    const full = findFullCourseName(courseCode)
    const plainName = full.replace(/\s*\[.*\]$/, '')

    const filtered = all.filter(p => {
      const sameSubj = p.subjectName.trim().toLowerCase() === plainName.trim().toLowerCase()

      let sameExam = true
      if (examType) {
        const paperType = p.paperType.toLowerCase()
        const examTypeLower = examType.toLowerCase()

        sameExam =
          paperType.includes(examTypeLower) ||
          (examTypeLower === 'cat1' &&
            (paperType.includes('cat 1') || paperType.includes('cat-1'))) ||
          (examTypeLower === 'cat2' &&
            (paperType.includes('cat 2') || paperType.includes('cat-2'))) ||
          (examTypeLower === 'fat' && (paperType.includes('final') || paperType.includes('fat'))) ||
          (examTypeLower === 'quiz' && paperType.includes('quiz'))
      }

      const sameYear = !year || new Date(p.paperDate).getUTCFullYear().toString() === year
      return sameSubj && sameExam && sameYear
    })

    const papers = filtered.map(p => ({
      title: `${p.subjectName} ${p.paperType} (${new Date(p.paperDate).toISOString().slice(0, 10)})`,
      url: p.paperLink,
      source: 'vitpapervault.in',
      metadata: p.paperSlot,
      examType: p.paperType,
      year: new Date(p.paperDate).getUTCFullYear().toString(),
    }))

    return {
      success: true,
      papers: papers.slice(0, 100),
      source: 'vitpapervault.in',
      searchUrl: 'https://api.vitpapervault.in/api/paper/list',
    }
  } catch (err) {
    console.warn('List API failed (network/parse error), falling back:', err)
    return { success: false, papers: [] }
  }
}

// async function tryBrowserScraping(courseCode: string, examType?: string, year?: string) {
//   if (!BROWSER_TOOLS_ENABLED) {
//     throw new Error('Browser scraping is disabled')
//   }

//   const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
//     import('puppeteer-core'),
//     import('@sparticuz/chromium'),
//   ])

//   let browser
//   try {
//     browser = await puppeteer.launch({
//       args: chromium.args,
//       defaultViewport: { width: 1280, height: 1024 },
//       executablePath: await chromium.executablePath(),
//       headless: true,
//     })

//     const page = await browser.newPage()
//     await page.setUserAgent(
//       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
//         '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
//     )

//     await page.goto('https://vitpapervault.in', {
//       waitUntil: 'networkidle2',
//       timeout: 15000,
//     })

//     const searchSelector =
//       'input[type="search"], input[placeholder*="search"], input[name*="search"], #search'

//     try {
//       await page.waitForSelector(searchSelector, { timeout: 5000 })
//       await page.type(searchSelector, courseCode)
//       await page.keyboard.press('Enter')
//       await new Promise(res => setTimeout(res, 2000))
//     } catch {}

//     const papers = await page.evaluate(
//       (courseCode, examType, year) => {
//         const els = Array.from(
//           document.querySelectorAll(
//             'a[href*=".pdf"], a[href*="download"], .paper-link, .download-link'
//           )
//         )
//         const out: any[] = []

//         els.forEach(el => {
//           const titleText =
//             (el.textContent || '').trim() || el.getAttribute('title') || 'Question Paper'
//           const href = el.getAttribute('href') || ''
//           if (!href.includes('.pdf')) return

//           const tl = titleText.toLowerCase()
//           const cc = courseCode.toLowerCase()

//           const okCourse = tl.includes(cc) || tl.includes(cc.replace(/(\d+)/, ' $1'))

//           let okExam = true
//           if (examType) {
//             const examTypeLower = examType.toLowerCase()
//             okExam =
//               tl.includes(examTypeLower) ||
//               (examTypeLower === 'cat1' && (tl.includes('cat 1') || tl.includes('cat-1'))) ||
//               (examTypeLower === 'cat2' && (tl.includes('cat 2') || tl.includes('cat-2'))) ||
//               (examTypeLower === 'fat' && (tl.includes('final') || tl.includes('fat'))) ||
//               (examTypeLower === 'quiz' && tl.includes('quiz'))
//           }

//           const okYear = !year || tl.includes(year) || (href.includes(year) as any)
//           if (okCourse && okExam && okYear) {
//             let extractedExamType = examType || 'unknown'
//             let extractedYear = year || 'unknown'

//             if (!examType || examType === 'unknown') {
//               if (tl.includes('cat-1') || tl.includes('cat 1')) extractedExamType = 'CAT-1'
//               else if (tl.includes('cat-2') || tl.includes('cat 2')) extractedExamType = 'CAT-2'
//               else if (tl.includes('fat') || tl.includes('final')) extractedExamType = 'FAT'
//               else if (tl.includes('quiz')) extractedExamType = 'Quiz'
//             }

//             if (!year || year === 'unknown') {
//               const yearMatch = titleText.match(/20\d{2}/)
//               if (yearMatch) extractedYear = yearMatch[0]
//             }

//             out.push({
//               title: titleText.substring(0, 100),
//               url: href.startsWith('http') ? href : `https://vitpapervault.in${href}`,
//               source: 'vitpapervault.in',
//               metadata: '',
//               examType: extractedExamType,
//               year: extractedYear,
//             })
//           }
//         })

//         return out
//       },
//       courseCode,
//       examType,
//       year
//     )

//     return {
//       success: true,
//       papers: papers.slice(0, 50),
//       source: 'vitpapervault.in',
//     }
//   } catch (error: any) {
//     console.error('Browser scraping error:', error)
//     return {
//       success: false,
//       papers: [],
//       error: error.message,
//       source: 'vitpapervault.in',
//     }
//   } finally {
//     if (browser) await browser.close()
//   }
// }
