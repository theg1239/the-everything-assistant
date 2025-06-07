import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

export async function scrapeVITPaperVault(courseCode: string, examType?: string, year?: string) {
  try {
    // Try direct API calls first
    const apiResult = await tryVITVaultAPI(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    // Fallback to browser scraping
    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error) {
    console.error("Error scraping vitpapervault.in:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "vitpapervault.in",
    }
  }
}

async function tryVITVaultAPI(courseCode: string, examType?: string, year?: string) {
  try {
    const searchUrl = `https://vitpapervault.in/api/search?q=${encodeURIComponent(courseCode)}`

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json, text/plain, */*",
      },
    })

    if (response.ok) {
      const data = await response.json()
      const papers = (data.papers || data.results || []).map((paper: any) => ({
        title: paper.title || paper.name || "Question Paper",
        url: paper.url || paper.downloadUrl || paper.link,
        source: "vitpapervault.in",
        metadata: paper.metadata || "",
        examType: paper.examType || examType || "unknown",
        year: paper.year || year || "unknown",
      }))

      return {
        success: true,
        papers: papers.slice(0, 10),
        source: "vitpapervault.in",
      }
    }

    return { success: false, papers: [] }
  } catch (error) {
    return { success: false, papers: [] }
  }
}

async function tryBrowserScraping(courseCode: string, examType?: string, year?: string) {
  let browser
  try {
    // Use Puppeteer with @sparticuz/chromium for serverless
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

    // Try to navigate to vitpapervault.in
    await page.goto("https://vitpapervault.in", { waitUntil: "networkidle2", timeout: 15000 })

    // Look for search functionality
    const searchSelector = 'input[type="search"], input[placeholder*="search"], input[name*="search"], #search'

    try {
      await page.waitForSelector(searchSelector, { timeout: 5000 })
      await page.type(searchSelector, courseCode)
      await page.keyboard.press("Enter")
      await page.waitForTimeout(2000)
    } catch (error) {
      console.log("No search found, trying direct navigation")
    }

    // Extract paper links
    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll('a[href*=".pdf"], a[href*="download"], .paper-link, .download-link'),
        )

        const results = []

        paperElements.forEach((element) => {
          const title = element.textContent?.trim() || element.getAttribute("title") || "Question Paper"
          const href = element.getAttribute("href")

          if (title && href && title.length > 5) {
            const titleLower = title.toLowerCase()
            const courseLower = courseCode.toLowerCase()

            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, " $1")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, "$1 $2"))

            const matchesExam = !examType || titleLower.includes(examType.toLowerCase())
            const matchesYear = !year || titleLower.includes(year)

            if (matchesCourse && matchesExam && matchesYear) {
              results.push({
                title: title.substring(0, 100),
                url: href.startsWith("http") ? href : `https://vitpapervault.in${href}`,
                source: "vitpapervault.in",
                metadata: "",
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
      source: "vitpapervault.in",
    }
  } catch (error) {
    console.error("Browser scraping error:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "vitpapervault.in",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
