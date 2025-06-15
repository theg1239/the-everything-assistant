# Reddit Knowledge Base System

## Overview

The Reddit Knowledge Base system provides AI-powered search and responses based on scraped Reddit content from educational subreddits (primarily r/Vit). It combines continuous web scraping, vector embeddings, and RAG (Retrieval-Augmented Generation) to deliver intelligent responses to user queries.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main App      │───▶│   Reddit API    │───▶│  Knowledge DB   │
│   (tools.ts)    │    │  (api-server)   │    │  (PostgreSQL)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         └──────────────▶│   RAG Service   │◀─────────────┘
                        │ (Gemini AI)     │
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Vector Search + │
                        │ Text Fallback   │
                        └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Reddit Scraper  │
                        │ + Image Analysis│
                        └─────────────────┘
```

### Data Flow
1. **User Query** → Main App (tools.ts)
2. **API Request** → Reddit API Server (port 3002)
3. **Search Query** → RAG Service
4. **Vector/Text Search** → Knowledge Database
5. **AI Response** → Generated using Gemini AI
6. **Formatted Response** → Returned to user with sources

### Key Components
- **Main App**: Frontend integration via tools.ts
- **Reddit API**: RESTful API server with multiple endpoints
- **RAG Service**: AI-powered response generation
- **Knowledge DB**: PostgreSQL with vector embeddings
- **Scraper**: Continuous data collection with image analysis

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                         │
│                     (Main App Frontend)                         │
└─────────────────────────┬────────────────────────────────────────┘
                          │ searchRedditKnowledge()
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      API LAYER (Port 3002)                      │
├──────────────────────────────────────────────────────────────────┤
│  GET  /health         │  POST /api/ask     │  GET  /api/stats    │
│  POST /api/search     │  GET  /api/trending                     │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     RAG SERVICE LAYER                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Query Analysis  │  │ Context Builder │  │ Response Gen.   │  │
│  │                 │  │                 │  │ (Gemini AI)     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE BASE LAYER                         │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Vector Search   │  │ Text Search     │  │ Embedding Gen.  │  │
│  │ (Similarity)    │  │ (Fallback)      │  │ (768-dim)       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                               │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Reddit Posts    │  │ Comments        │  │ Knowledge       │  │
│  │ ( n posts)      │  │ (  n comments)  │  │ Chunks          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│             PostgreSQL + pgvector (768-dim embeddings)          │
└─────────────────────────┬────────────────────────────────────────┘
                          ▲
                          │ Data Ingestion
┌──────────────────────────────────────────────────────────────────┐
│                     SCRAPER LAYER                               │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Reddit Scraper  │  │ Image Analyzer  │  │ Content Proc.   │  │
│  │ (Pagination)    │  │ (Gemini Vision) │  │ (Embeddings)    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│               Continuous scraping every 6 hours                 │
└──────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Reddit Scraper (`reddit-scraper.js`)
- **Continuous pagination**: Fetches multiple pages of posts (not just first 25)
- **Image analysis**: Uses Google Gemini Vision to analyze image posts
- **Content extraction**: Extracts text, images, metadata, and comments
- **Smart scheduling**: Configurable scraping intervals
- **Vector embeddings**: Generates 768-dimensional embeddings for all content

**Key Features:**
- Fetches posts across multiple pages using Reddit's "after" tokens
- Downloads and analyzes images with AI (OCR, description, educational content)
- Stores comprehensive metadata (scores, upvotes, timestamps, etc.)
- Handles rate limiting and session management

### 2. Knowledge Base (`knowledge-base.js`)
- **Vector search**: Primary search using cosine similarity on embeddings
- **Text fallback**: Full-text search when vector search yields no results
- **Multiple data types**: Posts, comments, and knowledge chunks
- **Smart thresholds**: Configurable similarity thresholds (default: 0.5)

**Database Schema:**
```sql
reddit_posts (
  id, reddit_id, subreddit, title, content, author,
  created_utc, upvotes, downvotes, score, num_comments,
  url, permalink, post_type, images (JSONB),
  embedding vector(768), extracted_text, tags
)

