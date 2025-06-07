export async function scrapeFacultyInfo(department?: string, facultyName?: string) {
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

    // If API fails, try HTML scraping with simple HTTP
    if (facultyData.length === 0) {
      const htmlUrls = ["https://vit.ac.in/faculty", "https://scope.vit.ac.in/faculty"]

      for (const url of htmlUrls) {
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          })

          if (response.ok) {
            const html = await response.text()

            // Simple regex extraction for faculty information
            const emailRegex = /mailto:([^"]*)/gi
            const nameRegex = /<h[1-6][^>]*>([^<]*(?:dr\.|prof\.|mr\.|ms\.)[^<]*)</gi

            const emails = []
            const names = []

            let match
            while ((match = emailRegex.exec(html)) !== null) {
              emails.push(match[1])
            }

            while ((match = nameRegex.exec(html)) !== null) {
              names.push(match[1].trim())
            }

            // Combine names and emails
            for (let i = 0; i < Math.min(names.length, emails.length); i++) {
              facultyData.push({
                name: names[i],
                department: department || "N/A",
                email: emails[i],
                phone: "N/A",
                office: "N/A",
                specialization: "N/A",
              })
            }
          }
        } catch (error) {
          console.log(`HTML scraping failed for ${url}`)
        }
      }
    }

    // Filter results
    const filteredFaculty = facultyData.filter((f) => {
      if (department && !f.department.toLowerCase().includes(department.toLowerCase())) return false
      if (facultyName && !f.name.toLowerCase().includes(facultyName.toLowerCase())) return false
      return f.name !== "N/A"
    })

    return {
      success: true,
      faculty: filteredFaculty.slice(0, 20),
      totalFound: filteredFaculty.length,
      searchCriteria: { department, facultyName },
      message: `found ${filteredFaculty.length} faculty members`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "unable to fetch faculty information. please try again later.",
    }
  }
}
