import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

export async function scrapeFacultyInfo(department?: string, facultyName?: string) {
  try {
    // Try API endpoints first
    const apiResult = await tryAPIApproach(department, facultyName)
    if (apiResult.success && apiResult.faculty.length > 0) {
      return apiResult
    }

    // Fallback to browser scraping
    return await tryBrowserScraping(department, facultyName)
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "unable to fetch faculty information. please try again later.",
    }
  }
}

async function tryAPIApproach(department?: string, facultyName?: string) {
  try {
    const facultyData = []

    // Try API endpoints first
    const apiUrls = [
      "https://vit.ac.in/api/faculty",
      "https://scope.vit.ac.in/api/faculty",
      "https://smec.vit.ac.in/api/faculty",
    ]

    for (const apiUrl of apiUrls) {
      try {
        const response = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
          },
        })

        if (response.ok) {
          const data = await response.json()
          const faculty = (data.faculty || data.results || []).map((f: any) => ({
            name: f.name || f.fullName || "N/A",
            department: f.department || f.dept || "N/A",
            email: f.email || "N/A",
            phone: f.phone || f.mobile || "N/A",
            office: f.office || f.room || "N/A",
            specialization: f.specialization || f.research || "N/A",
          }))

          facultyData.push(...faculty)
        }
      } catch (error) {
        console.log(`API request failed for ${apiUrl}`)
      }
    }

    // Filter results
    const filteredFaculty = facultyData.filter((f) => {
      if (department && !f.department.toLowerCase().includes(department.toLowerCase())) return false
      if (facultyName && !f.name.toLowerCase().includes(facultyName.toLowerCase())) return false
      return f.name !== "N/A"
    })

    return {
      success: filteredFaculty.length > 0,
      faculty: filteredFaculty.slice(0, 20),
      totalFound: filteredFaculty.length,
      searchCriteria: { department, facultyName },
      message: `found ${filteredFaculty.length} faculty members`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    return { success: false, faculty: [] }
  }
}

async function tryBrowserScraping(department?: string, facultyName?: string) {
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
    const facultyData = []

    const vitUrls = [
      "https://vit.ac.in/faculty",
      "https://scope.vit.ac.in/faculty",
      "https://smec.vit.ac.in/faculty",
      "https://select.vit.ac.in/faculty",
    ]

    for (const url of vitUrls) {
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 10000 })

        const faculty = await page.evaluate(
          (department, facultyName) => {
            const facultyElements = Array.from(
              document.querySelectorAll(".faculty-card, .faculty-member, .staff-card, .profile-card, .card"),
            )

            return facultyElements
              .map((element) => {
                const nameEl = element.querySelector(".name, .faculty-name, h3, h4, .title")
                const deptEl = element.querySelector(".department, .dept, .designation, .position")
                const emailEl = element.querySelector('a[href^="mailto:"]')
                const phoneEl = element.querySelector(".phone, .contact, .mobile")
                const officeEl = element.querySelector(".office, .room, .location")

                const name = nameEl?.textContent?.trim()
                const dept = deptEl?.textContent?.trim()
                const email = emailEl?.getAttribute("href")?.replace("mailto:", "")
                const phone = phoneEl?.textContent?.trim()
                const office = officeEl?.textContent?.trim()

                return {
                  name: name || "N/A",
                  department: dept || "N/A",
                  email: email || "N/A",
                  phone: phone || "N/A",
                  office: office || "N/A",
                  specialization: "N/A",
                }
              })
              .filter((f) => {
                if (!f.name || f.name === "N/A") return false
                if (department && !f.department.toLowerCase().includes(department.toLowerCase())) return false
                if (facultyName && !f.name.toLowerCase().includes(facultyName.toLowerCase())) return false
                return true
              })
          },
          department,
          facultyName,
        )

        facultyData.push(...faculty)
      } catch (error) {
        console.log(`Error scraping ${url}:`, error.message)
      }
    }

    const uniqueFaculty = facultyData.filter(
      (faculty, index, self) => index === self.findIndex((f) => f.name === faculty.name && f.email === faculty.email),
    )

    return {
      success: true,
      faculty: uniqueFaculty.slice(0, 20),
      totalFound: uniqueFaculty.length,
      searchCriteria: { department, facultyName },
      message: `found ${uniqueFaculty.length} faculty members`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "unable to fetch faculty information. please try again later.",
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
