import fs from 'fs/promises'
import path from 'path'
import Papa from 'papaparse'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import * as z from 'zod'
import { getModelConfig } from '@/lib/model-registry'

interface Company {
  name: string
  placed: number
  avgCTC: string
}

interface RecentOffer {
  company: string
  ctc: string
  date: string
}

interface PlacementData {
  statistics: Record<string, string>
  companies: Company[]
  recentOffers: RecentOffer[]
}

export interface PlacementResponse {
  success: boolean
  year?: string
  data?: PlacementData
  message?: string
  lastUpdated?: string
  error?: string
}

interface PlacementRecord {
  Reg_No: string
  Branch: string
  Company: string
  CTC: string
  Month?: string
  Campus?: string
}

function convertCtcToNumeric(ctc: string): number | null {
  if (!ctc) return null
  try {
    const numericString = ctc.replace(/LPA/i, '').trim()
    const value = parseFloat(numericString)
    return isNaN(value) ? null : value
  } catch {
    return null
  }
}

async function readCsvFile(filePath: string): Promise<PlacementRecord[]> {
  try {
    console.log(`Attempting to read CSV file from: ${filePath}`)
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const result = Papa.parse<PlacementRecord>(fileContent, {
      header: true,
      skipEmptyLines: true,
    })
    console.log(`Successfully read ${result.data.length} records from ${filePath}`)
    if (result.data.length > 0) {
      console.log('Sample record:', JSON.stringify(result.data[0], null, 2))
    }
    return result.data
  } catch (error) {
    console.error(`Error reading or parsing CSV file at ${filePath}:`, error)
    return []
  }
}

function preprocessAndFilterData(records: PlacementRecord[]): PlacementRecord[] {
  const recordsWithNumericCtc = records.map(
    record =>
      ({
        ...record,
        numericCTC: convertCtcToNumeric(record.CTC),
      }) as PlacementRecord & { numericCTC: number | null }
  )

  const sorted = recordsWithNumericCtc.sort((a, b) => {
    if (a.Reg_No !== b.Reg_No) {
      return a.Reg_No.localeCompare(b.Reg_No)
    }
    if ((b as any).numericCTC !== (a as any).numericCTC) {
      return ((b as any).numericCTC ?? 0) - ((a as any).numericCTC ?? 0)
    }
    return a.Company.localeCompare(b.Company)
  })

  const uniqueRecords = new Map<string, PlacementRecord>()
  for (const record of sorted) {
    if (!uniqueRecords.has(record.Reg_No)) {
      uniqueRecords.set(record.Reg_No, record)
    }
  }

  return Array.from(uniqueRecords.values())
}

export async function scrapePlacementInfo(
  year: string = '2024-2025',
  companyFilter?: string,
  combineWitch: boolean = false,
  campus?: 'Vellore' | 'Chennai' | 'Amaravati' | 'Bhopal'
): Promise<PlacementResponse> {
  try {
    const basePath = path.join(process.cwd(), 'public', 'placements')
    const normalOffersPath = path.join(basePath, 'google_sheet_data.csv')
    const witchOffersPath = path.join(basePath, 'WITCH-P.csv')

    let normalOffers = await readCsvFile(normalOffersPath)
    const witchOffers = await readCsvFile(witchOffersPath)

    const processedNormalOffers = preprocessAndFilterData(normalOffers)
    const processedWitchOffers = preprocessAndFilterData(witchOffers)

    const shouldIncludeWitch = combineWitch || !!campus

    let allOffers: PlacementRecord[] = [...processedNormalOffers]
    if (shouldIncludeWitch) {
      allOffers = [...allOffers, ...processedWitchOffers]
    }

    let processedOffers = allOffers

    if (companyFilter) {
      const filter = companyFilter.toLowerCase()
      processedOffers = processedOffers.filter(offer =>
        offer.Company.toLowerCase().includes(filter)
      )
    }

    if (campus) {
      console.log(`Filtering for campus: ${campus}`)
      const campusLower = campus.toLowerCase()
      console.log(`Total offers before campus filter: ${processedOffers.length}`)

      const allCampuses = [...new Set(processedOffers.map(o => o.Campus).filter(Boolean))]
      console.log('All Campus values in data:', allCampuses)

      processedOffers = processedOffers.filter(offer => {
        if (!offer.Campus) return true
        const offerCampus = offer.Campus.toLowerCase()
        const matches = offerCampus.includes(campusLower)
        if (matches) {
          console.log(`Match found: ${offerCampus} includes ${campusLower}`)
        }
        return matches
      })

      console.log(`Total offers after campus filter: ${processedOffers.length}`)
    }

    const totalOffers = processedOffers.length
    const offersWithCtc = processedOffers.filter(o => convertCtcToNumeric(o.CTC) !== null)
    const ctcValues = offersWithCtc.map(o => convertCtcToNumeric(o.CTC)!)

    const highestCTC = ctcValues.length > 0 ? Math.max(...ctcValues) : 0
    const lowestCTC = ctcValues.length > 0 ? Math.min(...ctcValues) : 0
    const averageCTC =
      ctcValues.length > 0 ? ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length : 0

    const sortedCtc = [...ctcValues].sort((a, b) => a - b)
    const medianCTC =
      sortedCtc.length > 0
        ? sortedCtc.length % 2 === 0
          ? (sortedCtc[sortedCtc.length / 2 - 1] + sortedCtc[sortedCtc.length / 2]) / 2
          : sortedCtc[Math.floor(sortedCtc.length / 2)]
        : 0

    const companyStats = new Map<string, { count: number; ctcSum: number; ctcCount: number }>()
    processedOffers.forEach(offer => {
      const numericCTC = convertCtcToNumeric(offer.CTC)
      const stats = companyStats.get(offer.Company) || { count: 0, ctcSum: 0, ctcCount: 0 }
      stats.count++
      if (numericCTC !== null) {
        stats.ctcSum += numericCTC
        stats.ctcCount++
      }
      companyStats.set(offer.Company, stats)
    })

    const companies: Company[] = Array.from(companyStats.entries())
      .map(([name, { count, ctcSum, ctcCount }]) => ({
        name,
        placed: count,
        avgCTC: ctcCount > 0 ? (ctcSum / ctcCount).toFixed(2) + ' LPA' : 'N/A',
      }))
      .sort((a, b) => b.placed - a.placed)

    const recentOffers: RecentOffer[] = processedOffers.slice(0, 20).map(offer => ({
      company: offer.Company,
      ctc: offer.CTC,
      date: offer.Month || 'N/A',
    }))

    const data: PlacementData = {
      statistics: {
        'Total Offers': totalOffers.toString(),
        'Highest CTC': `${highestCTC.toFixed(2)} LPA`,
        'Lowest CTC': `${lowestCTC.toFixed(2)} LPA`,
        'Average CTC': `${averageCTC.toFixed(2)} LPA`,
        'Median CTC': `${medianCTC.toFixed(2)} LPA`,
        Companies: companyStats.size.toString(),
      },
      companies: companies.slice(0, 50),
      recentOffers,
    }

    return {
      success: true,
      year,
      data,
      message: `Retrieved placement information for ${year}`,
      lastUpdated: new Date().toISOString(),
    }
  } catch (err: any) {
    console.error('Placement scraper error:', err)
    return {
      success: false,
      error: err?.message ?? String(err),
      message: 'Unable to fetch placement information. Please try again later.',
    }
  }
}

