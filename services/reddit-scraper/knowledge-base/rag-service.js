const KnowledgeBase = require('./knowledge-base');
const { generateText } = require('ai');
const { google } = require('@ai-sdk/google');
const logger = require('../utils/logger');

class RAGService {
  constructor() {
    this.knowledgeBase = new KnowledgeBase();
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 4000;
    this.chatModel = google('gemini-2.0-flash');
  }
  async generateResponse(query, conversationHistory = []) {
    try {
      logger.info(`Generating RAG response for query: "${query}"`);
      
      const searchResults = await this.knowledgeBase.search(query, 15);
      
      if (searchResults.length === 0) {
        logger.info('No direct results found, trying broader search...');
        
        const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        let fallbackResults = [];
        
        for (const keyword of keywords.slice(0, 3)) {
          const keywordResults = await this.knowledgeBase.search(keyword, 5);
          fallbackResults = fallbackResults.concat(keywordResults);
          if (fallbackResults.length >= 10) break;
        }
        
        const uniqueResults = [];
        const seenIds = new Set();
        for (const result of fallbackResults) {
          if (!seenIds.has(result.reddit_id)) {
            seenIds.add(result.reddit_id);
            uniqueResults.push(result);
          }
        }
        
        if (uniqueResults.length === 0) {
          return {
            response: "I couldn't find any relevant information in the Reddit knowledge base for your query. The database contains discussions from r/Vit, but nothing closely matches your search terms. Try rephrasing your question or asking about more general VIT topics.",
            sources: [],
            confidence: 0,
            searchResults: 0
          };
        }
        
        const context = this.buildContext(uniqueResults);
        const response = await this.generateAIResponse(query, context, conversationHistory, true);
        
        return {
          response: response,
          sources: this.formatSources(uniqueResults.slice(0, 5)),
          confidence: this.calculateConfidence(uniqueResults) * 0.7,
          searchResults: uniqueResults.length,
          note: "Results found using broader keyword search"
        };
      }

      const context = this.buildContext(searchResults);
      const response = await this.generateAIResponse(query, context, conversationHistory);
      
      return {
        response: response,
        sources: this.formatSources(searchResults.slice(0, 5)),
        confidence: this.calculateConfidence(searchResults),
        searchResults: searchResults.length
      };
    } catch (error) {
      logger.error('Error generating RAG response:', error);
      return {
        response: "I apologize, but I encountered an error while searching the knowledge base. Please try again with a different query.",
        sources: [],
        confidence: 0,
        error: error.message
      };
    }
  }

