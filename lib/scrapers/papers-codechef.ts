import puppeteer from "puppeteer"

export async function scrapePapersCodeChef(courseCode: string, examType?: string, year?: string) {
  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    // Navigate to papers.codechefvit.com with search parameter
    const searchUrl = `https://papers.codechefvit.com/catalogue?subject=${encodeURIComponent(courseCode.toLowerCase())}`
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 })

    // Wait for content to load (since it's client-side rendered)
    await page.waitForTimeout(3000)

    // Try to find paper cards or links
    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const paperElements = Array.from(
          document.querySelectorAll(
            'a[href*="/paper/"], .paper-card, .paper-item, [data-testid*="paper"], .card, .grid > div',
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

            // Check if title contains course code
            const matchesCourse =
              titleLower.includes(courseLower) ||
              titleLower.includes(courseLower.replace(/(\d+)/, " $1")) ||
              titleLower.includes(courseLower.replace(/([a-z]+)(\d+)/, "$1 $2"))

            // Check exam type if specified
            const matchesExam = !examType || titleLower.includes(examType.toLowerCase())

            // Check year if specified
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

    // If no papers found with direct search, try alternative selectors
    if (papers.length === 0) {
      const alternativePapers = await page.evaluate((courseCode) => {
        const allLinks = Array.from(document.querySelectorAll("a"))
        const results = []

        allLinks.forEach((link) => {
          const text = link.textContent?.trim()
          const href = link.getAttribute("href")

          if (
            text &&
            href &&
            text.toLowerCase().includes(courseCode.toLowerCase()) &&
            (href.includes("/paper/") || href.includes("download") || href.includes(".pdf"))
          ) {
            results.push({
              title: text.substring(0, 100),
              url: href.startsWith("http") ? href : `https://papers.codechefvit.com${href}`,
              source: "papers.codechefvit.com",
              metadata: "",
              examType: "unknown",
              year: "unknown",
            })
          }
        })

        return results
      }, courseCode)

      papers.push(...alternativePapers)
    }

    return {
      success: true,
      papers: papers.slice(0, 10),
      source: "papers.codechefvit.com",
      searchUrl,
    }
  } catch (error) {
    console.error("Error scraping papers.codechefvit.com:", error)
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
