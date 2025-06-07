import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import path from "path";

export interface PlacementStatistics {
  totalOffers: number;
  uniqueOffers: number;
  superDreamOffers: number;
  dreamOffers: number;
  totalCompanies: number;
  highestPackage: string;
  averagePackage: string;
  year: string;
  branch?: string;
}

export async function scrapePlacementStats(
  year?: string,
  branch?: string
): Promise<PlacementStatistics | null> {
  let browser;
  try {
    // Similar Chromium setup as papers-codechef.ts
    const chromiumBinDir = path.join(
      "/var/task/node_modules/@sparticuz/chromium/bin"
    );

    let execPath: string;
    try {
      execPath = await chromium.executablePath(chromiumBinDir);
    } catch (fallbackError) {
      console.warn(
        `Couldn't find Chromium in ${chromiumBinDir}, falling back:`,
        fallbackError
      );
      execPath = await chromium.executablePath();
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: execPath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const url = "https://vit-placements-tracker.streamlit.app/";
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });

    // Wait for Streamlit to load content
    await page.waitForSelector('[data-testid="stMetric"]', { timeout: 15000 });

    // Extract statistics
    const stats = await page.evaluate(() => {
      const metrics = Array.from(document.querySelectorAll('[data-testid="stMetric"]'));
      const extractNumber = (str: string) => {
        const match = str.match(/[\d,]+\.?\d*/);
        return match ? match[0].replace(/,/g, '') : '0';
      };

      // Find highest and average package
      const highestPackage = Array.from(document.querySelectorAll('[data-testid="stText"]'))
        .find(el => el.textContent?.includes('Highest Package'))
        ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] || 'N/A';
      
      const averagePackage = Array.from(document.querySelectorAll('[data-testid="stText"]'))
        .find(el => el.textContent?.includes('Average Package'))
        ?.textContent?.match(/[\d.]+\s*LPA/)?.[0] || 'N/A';

      return {
        totalOffers: parseInt(extractNumber(metrics[0]?.textContent || '0')),
        uniqueOffers: parseInt(extractNumber(metrics[1]?.textContent || '0')),
        superDreamOffers: parseInt(extractNumber(metrics[2]?.textContent || '0')),
        dreamOffers: parseInt(extractNumber(metrics[3]?.textContent || '0')),
        totalCompanies: parseInt(extractNumber(metrics[4]?.textContent || '0')),
        highestPackage,
        averagePackage,
        year: new Date().getFullYear().toString(),
      };
    });

    return stats;
  } catch (error) {
    console.error("Error scraping placement stats:", error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
