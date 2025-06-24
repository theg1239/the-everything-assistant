import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';
import { rateLimitedGoogle } from '@/lib/rate-limited-ai'
import { z } from 'zod';

interface Company {
  name: string;
  placed: number;
  avgCTC: string;
}

interface RecentOffer {
  company: string;
  ctc: string;
  date: string;
}

interface PlacementData {
  statistics: Record<string, string>;
  companies: Company[];
  recentOffers: RecentOffer[];
}

export interface PlacementResponse {
  success: boolean;
  year?: string;
  data?: PlacementData;
  message?: string;
  lastUpdated?: string;
  error?: string;
}

interface PlacementRecord {
  'Reg_No': string;
  'Branch': string;
  'Company': string;
  'CTC': string;
  'Month'?: string;
  'Campus'?: string;
}

function convertCtcToNumeric(ctc: string): number | null {
  if (!ctc) return null;
  try {
    const numericString = ctc.replace(/LPA/i, '').trim();
    const value = parseFloat(numericString);
    return isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

async function readCsvFile(filePath: string): Promise<PlacementRecord[]> {
  try {
    console.log(`Attempting to read CSV file from: ${filePath}`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const result = Papa.parse<PlacementRecord>(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
    console.log(`Successfully read ${result.data.length} records from ${filePath}`);
    if (result.data.length > 0) {
      console.log('Sample record:', JSON.stringify(result.data[0], null, 2));
    }
    return result.data;
  } catch (error) {
    console.error(`Error reading or parsing CSV file at ${filePath}:`, error);
    return [];
  }
}

function preprocessAndFilterData(records: PlacementRecord[]): PlacementRecord[] {
  const recordsWithNumericCtc = records.map(record => ({
    ...record,
    numericCTC: convertCtcToNumeric(record.CTC),
  }));

  const sorted = recordsWithNumericCtc.sort((a, b) => {
    if (a.Reg_No !== b.Reg_No) {
      return a.Reg_No.localeCompare(b.Reg_No);
    }
    if (b.numericCTC !== a.numericCTC) {
      return (b.numericCTC ?? 0) - (a.numericCTC ?? 0);
    }
    return a.Company.localeCompare(b.Company);
  });

  const uniqueRecords = new Map<string, PlacementRecord>();
  for (const record of sorted) {
    if (!uniqueRecords.has(record.Reg_No)) {
      uniqueRecords.set(record.Reg_No, record);
    }
  }

  return Array.from(uniqueRecords.values());
}

export async function scrapePlacementInfo(
  year: string = '2024-2025',
  companyFilter?: string,
  combineWitch: boolean = false,
  campus?: 'Vellore' | 'Chennai' | 'Amaravati' | 'Bhopal'
): Promise<PlacementResponse> {
  try {
    const basePath = path.join(process.cwd(), 'public', 'placements');
    const normalOffersPath = path.join(basePath, 'google_sheet_data.csv');
    const witchOffersPath = path.join(basePath, 'WITCH-P.csv');

    // Always load both data sources
    let normalOffers = await readCsvFile(normalOffersPath);
    const witchOffers = await readCsvFile(witchOffersPath);

    // Preprocess both data sources
    const processedNormalOffers = preprocessAndFilterData(normalOffers);
    const processedWitchOffers = preprocessAndFilterData(witchOffers);

    // If we're filtering by campus, we need to include WITCH data
    // since it contains the campus information
    const shouldIncludeWitch = combineWitch || !!campus;
    
    // Combine offers based on conditions
    let allOffers: PlacementRecord[] = [...processedNormalOffers];
    if (shouldIncludeWitch) {
      allOffers = [...allOffers, ...processedWitchOffers];
    }

    // If campus is specified, we'll need to filter by it
    // Since normal offers don't have campus info, we'll include them all
    // and only filter the WITCH offers by campus
    let processedOffers = allOffers;

    if (companyFilter) {
      const filter = companyFilter.toLowerCase();
      processedOffers = processedOffers.filter(offer =>
        offer.Company.toLowerCase().includes(filter)
      );
    }

    if (campus) {
      console.log(`Filtering for campus: ${campus}`);
      const campusLower = campus.toLowerCase();
      console.log(`Total offers before campus filter: ${processedOffers.length}`);
      
      // Get unique campus values for debugging
      const allCampuses = [...new Set(processedOffers.map(o => o.Campus).filter(Boolean))];
      console.log('All Campus values in data:', allCampuses);
      
      // If we have campus info, filter by it
      // If no campus info is available, include all offers (assume they're for the requested campus)
      processedOffers = processedOffers.filter(offer => {
        // If no campus info is available, include the offer
        if (!offer.Campus) return true;
        
        // Otherwise, check if it matches the requested campus
        const offerCampus = offer.Campus.toLowerCase();
        const matches = offerCampus.includes(campusLower);
        if (matches) {
          console.log(`Match found: ${offerCampus} includes ${campusLower}`);
        }
        return matches;
      });
      
      console.log(`Total offers after campus filter: ${processedOffers.length}`);
    }

    const totalOffers = processedOffers.length;
    const offersWithCtc = processedOffers.filter(o => convertCtcToNumeric(o.CTC) !== null);
    const ctcValues = offersWithCtc.map(o => convertCtcToNumeric(o.CTC)!);

    const highestCTC = ctcValues.length > 0 ? Math.max(...ctcValues) : 0;
    const lowestCTC = ctcValues.length > 0 ? Math.min(...ctcValues) : 0;
    const averageCTC = ctcValues.length > 0 ? ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length : 0;

    const sortedCtc = [...ctcValues].sort((a, b) => a - b);
    const medianCTC =
      sortedCtc.length > 0
        ? sortedCtc.length % 2 === 0
          ? (sortedCtc[sortedCtc.length / 2 - 1] + sortedCtc[sortedCtc.length / 2]) / 2
          : sortedCtc[Math.floor(sortedCtc.length / 2)]
        : 0;

    const companyStats = new Map<string, { count: number; ctcSum: number; ctcCount: number }>();
    processedOffers.forEach(offer => {
      const numericCTC = convertCtcToNumeric(offer.CTC);
      const stats = companyStats.get(offer.Company) || { count: 0, ctcSum: 0, ctcCount: 0 };
      stats.count++;
      if (numericCTC !== null) {
        stats.ctcSum += numericCTC;
        stats.ctcCount++;
      }
      companyStats.set(offer.Company, stats);
    });

    const companies: Company[] = Array.from(companyStats.entries())
      .map(([name, { count, ctcSum, ctcCount }]) => ({
        name,
        placed: count,
        avgCTC: ctcCount > 0 ? (ctcSum / ctcCount).toFixed(2) + ' LPA' : 'N/A',
      }))
      .sort((a, b) => b.placed - a.placed);

    const recentOffers: RecentOffer[] = processedOffers
      .slice(0, 20)
      .map(offer => ({
        company: offer.Company,
        ctc: offer.CTC,
        date: offer.Month || 'N/A',
      }));

    const data: PlacementData = {
      statistics: {
        'Total Offers': totalOffers.toString(),
        'Highest CTC': `${highestCTC.toFixed(2)} LPA`,
        'Lowest CTC': `${lowestCTC.toFixed(2)} LPA`,
        'Average CTC': `${averageCTC.toFixed(2)} LPA`,
        'Median CTC': `${medianCTC.toFixed(2)} LPA`,
        'Companies': companyStats.size.toString(),
      },
      companies: companies.slice(0, 50),
      recentOffers,
    };

    return {
      success: true,
      year,
      data,
      message: `Retrieved placement information for ${year}`,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('Placement scraper error:', err);
    return {
      success: false,
      error: err?.message ?? String(err),
      message: 'Unable to fetch placement information. Please try again later.',
    };
  }
}

export async function parsePlacementData(
  rawData: any,
  userContext: string = '',
  userId?: string
) {
  try {
    const placementParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      summary: z.string(),
    });

    const result = await rateLimitedGoogle.generateObject({
      model: await rateLimitedGoogle.model('gemini-2.5-flash-lite-preview-06-17'),
      schema: placementParseSchema,
      prompt: `You are a helpful assistant that summarizes university placement data into a clear and friendly natural language format.

USER'S ORIGINAL REQUEST: ${userContext}
Raw Placement Data: ${JSON.stringify(rawData.data)}

Please parse this data and generate a response that:
1.  Starts with a brief, engaging summary of the overall placement season for the specified year (${rawData.year}).
2.  Clearly states the key statistics:
    - Total Offers
    - Highest, Lowest, Average, and Median CTC (Cost to Company)
    - Number of companies that visited.
3.  Lists the top 5-7 recruiting companies with the number of students they hired and their average CTC.
4.  Mentions a few (3-5) of the most recent placements to give a sense of current activity.
5.  Is formatted using simple HTML (like <strong>, <ul>, <li>, <p>) for readability. DO NOT use markdown like ** or *.
6.  Maintains a positive and informative tone, like a university career advisor.
7.  If a specific company was filtered, tailor the response to focus on that company's data.

Example Output Structure:
<p>Here's a snapshot of the ${rawData.year} placement season so far!</p>
<p><strong>Key Statistics:</strong></p>
<ul>
  <li><strong>Total Offers:</strong> ${rawData.data.statistics['Total Offers']}</li>
  <li><strong>Highest Salary:</strong> ${rawData.data.statistics['Highest CTC']}</li>
</ul>
<p><strong>Top Companies by Offers:</strong></p>
<ul>
  <li>TCS Digital: 349 students (Avg. 7.00 LPA)</li>
</ul>
<p><strong>Recent Placements:</strong></p>
<ul>
  <li>An offer was made by Capgemini for 7.5 LPA.</li>
</ul>

Tailor the summary to be a direct answer to the user's original request. The final output should be a single block of HTML content for the 'formatted_content' field.
`,
    }, userId);

    return result.object;
  } catch (error) {
    console.error('Error parsing Placement data with AI SDK:', error);
    return {
      success: false,
      error: 'Failed to parse Placement data',
      formatted_content: 'Unable to parse the placement data at this time.',
      summary: 'Parsing failed',
    };
  }
}