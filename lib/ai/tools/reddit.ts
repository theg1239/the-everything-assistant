import { tool } from 'ai'
import * as z from 'zod'

import type { JsonValue } from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

const redditAskResponseSchema = z.object({
  success: z.boolean(),
  response: z.string().optional(),
  sources: z.array(jsonValueSchema).optional(),
  confidence: z.number().optional(),
  totalResults: z.number().optional(),
  searchResults: z.number().optional(),
  searchAttempts: z.union([z.number(), z.array(z.number())]).optional(),
  refinedQueries: z.array(z.string()).optional(),
  serviceUsed: z.string().optional(),
  error: z.string().optional(),
})

const redditRawResponseSchema = z.object({
  results: z.array(jsonValueSchema).optional(),
})

const redditTrendingResponseSchema = z.object({
  trending: z.array(z.string()).optional(),
})

const redditStatsResponseSchema = z.object({
  stats: z.record(z.string(), z.number().optional()).optional(),
})

async function searchRedditKnowledge(query: string, limit: number = 10) {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Reddit knowledge base service unavailable: ${response.status}`)
    }

    const data = redditAskResponseSchema.parse(await response.json())
    if (data.success) {
      const attempts = Array.isArray(data.searchAttempts)
        ? data.searchAttempts.length
        : data.searchAttempts || 1

      return {
        success: true,
        response: data.response,
        sources: data.sources || [],
        confidence: data.confidence || 0,
        totalResults: data.searchResults || 0,
        searchAttempts: attempts,
        refinedQueries: data.refinedQueries || [],
        serviceUsed: data.serviceUsed || 'agentic',
      }
    }

    return {
      success: false,
      message: data.error || 'Unknown error occurred',
      totalResults: 0,
      searchAttempts: 0,
      refinedQueries: [],
      serviceUsed: 'unknown',
    }
  } catch (error) {
    console.error('Error accessing Reddit knowledge base:', error)
    return {
      success: false,
      message: 'Reddit knowledge base service is currently unavailable. Please try again later.',
      totalResults: 0,
      searchAttempts: 0,
      refinedQueries: [],
      serviceUsed: 'unknown',
    }
  }
}

async function searchRedditRaw(query: string, limit: number = 10) {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    })

    if (!response.ok) {
      throw new Error(`Reddit knowledge base service unavailable: ${response.status}`)
    }

    const data = redditRawResponseSchema.parse(await response.json())
    return data.results || []
  } catch (error) {
    console.error('Error accessing Reddit knowledge base:', error)
    return []
  }
}

async function getTrendingRedditTopics() {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/trending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Reddit trending service unavailable: ${response.status}`)
    }

    const data = redditTrendingResponseSchema.parse(await response.json())
    return data.trending || []
  } catch (error) {
    console.error('Error accessing Reddit trending:', error)
    return []
  }
}

export async function searchRedditWithContext(query: string) {
  try {
    const broadQueryKeywords = [
      "what's happening",
      'what is happening',
      'currently',
      'current',
      'trending',
      'recent',
      'latest',
      'now',
      'today',
      'active',
      'popular',
      'hot topics',
      'hot',
      'discussions',
      'activity',
      'updates',
      'news',
      'look up reddit',
      'check reddit',
      'reddit overview',
      'happening on reddit',
      'reddit activity',
      'tell me about',
      'overview',
      'summary',
      'whats going on',
      "what's going on",
    ]

    const isBroadQuery =
      broadQueryKeywords.some(keyword => query.toLowerCase().includes(keyword.toLowerCase())) ||
      (query.toLowerCase().includes('reddit') &&
        (query.toLowerCase().includes('current') ||
          query.toLowerCase().includes('happening') ||
          query.toLowerCase().includes('trending') ||
          query.toLowerCase().includes('latest') ||
          query.toLowerCase().includes('now') ||
          query.toLowerCase().includes('today')))

    if (isBroadQuery) {
      const [trendingTopics, searchResults] = await Promise.all([
        getTrendingRedditTopics(),
        searchRedditKnowledge(query),
      ])

      return {
        success: true,
        response:
          searchResults.response ||
          'Here are the current trending topics and recent discussions from Reddit.',
        sources: searchResults.sources,
        trending: trendingTopics,
        confidence: searchResults.confidence,
        totalResults: searchResults.totalResults,
        isBroadQuery: true,
        message: `Found recent VIT discussions and ${trendingTopics.length} trending topics`,
      }
    }

    return await searchRedditKnowledge(query)
  } catch (error: any) {
    console.error('Error in contextual Reddit search:', error)
    return {
      success: false,
      error: error?.message || 'Failed to search Reddit',
      message: 'Unable to access Reddit knowledge base',
    }
  }
}

