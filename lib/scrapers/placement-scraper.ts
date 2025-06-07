export async function scrapePlacementInfo(year?: string, company?: string) {
  try {
    // Try API first
    const apiResult = await tryPlacementAPI(year, company)
    if (apiResult.success) {
      return apiResult
    }

    // Fallback to HTML scraping
    return await tryPlacementHTML(year, company)
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

async function tryPlacementHTML(year?: string, company?: string) {
  try {
    const response = await fetch("https://vit.ac.in/placements", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()

    // Extract basic placement statistics using regex
    const statsRegex = /(placement|package|offer|company)[^:]*:\s*([^<\n]*)/gi
    const companyRegex = /(google|microsoft|amazon|apple|tcs|infosys|wipro|cognizant)[^<\n]*/gi

    const statistics = {}
    const companies = []

    let match
    while ((match = statsRegex.exec(html)) !== null) {
      const [, key, value] = match
      statistics[key.toLowerCase().trim()] = value.trim()
    }

    while ((match = companyRegex.exec(html)) !== null) {
      companies.push({
        name: match[0].trim(),
        package: "N/A",
        positions: "N/A",
      })
    }

    return {
      success: true,
      year: year || "2024-25",
      data: {
        statistics,
        companies: companies.slice(0, 20),
        recentOffers: [],
      },
      message: `retrieved placement information from HTML`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    throw error
  }
}
