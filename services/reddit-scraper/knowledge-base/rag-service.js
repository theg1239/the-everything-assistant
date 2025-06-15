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
    const source = `[${result.type.toUpperCase()}] r/${result.subreddit}`;
    const score = result.upvotes ? `(Score: ${result.score}, Upvotes: ${result.upvotes})` : '';
    const author = result.author ? `by u/${result.author}` : '';
    
    let content = '';
    if (result.type === 'post') {
      content = `Title: ${result.title}\nContent: ${result.content || 'No text content'}`;
    } else {
      content = result.content;
    }
    
    return `${source} ${author} ${score}
${content}
---`;
  }  async generateAIResponse(query, context, conversationHistory, isFallback = false) {
    const systemPrompt = isFallback 
      ? `You are an intelligent assistant that helps students by providing information from Reddit discussions. You have access to a knowledge base of Reddit posts and comments from academic and student-focused subreddits.

The search results below are from a broader keyword search since no direct matches were found for the user's query. Please be honest about this limitation while still being helpful.

Your task is to:
1. Answer the user's question using the provided context from Reddit, noting that these are broader results
2. Be helpful and honest about the limited relevance of the results
3. Consider upvotes/downvotes as indicators of community validation
4. Mention different perspectives if they exist in the data
5. Suggest alternative search terms or topics that might yield better results
6. Focus on being helpful for students and academic purposes

Context from Reddit (broader keyword search):
${context}`
      : `You are an intelligent assistant that helps students by providing information from Reddit discussions. You have access to a knowledge base of Reddit posts and comments from academic and student-focused subreddits.

Your task is to:
1. Answer the user's question using the provided context from Reddit
2. Be helpful, accurate, and cite sources when possible
3. Consider upvotes/downvotes as indicators of community validation
4. Mention different perspectives if they exist in the data
5. Be honest if the information is limited or contradictory
6. Focus on being helpful for students and academic purposes

Context from Reddit:
${context}`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history
    conversationHistory.forEach(msg => {
      messages.push(msg);
    });

    // Add current query
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
