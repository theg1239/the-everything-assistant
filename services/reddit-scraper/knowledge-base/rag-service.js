const KnowledgeBase = require('./knowledge-base');
const { generateText } = require('ai');
const { google } = require('@ai-sdk/google');
const logger = require('../utils/logger');

class RAGService {
  constructor() {
    this.knowledgeBase = new KnowledgeBase();
    this.maxContextLength = parseInt(process.env.MAX_CONTEXT_LENGTH) || 4000;
    this.chatModel = google('gemini-2.0-flash');
  }  async generateResponse(query, conversationHistory = []) {
    try {
      logger.info(`Generating RAG response for query: "${query}"`);
      
      const searchResults = await this.knowledgeBase.search(query, 40);
      
      if (searchResults.length === 0) {
        logger.info('No direct results found, trying broader search...');
        
        const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        let fallbackResults = [];
        
        for (const keyword of keywords.slice(0, 5)) {
          const keywordResults = await this.knowledgeBase.search(keyword, 20);
          fallbackResults = fallbackResults.concat(keywordResults);
        }
        
        const topicKeywords = this.extractTopicKeywords(query);
        for (const topic of topicKeywords) {
          const topicResults = await this.knowledgeBase.search(topic, 10);
          fallbackResults = fallbackResults.concat(topicResults);
        }
        
        // Diversify results by ensuring we get different types and sources
        const diverseResults = this.diversifyResults(fallbackResults);
        
        if (diverseResults.length === 0) {
          return {
            response: "I couldn't find any relevant information in the Reddit knowledge base for your query. The database contains discussions from r/Vit, but nothing closely matches your search terms. Try rephrasing your question or asking about more general VIT topics.",
            sources: [],
            confidence: 0,
            searchResults: 0
          };
        }
        
        const context = this.buildContext(diverseResults);
        const response = await this.generateAIResponse(query, context, conversationHistory, true);
        
        return {
          response: response,
          sources: this.formatSources(diverseResults.slice(0, 8)),
          confidence: this.calculateConfidence(diverseResults) * 0.7,
          searchResults: diverseResults.length,
          note: "Results found using broader keyword search"
        };
      }

      const diverseResults = this.diversifyResults(searchResults);
      
      if (diverseResults.length < 5) {
        logger.info('Not enough diverse results, expanding search...');
        const keywords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        let expandedResults = [...searchResults];
        
        for (const keyword of keywords.slice(0, 3)) {
          const keywordResults = await this.knowledgeBase.search(keyword, 15);
          expandedResults = expandedResults.concat(keywordResults);
        }
        
        const expandedDiverse = this.diversifyResults(expandedResults);
        if (expandedDiverse.length > diverseResults.length) {
          const context = this.buildContext(expandedDiverse);
          const response = await this.generateAIResponse(query, context, conversationHistory);
          
          return {
            response: response,
            sources: this.formatSources(expandedDiverse.slice(0, 8)),
            confidence: this.calculateConfidence(expandedDiverse) * 0.9,
            searchResults: expandedDiverse.length
          };
        }
      }
      
      const context = this.buildContext(diverseResults);
      const response = await this.generateAIResponse(query, context, conversationHistory);
      
      return {
        response: response,
        sources: this.formatSources(diverseResults.slice(0, 8)),
        confidence: this.calculateConfidence(diverseResults),
        searchResults: diverseResults.length
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

  extractTopicKeywords(query) {
    const topicMap = {
      'library': ['study', 'books', 'reading', 'research', 'academic'],
      'hostel': ['accommodation', 'room', 'warden', 'mess', 'facilities'],
      'food': ['mess', 'dining', 'menu', 'cafeteria', 'canteen'],
      'faculty': ['professor', 'teacher', 'staff', 'instructor'],
      'placement': ['job', 'career', 'interview', 'company', 'recruitment'],
      'exam': ['test', 'assessment', 'marks', 'grade', 'evaluation'],
      'club': ['activity', 'event', 'society', 'organization'],
      'campus': ['infrastructure', 'building', 'facility', 'location']
    };
    
    const queryLower = query.toLowerCase();
    const topics = [];
    
    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (queryLower.includes(topic) || keywords.some(keyword => queryLower.includes(keyword))) {
        topics.push(topic);
        topics.push(...keywords.slice(0, 2));
      }
    }
    
    return [...new Set(topics)];
  }  diversifyResults(results) {
    const diverseResults = [];
    const seenIds = new Set();
    const seenContentHashes = new Set();
    const seenTitles = new Set();
    const typeCount = { post: 0, comment: 0, chunk: 0 };
    const subredditCount = {};
    const authorCount = {};
    
    const normalizedResults = results.map(result => ({
      ...result,
      similarity: parseFloat(result.similarity) || 0
    }));
    
    const sortedResults = normalizedResults.sort((a, b) => b.similarity - a.similarity);
    
    for (const result of sortedResults) {
      if (seenIds.has(result.reddit_id)) continue;
      
      const contentHash = this.createContentHash(result.content || result.title || '');
      if (seenContentHashes.has(contentHash)) continue;
      
      if (result.type === 'post' && result.title) {
        const titleKey = result.title.toLowerCase().slice(0, 50);
        if (seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);
      }
      
      if (typeCount[result.type] >= 6) continue;
      
      const subredditKey = result.subreddit || 'unknown';
      if ((subredditCount[subredditKey] || 0) >= 5) continue;
      
      const authorKey = result.author || 'unknown';
      if ((authorCount[authorKey] || 0) >= 2) continue;
      
      diverseResults.push(result);
      seenIds.add(result.reddit_id);
      seenContentHashes.add(contentHash);
      typeCount[result.type]++;
      subredditCount[subredditKey] = (subredditCount[subredditKey] || 0) + 1;
      authorCount[authorKey] = (authorCount[authorKey] || 0) + 1;
      
      if (diverseResults.length >= 15) break;
    }
    
    return diverseResults;
  }

  createContentHash(content) {
    if (!content) return '';
    
    const normalized = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return normalized.slice(0, 100);
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
1. Structure: Use HTML formatting with proper bullet points and sections
2. Transparency: Acknowledge when information is limited or from broader search
3. Context: Always mention the source username and upvote count when citing information
4. Validation: Prioritize information from highly-upvoted posts/comments
5. Helpfulness: Suggest more specific search terms if current results are limited
6. Student Focus: Frame answers in context of student needs and concerns
7. Use HTML formatting: <strong> for emphasis, <ul><li> for bullet points
8. IMPORTANT: Do NOT wrap your response in code blocks

FORMAT YOUR RESPONSE AS HTML:
- Use <strong>Section Headers</strong> for main topics
- Use <ul><li> for bullet points instead of asterisks or dashes
- Include usernames in this format: <span style="color: #0066cc; font-weight: 500;">u/username</span>
- Include upvotes in this format: <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>
- Use <em> for emphasis on important points
- End with suggestions for better search terms if results are limited
- DO NOT wrap your response in code blocks of any kind

Context from Reddit (broader keyword search):
${context}`
      : `You are an intelligent assistant specializing in student life and academic information. You help students by analyzing Reddit discussions from educational communities.

RESPONSE GUIDELINES:
1. Structure: Use HTML formatting with clear sections and bullet points
2. Attribution: Always cite usernames and upvote counts for credibility
3. Balance: Present multiple perspectives when available
4. Validation: Emphasize information from highly-upvoted comments (community validated)
5. Completeness: Address all aspects of the user's question when possible
6. Student Context: Frame everything in terms of practical student needs
7. Use proper HTML formatting throughout
8. IMPORTANT: Do NOT wrap your response in code blocks (no HTML code blocks)

FORMAT YOUR RESPONSE AS HTML:
- Start with a direct answer to the user's question
- Use <strong>Section Headers</strong> for categories (e.g., <strong>Hostel Life</strong>, <strong>Campus Facilities</strong>, <strong>Student Experience</strong>)
- Use <ul><li> for bullet points instead of asterisks or dashes
- Include source attribution in this format: 
  • For usernames: <span style="color: #0066cc; font-weight: 500;">u/username</span>
  • For upvotes: <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>
  • For points: <span style="color: #888; font-size: 0.9em;">XX points</span>
- Use <em> for emphasis on important details
- Conclude with <strong>Practical Advice</strong> or key takeaways
- DO NOT wrap your response in code blocks of any kind

CITATION FORMAT EXAMPLES:
- "According to <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>..."
- "One student mentioned (<span style="color: #0066cc; font-weight: 500;">u/username</span>, <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>)..."
- "A highly-upvoted comment by <span style="color: #0066cc; font-weight: 500;">u/username</span> <span style="color: #ff4500; font-size: 0.9em;">↑XX upvotes</span>..."

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
    });    try {
      const result = await generateText({
        model: this.chatModel,
        messages: messages,
        maxTokens: 1000,
        temperature: 0.7
      });

      const cleanResponse = result.text
        .replace(/```html\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      return cleanResponse;
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
  }  calculateConfidence(searchResults) {
    if (searchResults.length === 0) return 0;
    
    // Calculate confidence based on:
    // 1. Number of results
    // 2. Average similarity score
    // 3. Average upvotes/score
    
    logger.info(`Calculating confidence for ${searchResults.length} results`);
    
    const validResults = searchResults.filter(r => r.similarity !== undefined && r.similarity !== null);
    
    if (validResults.length === 0) {
      logger.warn('No results with valid similarity scores, using baseline confidence');
      const baselineConfidence = Math.min(50, 20 + (searchResults.length * 5)); // 20-50% based on result count
      logger.info(`Baseline confidence: ${baselineConfidence}%`);
      return baselineConfidence;
    }
    
    const similarities = validResults.map(r => parseFloat(r.similarity) || 0);
    const scores = validResults.map(r => parseInt(r.score) || 0);
    
    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const resultsCount = Math.min(validResults.length, 10) / 10;
    
    logger.info(`Avg similarity: ${avgSimilarity}, Avg score: ${avgScore}, Results count factor: ${resultsCount}`);
    
    const normalizedSimilarity = Math.max(0, Math.min(1, avgSimilarity));
    
    const confidence = (normalizedSimilarity * 0.5) + (Math.min(avgScore / 10, 1) * 0.3) + (resultsCount * 0.2);
    
    const finalConfidence = Math.round(Math.max(15, Math.min(100, confidence * 100)));
    logger.info(`Final confidence: ${finalConfidence}%`);
    
    return finalConfidence;
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
