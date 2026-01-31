import * as z from 'zod/v3';

import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { getModelConfig } from '@/lib/model-registry'

import { jsonValueSchema, structuredDataSchema, stripSchemaPlaceholders } from './request'

export async function parseVTOPData(
  rawData: any,
  command: string,
  userContext: string = '',
  userId?: string
) {
  try {
    const vtopParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      structured_data: structuredDataSchema.optional(),
      summary: z.string(),
    })

    const parserModel = getModelConfig('vtopParser')
    const providerClient = rateLimitedAI[parserModel.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider for VTOP parser: ${parserModel.provider}`)
    }

    const result = await providerClient.generateObject(
      {
        model: { modelId: parserModel.modelId },
        schema: vtopParseSchema,
        prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.

USER'S ORIGINAL REQUEST: ${userContext}
Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

SPECIAL HANDLING FOR COURSE MATERIALS/DOWNLOADS:
${
  rawData.downloadInfo &&
  rawData.downloadInfo.servedFiles &&
  rawData.downloadInfo.servedFiles.length > 0
    ? `
🔥 CRITICAL: DOWNLOAD FILES ARE AVAILABLE AND MUST BE INCLUDED!

SERVED FILES WITH DOWNLOAD LINKS:
${rawData.downloadInfo.servedFiles
  .map((file: any) => {
    const cleanName = file.name.replace(/_\d+\.(pdf|pptx|docx|txt)$/i, '.$1')
    return `- <strong>${cleanName}</strong> <span style=  "color: #6b7280; font-size: 0.875rem;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span> <a href="${file.downloadUrl}" download="${file.name}">Download</a>`
  })
  .join('\n')}

FILES SUMMARY:
- Total Downloaded: ${rawData.downloadInfo.filesDownloaded || rawData.downloadInfo.servedFiles.length}
- Total Available: ${rawData.downloadInfo.totalFiles || rawData.downloadInfo.servedFiles.length}
- Available via temporary download links (expires in 2 hours)

⚠️ MANDATORY: You MUST include these download links in your formatted_content as clickable HTML links!
⚠️ DO NOT mention any local paths - only use the served download URLs!
`
    : rawData.downloadInfo && rawData.downloadInfo.downloadPath
      ? `
LOCAL FILES DOWNLOADED:
- Files Downloaded: ${rawData.downloadInfo.filesDownloaded || 0}
- Local Path: ${rawData.downloadInfo.downloadPath}
(Note: No served links available)
`
      : ''
}

RESPONSE FORMAT:
- Include a clear summary of the data
- Provide structured_data where possible
- For tables or lists, use clean markdown formatting
- Keep response concise but informative
        `,
      },
      userId
    )

    const parsed = vtopParseSchema.parse(result.object)

    if (parsed.structured_data) {
      stripSchemaPlaceholders(parsed.structured_data)
    }

    return {
      ...parsed,
      raw: rawData,
      parser: parserModel.modelId,
    }
  } catch (error: any) {
    console.error('VTOP parsing failed, returning fallback structure:', error)
    const fallbackResult = {
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
