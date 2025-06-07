import { chromium } from "playwright-core"

export async function scrapePapersCodeChef(courseCode: string, examType?: string, year?: string) {
  try {
    // First try API-based approach
    const apiResult = await tryAPIApproach(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    // Fallback to browser scraping with Playwright
    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error) {
    console.error("Error in scrapePapersCodeChef:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "papers.codechefvit.com",
    }
  }
}

async function tryAPIApproach(courseCode: string, examType?: string, year?: string) {
  try {
    // Try to find API endpoints by making requests to common patterns
    const searchUrl = `https://papers.codechefvit.com/api/papers?search=${encodeURIComponent(courseCode)}`

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json, text/plain, */*",
      },
    })

    if (response.ok) {
      const data = await response.json()
      if (data.papers || data.results || Array.isArray(data)) {
        const papers = (data.papers || data.results || data).map((paper: any) => ({
          title: paper.title || paper.name || "Question Paper",
          url: paper.url || paper.downloadUrl || paper.link,
          source: "papers.codechefvit.com",
          metadata: paper.metadata || paper.description || "",
          examType: paper.examType || examType || "unknown",
          year: paper.year || year || "unknown",
        }))

        return {
          success: true,
          papers: papers.slice(0, 10),
          source: "papers.codechefvit.com",
        }
      }
    }

    // Try alternative API endpoints
    const catalogueUrl = `https://papers.codechefvit.com/api/catalogue?subject=${encodeURIComponent(courseCode.toLowerCase())}`
    const catalogueResponse = await fetch(catalogueUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json, text/plain, */*",
      },
    })

    if (catalogueResponse.ok) {
      const catalogueData = await catalogueResponse.json()
      // Process catalogue data similar to above
    }

    return { success: false, papers: [] }
  } catch (error) {
    return { success: false, papers: [] }
  }
}

async function tryBrowserScraping(courseCode: string, examType?: string, year?: string) {
  let browser
  try {
    // Use Playwright for better serverless support
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(courseCode.toLowerCase())}`
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 15000 })

    // Wait for content to load
    await page.waitForTimeout(3000)

    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll(
            'a[href*="/paper/"], .paper-card, .paper-item, [data-testid*="paper"], .card, .grid > div, .paper-link',
          ),
        )

        const results = []

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

            // More flexible course code matching
            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, " $1")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, "$1 $2")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)([a-z])/, "$1 $2 $3"))

            const matchesExam = !examType || titleLower.includes(examType.toLowerCase())
            const matchesYear = !year || titleLower.includes(year) || (meta && meta.includes(year))

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

    return {
      success: true,
      papers: papers.slice(0, 10),
      source: "papers.codechefvit.com",
      searchUrl,
    }
  } catch (error) {
    console.error("Browser scraping error:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "papers.codechefvit.com",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
