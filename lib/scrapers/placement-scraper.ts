import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

interface Company {
  name: string
  package: string
  positions: string
}

interface RecentOffer {
  student: string
  company: string
  package: string
  date: string
}

interface PlacementData {
  statistics: Record<string, string>
  companies: Company[]
  recentOffers: RecentOffer[]
}

interface PlacementResponse {
  success: boolean
  year?: string
  data?: PlacementData
  message?: string
  lastUpdated?: string
  error?: string
}

export async function scrapePlacementInfo(year?: string, company?: string): Promise<PlacementResponse> {
  try {
    return await tryBrowserScraping(year, company)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      message: "unable to fetch placement information. please try again later.",
    }
  }
}

async function tryBrowserScraping(year?: string, company?: string): Promise<PlacementResponse> {
  let browser: puppeteer.Browser | undefined

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

    const placementData: PlacementData = {
      statistics: {},
      companies: [],
      recentOffers: [],
    }

    try {
      await page.goto("https://vit-placements-tracker.streamlit.app/", {
        waitUntil: "networkidle2",
        timeout: 15000,
      })

      await page.waitForSelector('[data-testid="stMetric"]', { timeout: 15000 })

      const stats = await page.evaluate(() => {
        const metrics = Array.from(document.querySelectorAll('[data-testid="stMetric"]'))
        const extractNumber = (str: string): string => {
          const match = str.match(/[\d,]+\.?\d*/)
          return match ? match[0].replace(/,/g, "") : "0"
        }

        const highestPackage =
          Array.from(document.querySelectorAll('[data-testid="stText"]'))
            .find((el) => el.textContent?.includes("Highest Package"))
            ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] || "N/A"

        const averagePackage =
          Array.from(document.querySelectorAll('[data-testid="stText"]'))
            .find((el) => el.textContent?.includes("Average Package"))
            ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] || "N/A"

        const stats: Record<string, string> = {
          "total offers": extractNumber(metrics[0]?.textContent || "0"),
          "unique offers": extractNumber(metrics[1]?.textContent || "0"),
          "super dream offers": extractNumber(metrics[2]?.textContent || "0"),
          "dream offers": extractNumber(metrics[3]?.textContent || "0"),
          "total companies": extractNumber(metrics[4]?.textContent || "0"),
          "highest package": highestPackage,
          "average package": averagePackage,
        }

        return stats
      })

      placementData.statistics = stats

      const companies = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('[data-testid="stTable"]'))
        const companyTable = tables.find(
          (table) => table.textContent?.includes("Company") && table.textContent?.includes("Package"),
        )

        if (!companyTable) return []

        const rows = Array.from(companyTable.querySelectorAll("tr")).slice(1) // Skip header row
        return rows
          .map((row) => {
            const cells = Array.from(row.querySelectorAll("td, th"))
            return {
              name: cells[0]?.textContent?.trim() || "N/A",
              package: cells[1]?.textContent?.trim() || "N/A",
              positions: cells[2]?.textContent?.trim() || "N/A",
            }
          })
          .filter((c) => c.name !== "N/A" && c.name !== "")
      })

      placementData.companies = companies

      // Extract recent offers
      const recentOffers = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('[data-testid="stTable"]'))
        const offersTable = tables.find(
          (table) => table.textContent?.includes("Student") && table.textContent?.includes("Offer"),
        )

        if (!offersTable) return []

        const rows = Array.from(offersTable.querySelectorAll("tr")).slice(1) // Skip header row
        return rows
          .map((row) => {
            const cells = Array.from(row.querySelectorAll("td, th"))
            return {
              student: cells[0]?.textContent?.trim() || "Anonymous",
              company: cells[1]?.textContent?.trim() || "N/A",
              package: cells[2]?.textContent?.trim() || "N/A",
              date: cells[3]?.textContent?.trim() || "N/A",
            }
          })
          .filter((o) => o.company !== "N/A" && o.company !== "")
      })

      placementData.recentOffers = recentOffers

      if (company) {
        const companyLower = company.toLowerCase()
        placementData.companies = placementData.companies.filter((c) => c.name.toLowerCase().includes(companyLower))
        placementData.recentOffers = placementData.recentOffers.filter((o) =>
          o.company.toLowerCase().includes(companyLower),
        )
      }

      return {
        success: true,
        year: year || "2024-25",
        data: placementData,
        message: `Retrieved latest placement information${year ? ` for ${year}` : ""}`,
        lastUpdated: new Date().toISOString(),
      }
    } catch (error) {
      console.error("Error scraping placement portal:", error)
      throw error
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      message: "Unable to fetch placement information. Please try again later.",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