reddit_comments (
  id, reddit_id, post_reddit_id, subreddit, content,
  author, created_utc, score, upvotes, downvotes,
  parent_id, depth, embedding vector(768), tags
)
```

### 3. RAG Service (`rag-service.js`)
- **AI-powered responses**: Uses Google Gemini to generate intelligent answers
- **Context building**: Combines multiple search results into coherent context
- **Confidence scoring**: Calculates confidence based on similarity and community validation
- **Fallback strategies**: Tries keyword search if no vector results found

### 4. API Server (`api-server.js`)
- **RESTful endpoints**: Clean API for frontend integration
- **Error handling**: Graceful degradation and informative error messages
- **CORS enabled**: Ready for frontend consumption

**Endpoints:**
- `GET /health` - Health check
- `POST /api/search` - Raw search results
- `POST /api/ask` - RAG-powered Q&A (recommended)
- `GET /api/stats` - Database statistics
- `GET /api/trending` - Trending topics

### 5. Image Analysis (`image-analyzer.js`)
- **Google Gemini Vision**: Analyzes images for educational content
- **OCR capabilities**: Extracts text from images
- **Educational focus**: Identifies key concepts, subject areas
- **Accessibility**: Generates alt-text for images

## Usage

### For Users (via Frontend)
Users can ask natural language questions about VIT, and the system will:
1. Search the knowledge base using vector similarity
2. Generate AI-powered responses based on Reddit discussions
3. Provide source citations and confidence scores
4. Fall back to keyword search if needed

**Example queries:**
- "How is hostel life at VIT Vellore?"
- "What's the placement scenario like?"
- "How's the mess food quality?"
- "VIT Vellore vs VIT Chennai comparison"

### For Developers

#### Frontend Integration
```typescript
// In tools.ts - the tool is already integrated
const result = await searchRedditKnowledge(query)
// Returns: { success, response, sources, confidence, totalResults }
```

#### Direct API Usage
```javascript
// RAG-powered response (recommended)
const response = await fetch('http://localhost:3002/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'hostel life VIT' })
})

// Raw search results
const searchResponse = await fetch('http://localhost:3002/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'hostel life VIT', limit: 10 })
})
```

## Configuration

### Environment Variables (`.env`)
```env
DATABASE_URL=postgres://...
PORT=3002
NODE_ENV=development

TARGET_SUBREDDITS=Vit
SCRAPE_INTERVAL_HOURS=6
MAX_POSTS_PER_SUBREDDIT=100
MAX_PAGES_PER_SUBREDDIT=10
MIN_UPVOTES_THRESHOLD=5

IMAGE_ANALYSIS_ENABLED=true
SIMILARITY_THRESHOLD=0.5
MAX_CONTEXT_LENGTH=4000

GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

### Key Settings
- **SIMILARITY_THRESHOLD=0.5**: Lower = more results, higher = more precise
- **MAX_PAGES_PER_SUBREDDIT=10**: Controls how many pages to scrape
- **IMAGE_ANALYSIS_ENABLED=true**: Enable/disable AI image analysis
- **SCRAPE_INTERVAL_HOURS=6**: How often to scrape for new content

## Performance & Scale

### Current Capacity
- **64 posts, 528 comments** in database
- **100% embedded content** (all posts have vector embeddings)
- **Average response time**: ~1-3 seconds for RAG responses
- **Search performance**: ~500-1000ms for vector search

### Optimization Features
- **Vector indexing**: PostgreSQL pgvector extension with HNSW indexes
- **Text search fallback**: Full-text search with ranking when vector search fails
- **Caching ready**: Architecture supports Redis caching (configured but not required)
- **Pagination**: Efficient query pagination for large result sets

## Data Quality

### Content Validation
- **Community scores**: Uses Reddit upvotes/downvotes for relevance
- **Similarity ranking**: Vector embeddings ensure semantic relevance
- **Multi-source**: Combines posts, comments, and extracted knowledge chunks
- **Recency weighting**: Recent content gets slight preference

### AI-Generated Enhancements
- **Image descriptions**: Gemini Vision provides detailed image analysis
- **Educational extraction**: Identifies key concepts and subject areas
- **Text enhancement**: AI-generated summaries and tags
- **OCR integration**: Text extraction from screenshots and documents

## Monitoring & Maintenance

### Available Commands
```bash
# Start the API server
node api-server.js

# Run manual scraping
node cli.js scrape

# Check system status
node cli.js status

# View database stats
node cli.js stats

# Test the system
node test-integration.js
```

### Health Monitoring
- **API health endpoint**: `GET /health`
- **Database stats**: `GET /api/stats`
- **Search query logging**: All searches logged with performance metrics
- **Error tracking**: Comprehensive error logging and reporting

## Future Enhancements

### Planned Features
1. **Multiple subreddits**: Expand beyond r/Vit to other educational communities
2. **Real-time updates**: WebSocket integration for live content updates
3. **User feedback**: Allow users to rate response quality
4. **Advanced filtering**: Filter by date, score, subreddit, etc.
5. **Caching layer**: Redis caching for frequently accessed content
6. **Analytics dashboard**: Usage statistics and content insights

### Scalability Improvements
1. **Horizontal scaling**: Support for multiple scraper instances
2. **Database sharding**: Partition data by subreddit or date
3. **CDN integration**: Cache static content and images
4. **Rate limiting**: Advanced rate limiting and quota management

## Contributing

### Adding New Features
1. Update the appropriate service (scraper, knowledge-base, or rag-service)
2. Add corresponding API endpoints if needed
3. Update the frontend tool integration
4. Add tests and documentation

### Data Sources
To add new subreddits:
1. Update `TARGET_SUBREDDITS` in `.env`
2. Run `node cli.js scrape` to fetch new content
3. Monitor logs for any scraping issues
4. Update any subreddit-specific logic if needed

---