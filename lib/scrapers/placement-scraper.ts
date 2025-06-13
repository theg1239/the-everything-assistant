import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

interface Company {
  name: string
  placed: string
  avgCTC: string
}

interface RecentOffer {
  student: string
  company: string
  ctc: string
  date: string
}

interface PlacementData {
  statistics: Record<string, string> // metrics across the banner
  companies: Company[] // company-wise table
  recentOffers: RecentOffer[] // latest individual offers
}

export interface PlacementResponse {
  success: boolean
  year?: string
  data?: PlacementData
  message?: string
  lastUpdated?: string
  error?: string
}

export async function scrapePlacementInfo(
  year?: string,
  companyFilter?: string
): Promise<PlacementResponse> {
  try {
    return await withBrowser(async page => {
      console.log('Navigating to placement tracker...')
      try {
        await page.goto('https://vit-placements-tracker.streamlit.app/', {
          waitUntil: 'domcontentloaded',
          timeout: 25_000,
        })
      } catch (navError: any) {
        console.log('Navigation timeout, continuing anyway:', navError?.message)
      }
      console.log('Waiting for Streamlit to load...')

      try {
        await page.waitForFunction(() => document.querySelector('[data-testid="stApp"]') !== null, {
          timeout: 10000,
        })
      } catch (appError: any) {
        console.log('App container timeout, continuing anyway')
      }

      // Use setTimeout wrapped in Promise instead of waitForTimeout
      await new Promise(resolve => setTimeout(resolve, 2000))

      if (process.env.NODE_ENV === 'development') {
        await page.screenshot({ path: '/tmp/placement-debug-initial.png' })
      }
      let lastUpdated: string | null = null
      try {
        lastUpdated = await Promise.race([
          page.evaluate(() => {
            const el = [...document.querySelectorAll('p, div')].find(e =>
              /Data Updated as on/i.test(e.textContent ?? '')
            )
            return el?.textContent?.replace(/^\s*|\s*$/g, '') ?? null
          }),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
        ])
      } catch (err) {
        console.log('Failed to get last updated info')
      }
      console.log('Attempting dropdown selection...')
      let selectionSuccess = false

      try {
        const dropdown = await page.$('[aria-label*="Select DataFrame"], [role="combobox"]')
        if (dropdown) {
          await dropdown.click()
          await new Promise(resolve => setTimeout(resolve, 1000))

          const options = await page.$$('[role="option"]')
          if (options.length >= 2) {
            await options[0].click()
            await new Promise(resolve => setTimeout(resolve, 1000))

            await dropdown.click()
            await new Promise(resolve => setTimeout(resolve, 1000))

            const refreshedOptions = await page.$$('[role="option"]')
            if (refreshedOptions.length >= 2) {
              await refreshedOptions[1].click()
              selectionSuccess = true
              console.log('Successfully selected dropdown options')
            }
          }
        }
      } catch (error) {
        console.log('Dropdown selection failed, continuing anyway:', error)
      }
      console.log('Waiting for data to load...')

      await new Promise(resolve => setTimeout(resolve, 2000))

      try {
        await Promise.race([
          page.waitForSelector('[data-testid="stMetric"], [data-testid="stTable"]', {
            timeout: 15000,
          }),
          new Promise(resolve => setTimeout(resolve, 15000)),
        ])
      } catch (err) {
        console.log('Content wait timeout, proceeding anyway')
      }
      console.log('Scraping placement data...')
      const scraped = await page.evaluate(() => {
        const digits = (txt: string = '') => (txt.match(/[\d,.]+/)?.[0] ?? '0').replace(/,/g, '')

        const metrics = [...document.querySelectorAll('[data-testid="stMetric"]')]
        const banner: Record<string, string> = {
          'total offers': metrics[0] ? digits(metrics[0].textContent || '') : '0',
          'unique offers': metrics[1] ? digits(metrics[1].textContent || '') : '0',
          'super-dream offers': metrics[2] ? digits(metrics[2].textContent || '') : '0',
          'dream offers': metrics[3] ? digits(metrics[3].textContent || '') : '0',
          'total companies': metrics[4] ? digits(metrics[4].textContent || '') : '0',
        }

        const txtEls = [...document.querySelectorAll('[data-testid="stText"]')]
        banner['highest package'] =
          txtEls
            .find(e => /Highest Package/i.test(e.textContent ?? ''))
            ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] ?? 'N/A'
        banner['average package'] =
          txtEls
            .find(e => /Average Package/i.test(e.textContent ?? ''))
            ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] ?? 'N/A'

        const compTable = [...document.querySelectorAll('[data-testid="stTable"]')].find(t =>
          /Company.*CTC/i.test(t.textContent ?? '')
        )

        const companies = compTable
          ? [...compTable.querySelectorAll('tbody tr')]
              .slice(0, 50)
              .map(row => {
                const cells = [...row.querySelectorAll('td, th')]
                return {
                  name: cells[0]?.textContent?.trim() ?? '',
                  placed: cells[1]?.textContent?.trim() ?? '',
                  avgCTC: cells[2]?.textContent?.trim() ?? '',
                }
              })
              .filter(c => c.name)
          : []

        const offersTable = [...document.querySelectorAll('[data-testid="stTable"]')].find(t =>
          /Student.*Offer/i.test(t.textContent ?? '')
        )

        const recentOffers = offersTable
          ? [...offersTable.querySelectorAll('tbody tr')]
              .slice(0, 20)
              .map(row => {
                const cells = [...row.querySelectorAll('td, th')]
                return {
                  student: cells[0]?.textContent?.trim() || 'Anonymous',
                  company: cells[1]?.textContent?.trim() ?? '',
                  ctc: cells[2]?.textContent?.trim() ?? '',
                  date: cells[3]?.textContent?.trim() ?? '',
                }
              })
              .filter(o => o.company)
          : []

        return { banner, companies, recentOffers }
      })
      if (companyFilter && scraped.companies.length > 0) {
        const test = (s: string) => s.toLowerCase().includes(companyFilter.toLowerCase())
        scraped.companies = scraped.companies.filter((c: Company) => test(c.name))
        scraped.recentOffers = scraped.recentOffers.filter((o: RecentOffer) => test(o.company))
      }

      const data: PlacementData = {
        statistics: scraped.banner,
        companies: scraped.companies,
        recentOffers: scraped.recentOffers,
      }

      const hasAnyData =
        Object.values(scraped.banner).some(v => v !== '0' && v !== 'N/A') ||
        scraped.companies.length > 0 ||
        scraped.recentOffers.length > 0

      return {
        success: hasAnyData,
        year: year ?? '2024-25',
        data,
        lastUpdated: lastUpdated ?? undefined,
        message: hasAnyData
          ? `Retrieved placement information${companyFilter ? ' (filtered)' : ''}`
          : 'Partial data retrieved - some information may be unavailable',
      } satisfies PlacementResponse
    })
  } catch (err: any) {
    console.error('Placement scraper error:', err)
    return {
      success: false,
      error: err?.message ?? String(err),
      message: 'Unable to fetch placement information. Please try again later.',
    }
  }
}

async function withBrowser<T>(userFn: (page: any) => Promise<T>): Promise<T> {
  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )
    await page.setDefaultTimeout(30000)

    const result = await userFn(page)
    return result
  } catch (err) {
    console.error('Browser error:', err)
    throw err
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function selectStreamlitOption(
  page: any,
  labelText: string,
  optionText: string
): Promise<boolean> {
  try {
    const labelHandle = await page.$x(`//label[contains(., "${labelText}")]`)
    if (labelHandle.length) {
      await labelHandle[0].click()
      await page.waitForSelector('div[role="option"]', { timeout: 5_000 })
      const opt = await page.$x(`//div[@role="option"][contains(., "${optionText}")]`)
      if (opt.length) await opt[0].click()
      await new Promise(resolve => setTimeout(resolve, 1000))
      return true
    } else {
      console.log(`Label with text "${labelText}" not found`)
      return false
    }
  } catch (error) {
    console.log(`Error in selectStreamlitOption: ${error}`)
    return false
  }
}
