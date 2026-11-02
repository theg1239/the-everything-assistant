import { generateText, Output } from 'ai'
import * as z from 'zod'

import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { getModelConfig } from '@/lib/model-registry'
import { enforceUserRateLimit } from '@/lib/user-rate-limiter'

import { structuredDataSchema, stripSchemaPlaceholders } from './request'
import { isRecord, readString } from './tool-helpers'

const vtopParseSchema = z.object({
  success: z.boolean(),
  formatted_content: z.string(),
  structured_data: structuredDataSchema.optional(),
  summary: z.string(),
})

export type ParsedVTOPData = {
  success: boolean
  formatted_content: string
  structured_data?: Record<string, unknown>
  summary: string
  raw?: unknown
  parser: string
}

const servedFileSchema = z.object({
  name: z.string(),
  size: z.number(),
  downloadUrl: z.string(),
})

function describeDownloadInfo(rawData: unknown): string {
  const downloadInfo =
    isRecord(rawData) && isRecord(rawData.downloadInfo) ? rawData.downloadInfo : null
  if (!downloadInfo) return ''

  const servedFiles = Array.isArray(downloadInfo.servedFiles)
    ? downloadInfo.servedFiles.flatMap(file => {
        const parsed = servedFileSchema.safeParse(file)
        return parsed.success ? [parsed.data] : []
      })
    : []

  if (servedFiles.length > 0) {
    const fileLines = servedFiles
      .map(file => {
        const cleanName = file.name.replace(/_\d+\.(pdf|pptx|docx|txt)$/i, '.$1')
        return `- <strong>${cleanName}</strong> <span style=  "color: #6b7280; font-size: 0.875rem;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span> <a href="${file.downloadUrl}" download="${file.name}">Download</a>`
      })
      .join('\n')

    return `
🔥 CRITICAL: DOWNLOAD FILES ARE AVAILABLE AND MUST BE INCLUDED!

SERVED FILES WITH DOWNLOAD LINKS:
${fileLines}

FILES SUMMARY:
- Total Downloaded: ${String(downloadInfo.filesDownloaded || servedFiles.length)}
- Total Available: ${String(downloadInfo.totalFiles || servedFiles.length)}
- Available via temporary download links (expires in 2 hours)

⚠️ MANDATORY: You MUST include these download links in your formatted_content as clickable HTML links!
⚠️ DO NOT mention any local paths - only use the served download URLs!
`
  }

  const downloadPath = readString(downloadInfo, 'downloadPath')
  if (downloadPath) {
    return `
LOCAL FILES DOWNLOADED:
- Files Downloaded: ${String(downloadInfo.filesDownloaded || 0)}
- Local Path: ${downloadPath}
(Note: No served links available)
`
  }

  return ''
}

export async function parseVTOPData(
  rawData: unknown,
  command: string,
  userContext: string = '',
  userId?: string
): Promise<ParsedVTOPData> {
  try {
    const parserModel = getModelConfig('vtopParser')

    await enforceUserRateLimit(userId)
    const result = await generateText({
      model: languageModel('vtopParser'),
      providerOptions: defaultProviderOptions,
      output: Output.object({ schema: vtopParseSchema }),
      prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.

USER'S ORIGINAL REQUEST: ${userContext}
Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

SPECIAL HANDLING FOR COURSE MATERIALS/DOWNLOADS:
${describeDownloadInfo(rawData)}

RESPONSE FORMAT:
- Include a clear summary of the data
- Provide structured_data where possible
- For tables or lists, use clean markdown formatting
- Keep response concise but informative
        `,
    })

    const parsed = result.output

    if (parsed.structured_data) {
      stripSchemaPlaceholders(parsed.structured_data)
    }

    return {
      ...parsed,
      raw: rawData,
      parser: parserModel.modelId,
    }
  } catch (error) {
    console.error('VTOP parsing failed, returning fallback structure:', error)
    const fallbackResult: ParsedVTOPData = {
      success: true,
      formatted_content: typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2),
      structured_data: { raw: rawData },
      summary: `Processed ${command} data from VTOP.`,
      parser: 'fallback',
    }
    stripSchemaPlaceholders(fallbackResult)
    return fallbackResult
  }
}
