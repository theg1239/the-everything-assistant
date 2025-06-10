import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'

// Define the response schema
const vtopParseSchema = z.object({
  success: z.boolean(),
  formatted_content: z.string(),
  structured_data: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  summary: z.string(),
})

export async function POST(req: NextRequest) {
  try {
    const { rawData, command } = await req.json()

    if (!rawData || !command) {
      return NextResponse.json(
        { error: 'Missing rawData or command' },
        { status: 400 }
      )
    }

    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: vtopParseSchema,      prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.

Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

Please parse this VTOP data and return a structured response with:
- success: true if parsing was successful
- formatted_content: A natural language description with proper formatting
- structured_data: Key-value pairs extracted from the data (optional)
- summary: A brief summary of what this data shows

FORMATTING GUIDELINES:
1. Use natural language sentences and paragraphs, not tables or lists
2. If you need to present tabular data, use HTML table tags: <table>, <tr>, <td>, <th>
3. Use HTML formatting tags like <strong>, <em>, <br>, <p> for better presentation
4. For profile data: Write in natural sentences about the person's details
5. For attendance: Describe attendance in conversational language
6. For marks/grades: Explain performance in narrative form
7. For receipts/financial data: Describe transactions naturally with HTML tables if needed
8. For timetable: Present schedule information conversationally
9. Make it engaging and easy to read, like explaining to a friend

Example formats:
- Profile: "John is a Computer Science student at VIT with student ID 12345. He can be reached at john@email.com..."
- Receipts: "Here are your recent payments to VIT: <table><tr><th>Date</th><th>Amount</th><th>Description</th></tr>..."
- Attendance: "Your attendance looks good overall. In Mathematics, you have 85% attendance which is above the required 75%..."

Make the formatted_content engaging and conversational while being informative.
`
    })

    return NextResponse.json(result.object)

  } catch (error) {
    console.error('Error parsing VTOP data with AI SDK:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to parse VTOP data',
        formatted_content: 'Unable to parse the data at this time.',
        structured_data: {},
        summary: 'Parsing failed'
      },
      { status: 500 }
    )
  }
}
