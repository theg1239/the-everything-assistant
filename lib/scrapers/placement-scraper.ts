import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

export async function scrapePlacementInfo(year?: string, company?: string) {
  try {
    // Try API first
    const apiResult = await tryPlacementAPI(year, company)
    if (apiResult.success) {
      return apiResult
    }

    // Fallback to browser scraping
    return await tryBrowserScraping(year, company)
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "unable to fetch placement information. please try again later.",
    }
  }
}

async function tryPlacementAPI(year?: string, company?: string) {
  try {
    const response = await fetch("https://vit.ac.in/api/placements", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    })

    if (response.ok) {
      const data = await response.json()
      return {
        success: true,
        year: year || "2024-25",
        data: data,
        message: `retrieved placement information from API`,
        lastUpdated: new Date().toISOString(),
      }
    }

    return { success: false }
  } catch (error) {
    return { success: false }
  }
}

async function tryBrowserScraping(year?: string, company?: string) {
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

    const placementData = {
      statistics: {},
      companies: [],
      recentOffers: [],
    }

    try {
      await page.goto("https://vit.ac.in/placements", { waitUntil: "networkidle2", timeout: 10000 })

      // Extract placement statistics
      const stats = await page.evaluate(() => {
        const statElements = document.querySelectorAll(".stat-card, .placement-stat, .number-card, .stats")
        const statistics = {}

        statElements.forEach((element) => {
          const label = element.querySelector(".label, .stat-label, .title")?.textContent?.trim()
          const value = element.querySelector(".value, .stat-value, .number, .count")?.textContent?.trim()
          if (label && value) {
            statistics[label.toLowerCase()] = value
          }
        })

        return statistics
      })

      placementData.statistics = stats

      // Extract company information
      const companies = await page.evaluate(() => {
        const companyElements = document.querySelectorAll(".company-card, .recruiter-card, .company-logo, .company")
        return Array.from(companyElements)
          .map((element) => {
            const name = element.querySelector(".company-name, .name, .title")?.textContent?.trim()
            const package_offered = element.querySelector(".package, .salary, .ctc")?.textContent?.trim()
            const positions = element.querySelector(".positions, .roles, .openings")?.textContent?.trim()

            return {
              name: name || "N/A",
              package: package_offered || "N/A",
              positions: positions || "N/A",
            }
          })
          .filter((c) => c.name !== "N/A")
      })

      placementData.companies = companies
    } catch (error) {
      console.log("Error scraping placement portal:", error.message)
    }

    return {
      success: true,
      year: year || "2024-25",
      data: placementData,
      message: `retrieved latest placement information${year ? ` for ${year}` : ""}`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "unable to fetch placement information. please try again later.",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
