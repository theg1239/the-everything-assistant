# VIT Vellore AI Assistant

A comprehensive AI-powered chatbot for VIT Vellore with advanced web scraping capabilities and extensive knowledge base..

## Features

- **Intelligent Paper Finding**: Automatically scrapes vitpapervault.in and papers.codechefvit.com for past papers
- **Faculty Information**: Real-time faculty data scraping from VIT websites
- **Comprehensive Knowledge Base**: Extensive information about VIT programs, policies, and procedures
- **Agentic Capabilities**: AI automatically decides when and which tools to use
- **Seamless Tool Calling**: Tools work in the background without user awareness.

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local`
4. Add your Google AI API key to `.env.local`:
   \`\`\`
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   \`\`\`
5. Run the development server: `npm run dev`

## API Key Configuration

Get your Google AI API key from [Google AI Studio](https://makersuite.google.com/app/apikey) and add it to your environment variables.

## Tool Capabilities

### Past Paper Finder

- Searches multiple repositories automatically
- Filters by course code, exam type, and year
- Returns organized results with download links

### Faculty Information Scraper

- Scrapes real-time faculty data
- Searches by department or faculty name
- Returns contact information and specializations

### General VIT Information

- Scrapes current information from official VIT websites
- Covers admissions, placements, events, and news
- Provides up-to-date information

## Usage Examples

- "find past papers for CSE1001"
- "show me CAT1 papers for MAT1001 from 2023"
- "get faculty information for computer science department"
- "tell me about current placement statistics"

The AI will automatically use appropriate tools based on your queries.
