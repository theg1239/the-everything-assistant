# Agentic RAG System

This directory contains an improved **Agentic RAG (Retrieval-Augmented Generation)** system that uses multiple AI agents to intelligently search and refine queries until high-quality, relevant results are found.

## Problem Solved

The original RAG system had several issues:

- **Poor relevance**: Often returned irrelevant results with high confidence scores
- **Fabricated data**: Would make up usernames, upvote counts, and sources
- **Static search**: No ability to improve queries when initial search failed
- **No quality assessment**: Couldn't determine if results actually answered the query

## Agentic RAG Architecture

The new system uses **3 specialized AI agents** that work together:

### 1. Query Relevance Agent

- **Purpose**: Analyzes how well each search result answers the original query
- **Method**: Scores each result from 0.0 to 1.0 for relevance
- **Output**: Relevance scores for filtering and ranking results

### 2. Query Refinement Agent

- **Purpose**: Generates improved search queries when initial results are poor
- **Method**: Analyzes failed searches and creates better queries using:
  - Different keywords and synonyms
  - More specific or general terms as needed
  - Reddit-style language patterns
- **Output**: Refined search queries for subsequent iterations

### 3. Result Quality Agent

- **Purpose**: Assesses overall quality of the result set
- **Method**: Evaluates based on:
  - Number of results found
  - Average upvotes/engagement
  - Content completeness
  - Source diversity
- **Output**: Quality score to determine if search should continue

## How It Works

```
1. Initial Search
   ├── Search with original query
   ├── Query Relevance Agent scores each result
   └── Filter results above relevance threshold

2. Quality Assessment
   ├── Result Quality Agent evaluates result set
   ├── If quality is high (>0.8) and enough results → STOP
   └── If quality is poor → CONTINUE

3. Query Refinement (up to 3 iterations)
   ├── Query Refinement Agent generates better query
   ├── Search with refined query
   ├── Score relevance and assess quality
   └── Keep best results across all iterations

4. Response Generation
   ├── Use highest-quality results found
   ├── Generate response with proper source attribution
   └── Return with search metadata
```

## Key Features

### Recursive Search Improvement

- **Maximum 3 iterations** to find better results
- **Keeps best results** across all search attempts
- **Stops early** when high-quality results are found

### Real Source Attribution

- **No fabricated data** - only uses actual usernames/upvotes from results
- **Transparent search process** - shows refined queries used
- **Confidence based on actual relevance** - not just similarity scores

### Intelligent Query Generation

- **Context-aware refinements** based on what was/wasn't found
- **Domain-specific improvements** using Reddit discussion patterns
- **Fallback strategies** when AI refinement fails

## API Endpoints

### `/api/ask` (Enhanced)

Uses agentic RAG by default:

```json
{
  "query": "nice places to eat at vit",
  "useAgentic": true,
  "conversationHistory": []
}
```

Response includes:

```json
{
  "success": true,
  "response": "HTML formatted response",
  "confidence": 85,
  "searchAttempts": 2,
  "refinedQueries": ["nice places to eat at vit", "vit food restaurants"],
  "sources": [...],
  "serviceUsed": "agentic"
}
```

### `/api/compare` (New)

Compare agentic vs legacy RAG side-by-side:

```json
{
  "query": "your search query"
}
```

## Testing

Run the test script to see the agentic RAG in action:

```bash
node test-agentic.js
```

This will show:

- Search attempts made
- Queries refined
- Relevance scores
- Final confidence and results

## Configuration

Environment variables:

- `MAX_CONTEXT_LENGTH`: Maximum context for AI responses (default: 4000)
- `GOOGLE_GENERATIVE_AI_API_KEY`: Required for AI agents

Agent parameters (in code):

- `maxIterations`: Maximum search refinement attempts (default: 3)
- `relevanceThreshold`: Minimum relevance to keep results (default: 0.6)

## Benefits

### For Users

- **More relevant results** that actually answer their questions
- **Transparent search process** showing how results were found
- **Real source attribution** without fabricated data
- **Better coverage** through query refinement

### For Developers

- **Modular agent design** easy to extend and modify
- **Configurable thresholds** for different use cases
- **Comprehensive metadata** for debugging and improvement
- **Backward compatibility** with legacy RAG option

## Future Improvements

- **Learning from search patterns** to improve initial queries
- **User feedback integration** to refine relevance scoring
- **Domain-specific agents** for different types of queries
- **Caching of refined queries** to speed up similar searches
