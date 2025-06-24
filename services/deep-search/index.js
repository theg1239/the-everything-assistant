require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { RateLimiterMemory } = require('rate-limiter-flexible')
const logger = require('./utils/logger')
const RedditScraper = require('./scrapers/reddit-scraper')
const KnowledgeBase = require('./knowledge-base/knowledge-base')
const cron = require('node-cron')
const path = require('path')

const ragApiApp = require('./api-server')

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(
  cors({
    origin: ['http://localhost:3000', 'https://the-everything-assistant.vercel.app'],
    credentials: true,
  })
)
app.use(express.json())

const rateLimiter = new RateLimiterMemory({
  keyGenerator: req => req.ip,
  points: 100,
  duration: 3600,
})
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip)
    next()
  } catch {
    res.status(429).json({ error: 'Too many requests' })
  }
})

app.use('/', ragApiApp)

const redditScraper = new RedditScraper()
const knowledgeBase = new KnowledgeBase()

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    initialScrapeEnabled: process.env.ENABLE_INITIAL_SCRAPE === 'true',
  })
})

app.post('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body
    if (!query) {
      return res.status(400).json({ error: 'Query is required' })
    }
    const results = await knowledgeBase.search(query, limit)
    res.json({ results })
  } catch (error) {
    logger.error('Search error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/stats', async (req, res) => {
  try {
    const stats = await knowledgeBase.getStatistics()
    res.json(stats)
  } catch (error) {
    logger.error('Stats error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.body
    logger.info(`Manual scrape requested for ${subreddit || 'all'}`)
    if (subreddit) {
      await redditScraper.scrapeSubreddit(subreddit)
    } else {
      await redditScraper.scrapeAllTargetSubreddits()
    }
    res.json({
      message: 'Scraping completed',
      subreddit: subreddit || 'all',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Manual scrape error:', error)
    res.status(500).json({
      error: 'Scraping failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    })
  }
})

app.get('/subreddits', async (req, res) => {
  try {
    const subreddits = await knowledgeBase.getSubredditStats()
    res.json(subreddits)
  } catch (error) {
    logger.error('Subreddits error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const intervalHrs = parseInt(process.env.SCRAPE_INTERVAL_HOURS, 10) || 6
cron.schedule(`0 */${intervalHrs} * * *`, async () => {
  logger.info('Scheduled incremental scraping started…')
  try {
    await redditScraper.scrapeAllTargetSubreddits()
    logger.info('Scheduled incremental scraping completed')
  } catch (err) {
    logger.error('Scheduled scrape failed:', err)
  }
})

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  logger.info(`Unified service listening on port ${PORT}`)

  knowledgeBase
    .initialize()
    .then(() => {
      logger.info('Knowledge base initialized')
      if (process.env.NODE_ENV === 'development' && process.env.ENABLE_INITIAL_SCRAPE === 'true') {
        logger.info('Performing initial dev mode scrape…')
        redditScraper
          .scrapeAllTargetSubreddits()
          .then(() => logger.info('Dev initial scrape done'))
          .catch(e => logger.error('Dev initial scrape failed:', e))
      } else {
        logger.info('Initial scrape skipped')
      }
    })
    .catch(e => {
      logger.error('KB init failed:', e)
    })
})

module.exports = app
