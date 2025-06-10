import puppeteer from "puppeteer-core"
import chromium from "@sparticuz/chromium"

/* ────────────────⟡  domain types  ⟡─────────────── */

interface Company {
  name: string
  placed: string           // #students
  avgCTC: string           // "12.3 LPA" etc.
}

interface RecentOffer {
  student: string
  company: string
  ctc: string
  date: string
}

interface PlacementData {
  statistics: Record<string, string>   // metrics across the banner
  companies: Company[]                 // company-wise table
  recentOffers: RecentOffer[]          // latest individual offers
}

export interface PlacementResponse {
  success: boolean
  year?: string
  data?: PlacementData
  message?: string
  lastUpdated?: string
  error?: string
}

/* ────────────────⟡  PUBLIC ENTRY  ⟡─────────────── */

export async function scrapePlacementInfo (
  year?: string,
  companyFilter?: string,
): Promise<PlacementResponse> {
  try {
    return await withBrowser(async page => {
      await page.goto("https://vit-placements-tracker.streamlit.app/", {
        waitUntil: "networkidle2", // Wait until network is idle (more reliable)
        timeout  : 90_000, // Increased timeout for initial page load
      })

      /* 1️⃣  Wait for Streamlit to load completely - be more patient */
      console.log("Waiting for Streamlit to load...")
      
      // Wait for the main app container
      await page.waitForFunction(
        () => document.querySelector('[data-testid="stApp"]') !== null,
        { timeout: 45000 }
      )
      
      // Wait for initial render to complete
      await page.waitForTimeout(8000)
      
      // Wait for Streamlit sidebar to appear (indicates app is ready)
      await page.waitForSelector('[data-testid="stSidebar"]', { timeout: 30000 })
        .catch(() => console.log("No sidebar found, continuing anyway"))
      
      // Capture a screenshot for debugging (in development)
      if (process.env.NODE_ENV === 'development') {
        await page.screenshot({ path: '/tmp/placement-debug-initial.png' })
      }

      /* 2️⃣  Grab the "data updated" banner (if present)              */
      const lastUpdated: string | null = await page.evaluate(() => {
        const el = [...document.querySelectorAll("p, div")]
          .find(e => /Data Updated as on/i.test(e.textContent ?? ""))
        return el?.textContent?.replace(/^\s*|\s*$/g, "") ?? null
      })

      /* 3️⃣  Open the "Select DataFrame" dropdown & pick BOTH:
              – Overall Statistics (to expose metrics)
              – Company-wise Placements (to expose the big table)      */
      console.log("Selecting dropdown options...")
      
      // Improved dropdown selection with multiple fallback strategies
      let selectionSuccess = false;
      
      // Approach 1: Find select box by aria-label
      try {
        const dropdownSelector = await page.$('[aria-label="Select DataFrame :"]');
        if (dropdownSelector) {
          // First selection: Overall Statistics
          await dropdownSelector.click();
          await page.waitForTimeout(2000);
          
          const statOption = await page.$x('//div[@role="option" and contains(text(), "Overall Statistics")]');
          if (statOption.length > 0) {
            await statOption[0].click();
            await page.waitForTimeout(3000);
            
            // Take screenshot after first selection
            if (process.env.NODE_ENV === 'development') {
              await page.screenshot({ path: '/tmp/placement-debug-after-first-selection.png' });
            }
            
            // Second selection: Company-wise Placements
            await dropdownSelector.click();
            await page.waitForTimeout(2000);
            
            const companyOption = await page.$x('//div[@role="option" and contains(text(), "Company-wise Placements")]');
            if (companyOption.length > 0) {
              await companyOption[0].click();
              await page.waitForTimeout(3000);
              selectionSuccess = true;
              console.log("Successfully selected options via aria-label approach");
            }
          }
        }
      } catch (error) {
        console.log("Error in approach 1:", error);
      }
      
      // Approach 2: Use the helper function if approach 1 failed
      if (!selectionSuccess) {
        try {
          await selectStreamlitOption(page, "Select DataFrame :", "Overall Statistics");
          await page.waitForTimeout(3000);
          await selectStreamlitOption(page, "Select DataFrame :", "Company-wise Placements");
          await page.waitForTimeout(3000);
          selectionSuccess = true;
          console.log("Successfully selected options via helper function");
        } catch (error) {
          console.log("Error in approach 2:", error);
        }
      }
      
      // Approach 3: Find any combobox
      if (!selectionSuccess) {
        try {
          const selectBoxes = await page.$$('[role="combobox"]');
          if (selectBoxes.length > 0) {
            // First selection
            await selectBoxes[0].click();
            await page.waitForTimeout(2000);
            
            const options = await page.$$('[role="option"]');
            if (options.length > 0) {
              await options[0].click();
              await page.waitForTimeout(3000);
              
              // Second selection
              await selectBoxes[0].click();
              await page.waitForTimeout(2000);
              
              const refreshedOptions = await page.$$('[role="option"]');
              if (refreshedOptions.length > 1) {
                await refreshedOptions[1].click();
                await page.waitForTimeout(3000);
                selectionSuccess = true;
                console.log("Successfully selected options via generic combobox approach");
              }
            }
          }
        } catch (error) {
          console.log("Error in approach 3:", error);
        }
      }
      
      // Approach 4: Use CSS selectors to find streamlit widget
      if (!selectionSuccess) {
        try {
          const streamlitWidgets = await page.$$('.stSelectbox');
          if (streamlitWidgets.length > 0) {
            await streamlitWidgets[0].click();
            await page.waitForTimeout(2000);
            
            const options = await page.$$('[role="option"], .streamlit-selectbox li');
            if (options.length > 0) {
              await options[0].click();
              await page.waitForTimeout(3000);
              
              await streamlitWidgets[0].click();
              await page.waitForTimeout(2000);
              
              const refreshedOptions = await page.$$('[role="option"], .streamlit-selectbox li');
              if (refreshedOptions.length > 1) {
                await refreshedOptions[1].click();
                await page.waitForTimeout(3000);
                selectionSuccess = true;
                console.log("Successfully selected options via CSS selector approach");
              }
            }
          }
        } catch (error) {
          console.log("Error in approach 4:", error);
        }
      }
      
      if (!selectionSuccess) {
        console.log("Warning: Could not select options in any way");
      }
      
      /* 4️⃣  Wait for metrics and tables that Streamlit now renders   */
      console.log("Waiting for data tables to load...")
      
      // Take a screenshot after options selection
      if (process.env.NODE_ENV === 'development') {
        await page.screenshot({ path: '/tmp/placement-debug-after-selection.png' });
      }
      
      // Wait for metrics with extended timeout
      await page.waitForSelector('[data-testid="stMetric"]', { timeout: 30000 })
        .catch(() => console.log("No metrics found, will try to continue anyway"));
      
      // Wait for tables with extended timeout
      await page.waitForSelector('[data-testid="stTable"]', { timeout: 30000 })
        .catch(() => console.log("No tables found, will try to continue anyway"));
      
      // Give the page a final moment to fully render
      await page.waitForTimeout(5000);

      /* 5️⃣  Scrape everything we need                                 */
      const scraped = await page.evaluate(() => {
        /* helper for commas → plain digits */
        const digits = (txt: string = "") => (txt.match(/[\d,.]+/)?.[0] ?? "0").replace(/,/g, "")

        /* ── metrics ─────────────────────────────────────────────── */
        const metrics = [...document.querySelectorAll('[data-testid="stMetric"]')]
        const banner: Record<string, string> = {
          "total offers"       : digits(metrics[0]?.textContent || ""),
          "unique offers"      : digits(metrics[1]?.textContent || ""),
          "super-dream offers" : digits(metrics[2]?.textContent || ""),
          "dream offers"       : digits(metrics[3]?.textContent || ""),
          "total companies"    : digits(metrics[4]?.textContent || ""),
        }

        /* Highest / average package strings (they live in stText) */
        const txtEls = [...document.querySelectorAll('[data-testid="stText"]')]
        banner["highest package"] = txtEls.find(e => /Highest Package/i.test(e.textContent ?? ""))
          ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] ?? "N/A"
        banner["average package"] = txtEls.find(e => /Average Package/i.test(e.textContent ?? ""))
          ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] ?? "N/A"

        /* ── company-wise table ─────────────────────────────────── */
        const compTable = [...document.querySelectorAll('[data-testid="stTable"]')]
          .find(t => /Company.*Average CTC/i.test(t.textContent ?? ""))

        const companies = compTable
          ? [...compTable.querySelectorAll("tbody tr")].map(row => {
              const [name, placed, avg] = [...row.querySelectorAll("td, th")]
                .map((c: Element) => c.textContent?.trim() ?? "")
              return { name, placed, avgCTC: avg }
            })
          : []

        /* ── recent-offers table (Student | Company | CTC | Date) ─ */
        const offersTable = [...document.querySelectorAll('[data-testid="stTable"]')]
          .find(t => /Student.*Offer/i.test(t.textContent ?? ""))

        const recentOffers = offersTable
          ? [...offersTable.querySelectorAll("tbody tr")].map(row => {
              const [student, company, ctc, date] = [...row.querySelectorAll("td, th")]
                .map((c: Element) => c.textContent?.trim() ?? "")
              return { student: student || "Anonymous", company, ctc, date }
            })
          : []

        return { banner, companies, recentOffers }
      })

      /* 6️⃣  Optional company filter (case-insensitive substring)     */
      if (companyFilter) {
        const test = (s: string) => s.toLowerCase().includes(companyFilter.toLowerCase())
        scraped.companies = scraped.companies.filter((c: Company) => test(c.name))
        scraped.recentOffers = scraped.recentOffers.filter((o: RecentOffer) => test(o.company))
      }

      /* 7️⃣  Build response                                           */
      const data: PlacementData = {
        statistics  : scraped.banner,
        companies   : scraped.companies,
        recentOffers: scraped.recentOffers,
      }

      return {
        success    : true,
        year       : year ?? "2024-25",
        data,
        lastUpdated: lastUpdated ?? undefined,
        message    : `Retrieved placement information${companyFilter ? " (filtered)" : ""}`,
      } satisfies PlacementResponse
    })
  } catch (err: any) {
    console.error("Placement scraper error:", err);
    return {
      success: false,
      error  : err?.message ?? String(err),
      message: "Unable to fetch placement information. Please try again later.",
    }
  }
}

/* ───────────────────── helpers ───────────────────── */

async function withBrowser<T>(userFn: (page: any) => Promise<T>): Promise<T> {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );
    
    // Set a longer default timeout
    await page.setDefaultTimeout(60000);
    
    const result = await userFn(page);
    return result;
  } catch (err) {
    console.error("Browser error:", err);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Select a Streamlit <selectbox> option *by its visible label*.
 * Works by finding the label text, clicking the div that acts as
 * the combobox, then clicking the option inner text.
 */
async function selectStreamlitOption (
  page: any,
  labelText: string,
  optionText: string,
): Promise<boolean> {
  try {
    const labelHandle = await page.$x(`//label[contains(., "${labelText}")]`)
    if (labelHandle.length) {
      await labelHandle[0].click()
      await page.waitForSelector('div[role="option"]', { timeout: 5_000 })
      const opt = await page.$x(`//div[@role="option"][contains(., "${optionText}")]`)
      if (opt.length) await opt[0].click()
      await page.waitForTimeout(1000)
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
