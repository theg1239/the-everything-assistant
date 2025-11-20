import { tool } from 'ai'
import { z } from 'zod'

import { scrapePlacementInfo } from '@/lib/scrapers/placement-scraper'

type ParsedPlacementData = {
  formatted_content: string
  summary: string
}

export function placementTools() {
  const getPlacementInfo = tool({
    description:
      'Get latest placement statistics and company information. Use this for questions about placements, highest packages, company offers, salary stats, or recruitment.',
    inputSchema: z.object({
      year: z.string().optional().describe('Academic year, e.g., 2024-25'),
      companyFilter: z
        .string()
        .optional()
        .describe('Filter results by a specific company. Can be a partial name.'),
      combineWitch: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to include WITCH (e.g., TCS, Cognizant) offers in the results.'),
      campus: z
        .enum(['Vellore', 'Chennai', 'Amaravati', 'Bhopal'])
        .optional()
        .describe('Filter results by campus.'),
    }),
    execute: async ({ year, companyFilter, combineWitch, campus }) => {
      const raw = await scrapePlacementInfo(year, companyFilter, combineWitch, campus)
      try {
        const { parsePlacementData } = await import('@/lib/scrapers/placement-scraper')
        const parsed = (await parsePlacementData(raw, '', undefined)) as unknown as ParsedPlacementData
        return {
          ...raw,
          campus,
          formatted_content: parsed.formatted_content,
          summary: parsed.summary,
          message: parsed.summary || parsed.formatted_content,
        }
      } catch (err) {
        return {
          ...raw,
          campus,
        }
      }
    },
  })

  return { getPlacementInfo }
}

export type PlacementTools = ReturnType<typeof placementTools>

