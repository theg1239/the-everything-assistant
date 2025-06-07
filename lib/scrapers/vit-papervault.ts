export async function scrapeVITPaperVault(courseCode: string, examType?: string, year?: string) {
  try {
    // Try direct API calls first
    const apiResult = await tryVITVaultAPI(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    // Fallback to simple HTTP requests
    return await tryHTTPScraping(courseCode, examType, year)
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

async function tryHTTPScraping(courseCode: string, examType?: string, year?: string) {
  try {
    const response = await fetch("https://vitpapervault.in", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()

    // Simple regex-based extraction for PDF links
    const pdfRegex = /<a[^>]*href="([^"]*\.pdf)"[^>]*>([^<]*)</gi
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*(?:paper|question|exam)[^<]*)</gi

    const papers = []
    let match

    // Extract PDF links
    while ((match = pdfRegex.exec(html)) !== null) {
      const [, url, title] = match
      if (title.toLowerCase().includes(courseCode.toLowerCase())) {
        papers.push({
          title: title.trim().substring(0, 100),
          url: url.startsWith("http") ? url : `https://vitpapervault.in${url}`,
          source: "vitpapervault.in",
          metadata: "",
          examType: examType || "unknown",
          year: year || "unknown",
        })
      }
    }

    // Extract other relevant links
    while ((match = linkRegex.exec(html)) !== null) {
      const [, url, title] = match
      if (title.toLowerCase().includes(courseCode.toLowerCase()) && papers.length < 10) {
        papers.push({
          title: title.trim().substring(0, 100),
          url: url.startsWith("http") ? url : `https://vitpapervault.in${url}`,
          source: "vitpapervault.in",
          metadata: "",
          examType: examType || "unknown",
          year: year || "unknown",
        })
      }
    }

    return {
      success: true,
      papers: papers.slice(0, 10),
      source: "vitpapervault.in",
    }
  } catch (error) {
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "vitpapervault.in",
    }
  }
}
