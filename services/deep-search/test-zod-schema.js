#!/usr/bin/env node

require('dotenv').config()

const { generateObject } = require('ai')
const { google } = require('@ai-sdk/google')
const { z } = require('zod')

async function testVideoAnalysisSchema() {
  console.log('Testing video analysis Zod schema...')
  
  try {
    // Define the same schema as in the Reddit scraper
    const videoAnalysisSchema = z.object({
      description: z.string().describe('Detailed description of what happens in the video'),
      educational_content: z.string().describe('Educational, informative, or learning-relevant information present'),
      visible_text: z.string().describe('Any text, captions, or written content visible in the frames'),
      key_topics: z.array(z.string()).describe('Main themes, subjects, or topics covered'),
      student_relevance: z.number().min(1).max(10).describe('Rating from 1-10 of relevance for students'),
      content_type: z.string().describe('Category of the video (lecture, tutorial, demonstration, discussion, entertainment, etc.)'),
      summary: z.string().describe('Brief 2-3 sentence summary of the video content'),
      context_alignment: z.string().describe('How well the video content matches the post title and comments context'),
      frame_count: z.number().describe('Number of frames analyzed')
    })

    const testPrompt = `Analyze this hypothetical video about "JavaScript tutorial for beginners".

**POST CONTEXT:**
- Title: "JavaScript Basics - Variables and Functions"
- Content: "Learning the fundamentals of JavaScript programming"
- Author: student123
- Score: 15 upvotes
- Flair: Tutorial

**VIDEO DETAILS:**
This is a test analysis for a programming tutorial video with 5 key frames.

Please analyze and provide structured information about this educational video content.`

    const { object } = await generateObject({
      model: google('gemini-2.0-flash-exp'),
      prompt: testPrompt,
      schema: videoAnalysisSchema,
      maxTokens: 1000,
      temperature: 0.3,
    })

    // Add frame count
    object.frame_count = 5

    console.log('✅ Video analysis schema test passed!')
    console.log('Generated object:', JSON.stringify(object, null, 2))
    
    // Validate the object matches our schema
    const validatedObject = videoAnalysisSchema.parse(object)
    console.log('✅ Schema validation passed!')
    
    return true
  } catch (error) {
    console.error('❌ Video analysis schema test failed:', error.message)
    return false
  }
}

async function testContentAnalysisSchema() {
  console.log('\nTesting content analysis Zod schema...')
  
  try {
    const contentAnalysisSchema = z.object({
      topics: z.array(z.string()).describe('Key topics and themes'),
      sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
      keywords: z.array(z.string()).describe('Important keywords'),
      summary: z.string().describe('Brief summary'),
      relevance: z.enum(['high', 'medium', 'low']).describe('Relevance to students')
    })

    const testContent = `This is a great tutorial about machine learning algorithms. The professor explains neural networks clearly and provides practical examples. Students found it very helpful for their coursework.`

    const { object } = await generateObject({
      model: google('gemini-2.5-flash-lite-preview-06-17'),
      prompt: `Analyze this Reddit content: "${testContent}"`,
      schema: contentAnalysisSchema,
      maxTokens: 500,
      temperature: 0.3,
    })

    console.log('✅ Content analysis schema test passed!')
    console.log('Generated object:', JSON.stringify(object, null, 2))
    
    // Validate the object matches our schema
    const validatedObject = contentAnalysisSchema.parse(object)
    console.log('✅ Schema validation passed!')
    
    return true
  } catch (error) {
    console.error('❌ Content analysis schema test failed:', error.message)
    return false
  }
}

async function main() {
  console.log('🧪 Testing Zod schemas for Reddit scraper...\n')
  
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY environment variable is required')
    process.exit(1)
  }
  
  const videoTest = await testVideoAnalysisSchema()
  const contentTest = await testContentAnalysisSchema()
  
  if (videoTest && contentTest) {
    console.log('\n🎉 All Zod schema tests passed! The structured output should work correctly now.')
  } else {
    console.log('\n💥 Some tests failed. Please check the error messages above.')
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { testVideoAnalysisSchema, testContentAnalysisSchema }
