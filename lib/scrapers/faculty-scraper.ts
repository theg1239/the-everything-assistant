import puppeteer from "puppeteer"

export async function scrapeFacultyInfo(department?: string, facultyName?: string) {
  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
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
