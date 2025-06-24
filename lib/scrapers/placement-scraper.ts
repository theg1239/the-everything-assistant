import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';

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
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const result = Papa.parse<PlacementRecord>(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
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

    let normalOffers = await readCsvFile(normalOffersPath);
    const witchOffers = await readCsvFile(witchOffersPath);

    let allOffers: PlacementRecord[];

    if (combineWitch) {
      const filteredWitchOffers = preprocessAndFilterData(witchOffers);
      allOffers = [...normalOffers, ...filteredWitchOffers];
    } else {
      allOffers = normalOffers;
    }

    let processedOffers = preprocessAndFilterData(allOffers);

    if (companyFilter) {
      const filter = companyFilter.toLowerCase();
      processedOffers = processedOffers.filter(offer =>
        offer.Company.toLowerCase().includes(filter)
      );
    }

    if (campus) {
      processedOffers = processedOffers.filter(
        offer => offer.Campus?.toLowerCase() === campus.toLowerCase()
      );
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
