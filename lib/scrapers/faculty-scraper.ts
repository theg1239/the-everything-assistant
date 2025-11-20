import { BROWSER_TOOLS_ENABLED } from '../browser-flags'

export async function scrapeFacultyInfo(department?: string, facultyName?: string) {
  try {
    if (!BROWSER_TOOLS_ENABLED) {
      return {
        success: false,
        error: 'Browser scraping is disabled (BROWSER_TOOLS_ENABLED = false)',
        message: 'Enable browser tools to scrape faculty pages.',
      }
    }

    return await tryBrowserScraping(department, facultyName)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('An unexpected error occurred in scrapeFacultyInfo:', errorMessage)
    return {
      success: false,
      error: errorMessage,
      message: 'Unable to fetch faculty information. Please try again later.',
    }
  }
}

async function tryBrowserScraping(department?: string, facultyName?: string) {
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium'),
  ])

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    const directoryUrls = ['https://vit.ac.in/faculty']

    const departmentUrls = new Set<string>()

    for (const url of directoryUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
        const links = await page.evaluate(() => {
          const selectors =
            '.eael-adv-accordion a, .school-box a, .card-body a, .elementor-widget-icon-list a'
          return Array.from(document.querySelectorAll(selectors))
            .map(a => (a as HTMLAnchorElement).href)
            .filter(href => href && (href.includes('/allfaculty/') || href.includes('/faculty')))
        })
        links.forEach(link => departmentUrls.add(link))
      } catch (e) {
        console.log(
          `Could not scrape directory URL ${url}:`,
          e instanceof Error ? e.message : String(e)
        )
      }
    }

    console.log(`Found ${departmentUrls.size} unique department pages to scrape.`)

    const allFacultyData = []

    for (const deptUrl of Array.from(departmentUrls)) {
      try {
        await page.goto(deptUrl, { waitUntil: 'networkidle2', timeout: 20000 })
        console.log(`Scraping department: ${deptUrl}`)

        const profilesOnPage = await page.evaluate(() => {
          const facultyCards = document.querySelectorAll('article.exad-post-grid-three')
          return Array.from(facultyCards)
            .map(card => {
              const linkElement = card.querySelector(
                'h3 a.exad-post-grid-title'
              ) as HTMLAnchorElement
              const designationElement = card.querySelector('.exad-post-grid-category a')
              return {
                name: linkElement?.textContent?.trim() || 'N/A',
                profileUrl: linkElement?.href || null,
                department: designationElement?.textContent?.trim() || 'N/A',
              }
            })
            .filter(p => p.profileUrl)
        })

        for (const profile of profilesOnPage) {
          if (!profile.profileUrl) continue

          try {
            await page.goto(profile.profileUrl, { waitUntil: 'networkidle2', timeout: 20000 })
            const details = await page.evaluate(() => {
              const getDetail = (iconClass: string) => {
                const iconElement = document.querySelector(
                  `.elementor-icon-list-icon i.${iconClass}`
                )
                const textElement = iconElement
                  ?.closest('.elementor-icon-list-item')
                  ?.querySelector('.elementor-icon-list-text')
                return textElement?.textContent?.trim() || 'N/A'
              }

              const getSpecialization = () => {
                const heading = Array.from(
                  document.querySelectorAll(
                    'h2.elementor-heading-title, h3.elementor-heading-title'
                  )
                ).find(h => h.textContent?.toLowerCase().includes('area of specialisation'))
                const content =
                  heading?.parentElement?.parentElement?.nextElementSibling?.querySelector(
                    '.elementor-text-editor'
                  )
                return content?.textContent?.trim().replace(/\s+/g, ' ') || 'N/A'
              }

              let email = getDetail('fa-envelope')
                .replace(/\[at\]/g, '@')
                .replace(/\s/g, '')
              if (email.endsWith('.')) {
                email = email.slice(0, -1)
              }

              return {
                email: email,
                office: getDetail('fa-map-marker-alt').replace('Cabin: ', '').trim(),
                specialization: getSpecialization(),
              }
            })
            allFacultyData.push({ ...profile, ...details })
          } catch (e) {
            console.log(
              `Failed to scrape profile ${profile.name} at ${profile.profileUrl}:`,
              e instanceof Error ? e.message : String(e)
            )
          }
        }
      } catch (e) {
        console.log(
          `Failed to process department URL ${deptUrl}:`,
          e instanceof Error ? e.message : String(e)
        )
      }
    }

    const uniqueFaculty = allFacultyData.filter(
      (faculty, index, self) =>
        faculty.name !== 'N/A' &&
        index === self.findIndex(f => f.name === faculty.name && f.email === faculty.email)
    )

    const filteredResults = uniqueFaculty.filter(f => {
      const departmentMatch = department
        ? f.department.toLowerCase().includes(department.toLowerCase())
        : true
      const nameMatch = facultyName
        ? f.name.toLowerCase().includes(facultyName.toLowerCase())
        : true
      return departmentMatch && nameMatch
    })

    console.log(
      `Scraping complete. Found ${uniqueFaculty.length} unique faculty members, with ${filteredResults.length} matching criteria.`
    )

    return {
      success: true,
      faculty: filteredResults.slice(0, 100),
      totalFound: filteredResults.length,
      searchCriteria: { department, facultyName },
      message: `Found ${filteredResults.length} faculty members.`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('An error occurred during browser scraping:', errorMessage)
    return {
      success: false,
      error: errorMessage,
      message: 'Unable to fetch faculty information via browser. Please try again later.',
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}
