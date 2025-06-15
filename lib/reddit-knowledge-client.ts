export interface RedditSearchResult {
  type: 'post' | 'comment' | 'chunk'
  reddit_id: string
  subreddit: string
  title: string
  content: string
  author?: string
  score: number
  upvotes: number
  similarity: number
  url?: string
  created_utc: string
  tags: string[]
}

export interface RedditSearchResponse {
  results: RedditSearchResult[]
  totalResults: number
  statistics: {
    averageSimilarity: number
    averageScore: number
    subreddits: string[]
  }
}

export interface RedditKnowledgeStats {
  total_subreddits: number
  total_posts: number
  total_comments: number
  total_chunks: number
  avg_post_score: number
  latest_post: string
}

export interface SubredditStats {
  id: number
  subreddit: string
  total_posts: number
  total_comments: number
  avg_score: number
  last_scraped: string
  active: boolean
}

class RedditKnowledgeClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string = 'http://localhost:3001', timeout: number = 30000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  async search(query: string, limit: number = 10): Promise<RedditSearchResponse> {
    const response = await this.makeRequest('/search', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    })

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return {
      results: data.results || [],
      totalResults: data.results?.length || 0,
      statistics: {
        averageSimilarity: this.calculateAverageSimilarity(data.results || []),
        averageScore: this.calculateAverageScore(data.results || []),
        subreddits: this.extractUniqueSubreddits(data.results || []),
      },
    }
  }

  async getStatistics(): Promise<RedditKnowledgeStats> {
    const response = await this.makeRequest('/stats')
    
    if (!response.ok) {
      throw new Error(`Stats request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getSubredditStats(): Promise<SubredditStats[]> {
    const response = await this.makeRequest('/subreddits')
    
    if (!response.ok) {
      throw new Error(`Subreddit stats request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async triggerScrape(subreddit?: string): Promise<{ message: string }> {
    const body = subreddit ? JSON.stringify({ subreddit }) : undefined
    const response = await this.makeRequest('/scrape', {
      method: 'POST',
      body,
    })

    if (!response.ok) {
      throw new Error(`Scrape request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.makeRequest('/health')
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`)
      }
      throw error
    }
  }

  private calculateAverageSimilarity(results: RedditSearchResult[]): number {
    if (results.length === 0) return 0
    const sum = results.reduce((acc, result) => acc + (result.similarity || 0), 0)
    return Math.round((sum / results.length) * 100) / 100
  }

  private calculateAverageScore(results: RedditSearchResult[]): number {
    if (results.length === 0) return 0
    const sum = results.reduce((acc, result) => acc + (result.score || 0), 0)
    return Math.round(sum / results.length)
  }

  private extractUniqueSubreddits(results: RedditSearchResult[]): string[] {
    return [...new Set(results.map(result => result.subreddit))]
  }
}

export const redditKnowledgeClient = new RedditKnowledgeClient()

export async function searchStudentTopics(topic: string, limit: number = 10): Promise<RedditSearchResult[]> {
  const enhancedQuery = `student college university academic ${topic}`
  const response = await redditKnowledgeClient.search(enhancedQuery, limit)
  return response.results
}

export async function searchStudyAdvice(subject: string, limit: number = 10): Promise<RedditSearchResult[]> {
  const enhancedQuery = `study tips advice exam preparation ${subject}`
  const response = await redditKnowledgeClient.search(enhancedQuery, limit)
  return response.results
}

export async function searchCareerAdvice(field: string, limit: number = 10): Promise<RedditSearchResult[]> {
  const enhancedQuery = `career advice job internship ${field}`
  const response = await redditKnowledgeClient.search(enhancedQuery, limit)
  return response.results
}

export async function searchCollegeLife(topic: string, limit: number = 10): Promise<RedditSearchResult[]> {
  const enhancedQuery = `college life university experience ${topic}`
  const response = await redditKnowledgeClient.search(enhancedQuery, limit)
  return response.results
}

export function formatSearchResultsForChat(results: RedditSearchResult[]): string {
  if (results.length === 0) {
    return "I couldn't find any relevant information in the Reddit knowledge base for your query."
  }

  let formatted = `Found ${results.length} relevant discussions from Reddit educational communities:\n\n`

  results.slice(0, 5).forEach((result, index) => {
    const source = `r/${result.subreddit}`
    const author = result.author ? `by u/${result.author}` : ''
    const score = `(${result.score} points, ${result.upvotes} upvotes)`
    const relevance = `${Math.round(result.similarity * 100)}% relevant`
    
    formatted += `**${index + 1}. ${result.title}** ${relevance}\n`
    formatted += `📍 ${source} ${author} ${score}\n`
    
    const content = result.content.length > 200 
      ? result.content.substring(0, 200) + '...'
      : result.content
    formatted += `💭 ${content}\n`
    
    if (result.url) {
      formatted += `🔗 [View on Reddit](${result.url})\n`
    }
    
    formatted += '\n'
  })

  if (results.length > 5) {
    formatted += `... and ${results.length - 5} more results`
  }

  return formatted
}

export default redditKnowledgeClient
