import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"
import { findFullCourseName } from "../course-map"

export async function scrapeVITPaperVault(courseCode: string, examType?: string, year?: string) {
  try {
    // 1️⃣ API first
    const apiResult = await tryVITVaultListAPI(courseCode, examType, year)
    if (apiResult.success && apiResult.papers.length > 0) {
      return apiResult
    }

    // 2️⃣ Fallback to headful scraping
    return await tryBrowserScraping(courseCode, examType, year)
  } catch (error: any) {
    console.error("Error scraping vitpapervault.in:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "vitpapervault.in",
    }
  }
}

async function tryVITVaultListAPI(courseCode: string, examType?: string, year?: string) {
  try {
    // 1) Fetch the entire list
    const resp = await fetch("https://api.vitpapervault.in/api/paper/list", {
      headers: { Accept: "application/json" },
    })
    if (!resp.ok) throw new Error(`status ${resp.status}`)

    const body = await resp.json()
    const all: any[] = Array.isArray(body.data) ? body.data : []

    // 2) Determine the human‐readable subject to match
    //    e.g. "BCSE101E" → "Computer Programming: Python"
    //    but subjectName in API is like "Computer Programming: Python"
    const full = findFullCourseName(courseCode)
    const plainName = full.replace(/\s*\[.*\]$/, "")

    // 3) Filter with better exam type matching
    const filtered = all.filter((p) => {
      const sameSubj = p.subjectName.trim().toLowerCase() === plainName.trim().toLowerCase()

      // Better exam type matching
      let sameExam = true
      if (examType) {
        const paperType = p.paperType.toLowerCase()
        const examTypeLower = examType.toLowerCase()

        sameExam =
          paperType.includes(examTypeLower) ||
          (examTypeLower === "cat1" && (paperType.includes("cat 1") || paperType.includes("cat-1"))) ||
          (examTypeLower === "cat2" && (paperType.includes("cat 2") || paperType.includes("cat-2"))) ||
          (examTypeLower === "fat" && (paperType.includes("final") || paperType.includes("fat"))) ||
          (examTypeLower === "quiz" && paperType.includes("quiz"))
      }

      const sameYear = !year || new Date(p.paperDate).getUTCFullYear().toString() === year
      return sameSubj && sameExam && sameYear
    })

    // 4) Map into your output shape
    const papers = filtered.map((p) => ({
      title: `${p.subjectName} ${p.paperType} (${new Date(p.paperDate).toISOString().slice(0, 10)})`,
      url: p.paperLink,
      source: "vitpapervault.in",
      metadata: p.paperSlot,
      examType: p.paperType,
      year: new Date(p.paperDate).getUTCFullYear().toString(),
    }))

    return {
      success: true,
      papers: papers.slice(0, 20),
      source: "vitpapervault.in",
      searchUrl: "https://api.vitpapervault.in/api/paper/list",
    }
  } catch (err) {
    console.warn("List API failed, falling back:", err)
    return { success: false, papers: [] }
  }
}

async function tryBrowserScraping(courseCode: string, examType?: string, year?: string) {
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
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    await page.goto("https://vitpapervault.in", {
      waitUntil: "networkidle2",
      timeout: 15000,
    })

    const searchSelector = 'input[type="search"], input[placeholder*="search"], input[name*="search"], #search'

    try {
      await page.waitForSelector(searchSelector, { timeout: 5000 })
      await page.type(searchSelector, courseCode)
      await page.keyboard.press("Enter")
      await new Promise((res) => setTimeout(res, 2000))
    } catch {
      // no search box: ok
    }

    const papers = await page.evaluate(
      (courseCode, examType, year) => {
        const els = Array.from(
          document.querySelectorAll('a[href*=".pdf"], a[href*="download"], .paper-link, .download-link'),
        )
        const out: any[] = []

        els.forEach((el) => {
          const titleText = (el.textContent || "").trim() || el.getAttribute("title") || "Question Paper"
          const href = el.getAttribute("href") || ""
          if (!href.includes(".pdf")) return

          const tl = titleText.toLowerCase()
          const cc = courseCode.toLowerCase()

          // Course matching
          const okCourse = tl.includes(cc) || tl.includes(cc.replace(/(\d+)/, " $1"))

          // Better exam type matching
          let okExam = true
          if (examType) {
            const examTypeLower = examType.toLowerCase()
            okExam =
              tl.includes(examTypeLower) ||
              (examTypeLower === "cat1" && (tl.includes("cat 1") || tl.includes("cat-1"))) ||
              (examTypeLower === "cat2" && (tl.includes("cat 2") || tl.includes("cat-2"))) ||
              (examTypeLower === "fat" && (tl.includes("final") || tl.includes("fat"))) ||
              (examTypeLower === "quiz" && tl.includes("quiz"))
          }

          const okYear = !year || tl.includes(year) || (href.includes(year) as any)

          if (okCourse && okExam && okYear) {
            out.push({
              title: titleText.substring(0, 100),
              url: href.startsWith("http") ? href : `https://vitpapervault.in${href}`,
              source: "vitpapervault.in",
              metadata: "",
              examType: examType || "unknown",
              year: year || "unknown",
            })
          }
        })
        return out
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
  } catch (error: any) {
    console.error("Browser scraping error:", error)
    return {
      success: false,
      papers: [],
      error: error.message,
      source: "vitpapervault.in",
    }
  } finally {
    if (browser) await browser.close()
  }
}

