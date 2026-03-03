const { generateObject, generateText } = require('ai')
const { google } = require('@ai-sdk/google')
const { z } = require('zod')
const logger = require('../utils/logger')

class ImageAnalyzer {
  constructor() {
    this.visionModel = google('gemini-3.1-flash-lite')
  }

  async analyzeImage(imageBuffer) {
    try {
      const base64Image = imageBuffer.toString('base64')
      const mimeType = this.detectMimeType(imageBuffer)

      const analysisSchema = z.object({
        description: z.string().describe('Overall description of the image'),
        visible_text: z.string().describe('Any text visible in the image'),
        educational_content: z.string().describe('Academic or educational aspects'),
        key_concepts: z.array(z.string()).describe('Array of main concepts'),
        student_relevance: z.number().min(1).max(10).describe('Relevance for students (1-10)'),
        subject_areas: z.array(z.string()).describe('Relevant academic subjects'),
      })

      const result = await generateObject({
        model: this.visionModel,
        schema: analysisSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image and provide:
                1. A detailed description of what's shown
                2. Any text visible in the image
                3. Educational or academic content if present
                4. Key concepts or topics covered
                5. Whether this would be helpful for students (rate 1-10)
                6. Relevant academic subjects`,
              },
              {
                type: 'image',
                image: base64Image,
                mimeType: mimeType,
              },
            ],
          },
        ],
      })

      return result.object
    } catch (error) {
      logger.error('Error analyzing image with AI SDK:', error)
      return {
        description: 'Error analyzing image',
        visible_text: '',
        educational_content: '',
        key_concepts: [],
        student_relevance: 1,
        subject_areas: [],
        error: error.message,
      }
    }
  }

  detectMimeType(buffer) {
    const header = buffer.subarray(0, 4).toString('hex')

    if (header.startsWith('ffd8ff')) return 'image/jpeg'
    if (header.startsWith('89504e47')) return 'image/png'
    if (header.startsWith('47494638')) return 'image/gif'
    if (header.startsWith('52494646')) return 'image/webp'

    return 'image/jpeg'
  }

  async analyzeImageForAccessibility(imageBuffer) {
    try {
      const base64Image = imageBuffer.toString('base64')
      const mimeType = this.detectMimeType(imageBuffer)

      const result = await generateText({
        model: this.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Provide a detailed alt-text description for this image that would be helpful for visually impaired users. Focus on educational content, diagrams, charts, or any academic material shown.',
              },
              {
                type: 'image',
                image: base64Image,
                mimeType: mimeType,
              },
            ],
          },
        ],
        maxTokens: 500,
      })

      return result.text
    } catch (error) {
      logger.error('Error generating alt-text:', error)
      return 'Image analysis unavailable'
    }
  }
}

module.exports = ImageAnalyzer