export function redditTools() {
  const searchRedditKnowledgeTool = tool({
    description:
      'Search the Reddit knowledge base for student and academic information from various educational subreddits. This provides AI-powered responses based on community-validated information from students about studying, courses, exams, college life, and academic advice.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The search query for finding relevant information from Reddit discussions about academics, studying, college life, etc.'
        ),
    }),
    execute: async ({ query }) => {
      try {
        const results = await searchRedditKnowledge(query)

        return {
          success: results.success,
          response: results.response,
          sources: results.sources || [],
          confidence: results.confidence || 0,
          totalResults: results.totalResults || 0,
          searchAttempts: results.searchAttempts || 1,
          refinedQueries: results.refinedQueries || [],
          serviceUsed: results.serviceUsed || 'agentic',
          message: results.success
            ? `Found ${results.totalResults} relevant discussions using ${results.searchAttempts} search attempt${results.searchAttempts > 1 ? 's' : ''}`
            : results.message,
          note: results.success
            ? 'Response based on Reddit discussions. Might be inaccurate.'
            : 'Unable to find relevant information in the Reddit knowledge base.',
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to search Reddit knowledge base',
          message: 'Unable to access the Reddit knowledge base. The service may be temporarily unavailable.',
          suggestion: 'Please try again later or check if the Reddit scraper service is running.',
        }
      }
    },
  })

  const searchRedditWithContextTool = tool({
    description:
      'Search Reddit with enhanced capabilities to handle trending topics and broader queries about current events, popular discussions, and more. This combines trending topic retrieval with the knowledge base search for comprehensive results.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The search query for finding relevant information from Reddit discussions, or broad queries about current trends and popular topics.'
        ),
    }),
    execute: async ({ query }) => {
      try {
        const results = await searchRedditWithContext(query)

        return {
          success: results.success,
          response: results.response,
          sources: results.sources || [],
          trending: (results as any).trending || [],
          confidence: results.confidence || 0,
          totalResults: results.totalResults || 0,
          isBroadQuery: (results as any).isBroadQuery || false,
          message: results.success
            ? `Found ${results.totalResults} relevant discussions${(results as any).trending?.length ? ` and ${(results as any).trending.length} trending topics` : ''}`
            : results.message,
          note: results.success
            ? 'Response includes trending topics and recent discussions. Higher confidence indicates more relevant source material.'
            : 'Unable to find relevant information in the Reddit knowledge base.',
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to search Reddit',
          message: 'Unable to access Reddit. The service may be temporarily unavailable.',
          suggestion: 'Please try again later or check if the Reddit scraper service is running.',
        }
      }
    },
  })

  const getRedditOverview = tool({
    description:
      'Get an overview of Reddit activity and trending topics. This provides insights into popular discussions, recent trends, and overall Reddit activity related to VIT and other educational topics.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const overview = await (async () => {
          try {
            const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
            const [trendingResponse, statsResponse] = await Promise.all([
              fetch(`${apiUrl}/api/trending`),
              fetch(`${apiUrl}/api/stats`),
            ])

            const trending = trendingResponse.ok
              ? redditTrendingResponseSchema.parse(await trendingResponse.json()).trending || []
              : []
            const stats = statsResponse.ok
              ? redditStatsResponseSchema.parse(await statsResponse.json()).stats || {}
              : {}

            return {
              success: true,
              trending,
              stats,
              summary: `Currently tracking ${stats.totalPosts || 0} posts and ${stats.totalComments || 0} comments from VIT community discussions.`,
            }
          } catch (error) {
            console.error('Error getting Reddit overview:', error)
            return {
              success: false,
              error: 'Unable to fetch Reddit overview',
            }
          }
        })()

        return {
          success: overview.success,
          trending: overview.trending || [],
          stats: overview.stats || {},
          summary: overview.summary || '',
          message: overview.success ? 'Successfully retrieved Reddit overview data' : overview.error,
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to get Reddit overview',
          message: 'Unable to access Reddit overview. The service may be temporarily unavailable.',
          suggestion: 'Please try again later or check if the Reddit scraper service is running.',
        }
      }
    },
  })

  return {
    searchRedditKnowledge: searchRedditKnowledgeTool,
    searchRedditWithContext: searchRedditWithContextTool,
    getRedditOverview,
  }
}

export type RedditTools = ReturnType<typeof redditTools>
