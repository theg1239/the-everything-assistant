import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

const smartMatchSchema = z.object({
  bestMatches: z
    .array(
      z.object({
        index: z.number(),
        confidence: z.number().min(0).max(1),
        reason: z.string(),
      })
    )
    .describe('Array of best matching items with confidence scores'),
  selectionString: z
    .string()
    .describe("Formatted selection string for CLI (e.g., '1,3,5' or '2-7')"),
  explanation: z.string().describe('Human-readable explanation of the selection'),
})

export async function POST(req: NextRequest) {
  try {
    const { query, options, type } = await req.json()

    if (!query || !options || !Array.isArray(options)) {
      return NextResponse.json(
        { error: 'Missing query, options, or invalid options format' },
        { status: 400 }
      )
    }

    // Format options for AI processing
    const formattedOptions = options.map((option: any, index: number) => ({
      index: index + 1,
      description: option.description || option.text || `Option ${index + 1}`,
      number: option.number || index + 1,
    }))

    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: smartMatchSchema,
      prompt: `
You are an intelligent assistant that matches user queries to available options for VTOP course materials.

Type: ${type || 'materials'}
User Query: "${query}"

Available Options:
${formattedOptions.map(opt => `${opt.index}. ${opt.description}`).join('\n')}

Instructions:
1. Analyze the user's natural language query
2. Find the best matching options based on keywords, context, and intent
3. Assign confidence scores (0.0 to 1.0) for each match
4. Only include matches with confidence >= 0.3
5. Generate a CLI-compatible selection string

Examples of selection strings:
- "1,3,5" for specific items
- "2-7" for a range
- "0" for all items
- "1-3,7,9-12" for mixed ranges and specific items

For course matching, consider:
- Subject names (fluid mechanics, data structures, computer networks)
- Course codes (CSE101, MECH202, etc.)
- Related terms and synonyms

For faculty matching, consider:
- Professor names (full names, partial names, nicknames)
- Department associations
- Teaching style descriptions

For material matching, consider:
- Content type (notes, assignments, slides, videos)
- Week/chapter numbers
- Exam preparation materials
- Specific topics or subjects

Be intelligent about partial matches and context clues.
`,
    })

    return NextResponse.json(result.object)
  } catch (error) {
    console.error('Smart matching error:', error)
    return NextResponse.json(
      {
        error: 'Failed to perform smart matching',
        bestMatches: [],
        selectionString: '0',
        explanation: 'Could not process the request. Defaulting to all items.',
      },
      { status: 500 }
    )
  }
}