  buildContext(searchResults) {
    let context = '';
    let currentLength = 0;
    
    for (const result of searchResults) {
      const snippet = this.formatResultForContext(result);
      
      if (currentLength + snippet.length > this.maxContextLength) {
        break;
      }
      
      context += snippet + '\n\n';
      currentLength += snippet.length;
    }
    
    return context.trim();
  }
  formatResultForContext(result) {
    const sourceType = result.type.toUpperCase();
    const subreddit = `r/${result.subreddit}`;
    const author = result.author ? `u/${result.author}` : 'Unknown';
    const upvotes = result.upvotes || 0;
    const score = result.score || 0;
    
    const engagement = upvotes > 0 ? `↑${upvotes} upvotes` : `${score} points`;
    
    let content = '';
    if (result.type === 'post') {
      content = `POST TITLE: ${result.title}\nPOST CONTENT: ${result.content || '[No text content - possibly image/link post]'}`;
    } else if (result.type === 'comment') {
      content = `COMMENT: ${result.content}`;
    } else {
      content = `CONTENT: ${result.content}`;
    }
    
    return `[${sourceType}] ${subreddit} | ${author} | ${engagement}
${content}
---`;
  }async generateAIResponse(query, context, conversationHistory, isFallback = false) {
    const systemPrompt = isFallback 
      ? `You are an intelligent assistant specializing in student life and academic information. You help students by analyzing Reddit discussions from educational communities.

IMPORTANT: The search results below are from a broader keyword search since no direct matches were found for the user's query. Be transparent about this limitation.

RESPONSE GUIDELINES:
1. Structure: Use clear bullet points and organize information logically
2. Transparency: Acknowledge when information is limited or from broader search
3. Context: Always mention the source username and upvote count when citing information
4. Validation: Prioritize information from highly-upvoted posts/comments
5. Helpfulness: Suggest more specific search terms if current results are limited
6. Student Focus: Frame answers in context of student needs and concerns
7. Do not use asterisks for emphasis, use bullet points instead 

FORMAT YOUR RESPONSE AS:
- Start with a brief summary of what you found
- Use bullet points with clear categories (e.g., Academics, Campus Life, Facilities)
- Include usernames and scores: (u/username, ↑XX upvotes)
- End with suggestions for better search terms if results are limited

Context from Reddit (broader keyword search):
${context}`
      : `You are an intelligent assistant specializing in student life and academic information. You help students by analyzing Reddit discussions from educational communities.

RESPONSE GUIDELINES:
1. Structure: Use clear bullet points and organize information by topic
2. Attribution: Always cite usernames and upvote counts for credibility
3. Balance: Present multiple perspectives when available
4. Validation: Emphasize information from highly-upvoted comments (community validated)
5. Completeness: Address all aspects of the user's question when possible
6. Student Context: Frame everything in terms of practical student needs

FORMAT YOUR RESPONSE AS:
- Start with a direct answer to the user's question
- Use clear categories with bullet points (e.g., Academics, Campus Life, Facilities, Student Experience)
- Include source attribution: (u/username, ↑XX upvotes, XX points)
- Highlight conflicting opinions or varying experiences
- Conclude with practical advice or key takeaways

CITATION FORMAT: When mentioning information, use this format:
- For posts: "According to u/username (↑XX upvotes)..."
- For comments: "One student mentioned (u/username, ↑XX upvotes)..."
- For high-engagement content: "A highly-upvoted comment by u/username (↑XX upvotes)..."

Context from Reddit:
${context}`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    conversationHistory.forEach(msg => {
      messages.push(msg);
    });

    messages.push({
      role: 'user',
      content: query
    });

    try {
      const result = await generateText({
        model: this.chatModel,
        messages: messages,
        maxTokens: 1000,
        temperature: 0.7
      });

      return result.text;
    } catch (error) {
      logger.error('Error generating AI response:', error);
      return 'I apologize, but I encountered an error while generating a response. Please try again.';
    }
  }

  formatSources(searchResults) {
    return searchResults.map(result => ({
      type: result.type,
      subreddit: result.subreddit,
      title: result.title,
      author: result.author,
      score: result.score,
      upvotes: result.upvotes,
      url: result.url,
      similarity: result.similarity,
      created: result.created_utc
    }));
  }

  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0;
    
    // Calculate confidence based on:
    // 1. Number of results
    // 2. Average similarity score
    // 3. Average upvotes/score
    
    const avgSimilarity = searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length;
    const avgScore = searchResults.reduce((sum, r) => sum + (r.score || 0), 0) / searchResults.length;
    const resultsCount = Math.min(searchResults.length, 10) / 10;
    
    const confidence = (avgSimilarity * 0.5) + (Math.min(avgScore / 10, 1) * 0.3) + (resultsCount * 0.2);
    
    return Math.round(confidence * 100);
  }

  async getRecommendations(query, limit = 5) {
    try {
      const searchResults = await this.knowledgeBase.search(query, limit * 2);
      
      const recommendations = searchResults
        .filter(result => result.similarity > 0.7)
        .slice(0, limit)
        .map(result => ({
          title: result.title,
          subreddit: result.subreddit,
          type: result.type,
          score: result.score,
          url: result.url,
          snippet: this.generateSnippet(result.content),
          relevance: result.similarity
        }));
      
      return recommendations;
    } catch (error) {
      logger.error('Error getting recommendations:', error);
      return [];
    }
  }

  generateSnippet(content, maxLength = 200) {
    if (!content) return '';
    
    if (content.length <= maxLength) {
      return content;
    }
    
    const sentences = content.split('. ');
    let snippet = '';
    
    for (const sentence of sentences) {
      if (snippet.length + sentence.length + 2 <= maxLength) {
        snippet += (snippet ? '. ' : '') + sentence;
      } else {
        break;
      }
    }
    
    return snippet + (snippet.length < content.length ? '...' : '');
  }
}

module.exports = RAGService;
