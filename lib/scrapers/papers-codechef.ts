import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import { findFullCourseName } from "../course-map"

interface Paper {
  title: string
  url: string
  source: string
  metadata: string
  examType: string
  year: string
}

interface ApiPaper {
  title?: string
  name?: string
  paperName?: string
  url?: string
  downloadUrl?: string
  link?: string
  paperUrl?: string
  metadata?: string
  description?: string
  examType?: string
  year?: string
  academicYear?: string
}

interface ScraperResult {
  success: boolean
  papers: Paper[]
  error?: string
  source: string
  searchUrl?: string
}

export async function scrapePapersCodeChef(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  try {
    const apiResult = await tryAPIApproach(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error) {
    console.error("Error in scrapePapersCodeChef:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: "papers.codechefvit.com",
    }
  }
}

async function tryAPIApproach(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  try {
    const fullCourseName = findFullCourseName(courseCode)

    const searchUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(fullCourseName)}`

    const response = await fetch(searchUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1",
        Referer: `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`,
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (response.ok) {
      const data = await response.json()
      // After getting the data from API, add proper filtering
      if (data && Array.isArray(data) && data.length > 0) {
        let papers: Paper[] = data.map((paper: ApiPaper) => ({
          title: paper.title || paper.name || paper.paperName || "Question Paper",
          url: paper.url || paper.downloadUrl || paper.link || paper.paperUrl || "",
          source: "papers.codechefvit.com",
          metadata: paper.metadata || paper.description || paper.examType || "",
          examType: paper.examType || examType || "unknown",
          year: paper.year || paper.academicYear || year || "unknown",
        }))

        // Filter by examType if specified
        if (examType) {
          papers = papers.filter((paper) => {
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

        // Filter by year if specified
        if (year) {
          papers = papers.filter((paper) => {
            const paperTitle = paper.title.toLowerCase()
            const paperMeta = paper.metadata.toLowerCase()

            return paperTitle.includes(year) || paperMeta.includes(year) || (paper.year && paper.year.includes(year))
          })
        }

        return {
          success: true,
          papers: papers.slice(0, 10),
          source: "papers.codechefvit.com",
          searchUrl,
        }
      }
    }

    const codeOnlyUrl = `https://papers.codechefvit.com/api/papers?subject=${encodeURIComponent(courseCode)}`
    const codeResponse = await fetch(codeOnlyUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (codeResponse.ok) {
      const codeData = await codeResponse.json()
      if (codeData && Array.isArray(codeData) && codeData.length > 0) {
        const papers = codeData.map((paper: any) => ({
          title: paper.title || paper.name || paper.paperName || "Question Paper",
          url: paper.url || paper.downloadUrl || paper.link || paper.paperUrl,
          source: "papers.codechefvit.com",
          metadata: paper.metadata || paper.description || paper.examType || "",
          examType: paper.examType || examType || "unknown",
          year: paper.year || paper.academicYear || year || "unknown",
        }))

        return {
          success: true,
          papers: papers.slice(0, 10),
          source: "papers.codechefvit.com",
          searchUrl: codeOnlyUrl,
        }
      }
    }

    return { success: false, papers: [], source: "papers.codechefvit.com" }
  } catch (error) {
    console.error("API approach error:", error)
    return { success: false, papers: [], source: "papers.codechefvit.com" }
  }
}


async function tryBrowserScraping(courseCode: string, examType?: string, year?: string): Promise<ScraperResult> {
  let browser
  try {
    // Simplified Chromium setup - let @sparticuz/chromium handle the paths
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    const fullCourseName = findFullCourseName(courseCode)
    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(fullCourseName)}`
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 })

    // Wait for content to load
    await new Promise((res) => setTimeout(res, 3000))

    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll(
            'a[href*="/paper/"], .paper-card, .paper-item, [data-testid*="paper"], .card, .grid > div, .paper-link',
          ),
        )

        const results: { 
          title: string; 
          url: string; 
          source: string; 
          metadata: string; 
          examType: string; 
          year: string; 
        }[] = []

        paperElements.forEach((element) => {
          const titleElement = element.querySelector("h3, h2, .title, .paper-title, .card-title")
          const linkElement = element.tagName === "A" ? element : element.querySelector("a")
          const metaElement = element.querySelector(".meta, .details, .paper-meta, .subtitle")

          const title = titleElement?.textContent?.trim() || element.textContent?.trim()
          const href = linkElement?.getAttribute("href")
          const meta = metaElement?.textContent?.trim()

          if (title && href && title.length > 5) {
            const titleLower = title.toLowerCase()
            const courseLower = courseCode.toLowerCase()
            const metaLower = (meta || "").toLowerCase()

            // Course code matching
            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, " $1")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, "$1 $2")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)([a-z])/, "$1 $2 $3"))

            // Exam type matching - more specific
            const matchesExam =
              !examType ||
              titleLower.includes(examType.toLowerCase()) ||
              metaLower.includes(examType.toLowerCase()) ||
              (examType.toLowerCase() === "cat1" && (titleLower.includes("cat 1") || titleLower.includes("cat-1"))) ||
              (examType.toLowerCase() === "cat2" && (titleLower.includes("cat 2") || titleLower.includes("cat-2"))) ||
              (examType.toLowerCase() === "fat" && titleLower.includes("final"))

            // Year matching
            const matchesYear = !year || titleLower.includes(year) || metaLower.includes(year)

            if (matchesCourse && matchesExam && matchesYear) {
              results.push({
                title: title.substring(0, 100),
                url: href.startsWith("http") ? href : `https://papers.codechefvit.com${href}`,
                source: "papers.codechefvit.com",
                metadata: meta || "",
                examType: examType || "unknown",
                year: year || "unknown",
              })
            }
          }
        })

        return results
      },
      courseCode,
      examType,
      year,
    )

    // Add browser scraping results
    return {
      success: true,
      papers: papers as Paper[], // Convert the evaluated result to Paper[]
      source: "papers.codechefvit.com",
    }
  } catch (error) {
    console.error("Error in browser scraping:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      papers: [],
      error: errorMessage,
      source: "papers.codechefvit.com",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