export async function parsePlacementData(rawData: any, userContext: string = '', userId?: string) {
  try {
    const placementParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      summary: z.string(),
    })

    const placementModel = getModelConfig('placementFormatter')
    const providerClient = rateLimitedAI[placementModel.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider for placements: ${placementModel.provider}`)
    }

    const result = await providerClient.generateObject(
      {
        model: await providerClient.model(placementModel.modelId),
        schema: placementParseSchema,
        prompt: `You are a friendly and insightful university career advisor. Your goal is to summarize placement data in a clear, engaging, and easy-to-understand way for students.

USER'S ORIGINAL REQUEST: ${userContext}
Raw Placement Data: ${JSON.stringify(rawData.data)}

Please analyze this data and generate a response in HTML format. Follow these instructions carefully:

**Overall Summary:**
- Start with a brief, encouraging summary of the placement season for ${rawData.year}.
- If a specific company was searched for (check the user's request), focus the entire summary on that company's hiring activity.

**Key Statistics (if no specific company was searched for):**
- Present the main statistics in a clear list.
- Use friendly labels (e.g., "Top Salary" instead of "Highest CTC").
- Include: Total Offers, Highest Salary, Average Salary, and the Number of Companies that have hired so far.

**Top Hiring Companies (if no specific company was searched for):**
- List the top 5 companies that have made the most offers.
- For each company, mention the number of students hired and their average salary package.

**Recent Activity:**
- Mention 3-5 unique, recent placement offers to show current activity.
- **IMPORTANT**: Do not list the same company and salary package multiple times. Summarize if needed (e.g., "Microsoft made several offers at 55 LPA.").
- Use the 'date' field from the recent offers to show when they happened.

**Formatting:**
- Use simple HTML tags: <p>, <strong>, <ul>, <li>.
- DO NOT use markdown (like ** or #).
- Keep the tone positive and informative.

**Example for a general query:**
<p>The 2024-2025 placement season is off to a strong start! Here's a quick look at the numbers:</p>
<ul>
  <li><strong>Total Offers:</strong> 150</li>
  <li><strong>Top Salary:</strong> 55.00 LPA</li>
  <li><strong>Average Salary:</strong> 12.50 LPA</li>
  <li><strong>Companies Visited:</strong> 45</li>
</ul>
<p><strong>Top Recruiters So Far:</strong></p>
<ul>
  <li>TCS Digital: 30 hires (Avg. 7.00 LPA)</li>
  <li>Microsoft: 12 hires (Avg. 55.00 LPA)</li>
</ul>
<p><strong>Recent Buzz:</strong></p>
<ul>
  <li>An offer was made by Capgemini for 7.5 LPA in September.</li>
  <li>Microsoft recently extended several offers around 55 LPA in August.</li>
</ul>

**Example for a company-specific query (e.g., "Microsoft"):**
<p>Here's the placement report for Microsoft for the 2024-2025 season:</p>
<ul>
  <li><strong>Total Hires:</strong> 12</li>
  <li><strong>Average Salary:</strong> 55.00 LPA</li>
  <li><strong>Highest Offer:</strong> 55.00 LPA</li>
</ul>
<p>Microsoft has been actively recruiting, with most offers made in August and July for their PPO program.</p>

You can also use HTML formatted tables to display the data in a more structured way.
Your response should be a single block of HTML content for the 'formatted_content' field.
`,
      },
      userId
    )

    return result.object
  } catch (error) {
    console.error('Error parsing Placement data with AI SDK:', error)
    return {
      success: false,
      error: 'Failed to parse Placement data',
      formatted_content: 'Unable to parse the placement data at this time.',
      summary: 'Parsing failed',
    }
  }
}
