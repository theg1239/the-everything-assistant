import puppeteer from "puppeteer"

export async function scrapePlacementInfo(year?: string, company?: string) {
  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
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
