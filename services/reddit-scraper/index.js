const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('./utils/logger');
const RedditScraper = require('./scrapers/reddit-scraper');
const KnowledgeBase = require('./knowledge-base/knowledge-base');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100,
  duration: 3600,
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

const redditScraper = new RedditScraper();
const knowledgeBase = new KnowledgeBase();

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    initialScrapeEnabled: process.env.ENABLE_INITIAL_SCRAPE === 'true'
  });
});

app.post('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await knowledgeBase.search(query, limit);
    res.json({ results });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const stats = await knowledgeBase.getStatistics();
    res.json(stats);
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/scrape', async (req, res) => {
  try {
    const { subreddit } = req.body;
    
    logger.info(`Manual scrape requested for: ${subreddit || 'all subreddits'}`);
    
    if (subreddit) {
      await redditScraper.scrapeSubreddit(subreddit);
      logger.info(`Scraping completed for subreddit: ${subreddit}`);
    } else {
      await redditScraper.scrapeAllTargetSubreddits();
      logger.info('Scraping completed for all target subreddits');
    }
    
    res.json({ 
      message: 'Scraping completed successfully',
      subreddit: subreddit || 'all',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Manual scrape error:', error);
    res.status(500).json({ 
      error: 'Scraping failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/subreddits', async (req, res) => {
  try {
    const subreddits = await knowledgeBase.getSubredditStats();
    res.json(subreddits);
  } catch (error) {
    logger.error('Subreddits error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const scrapeInterval = process.env.SCRAPE_INTERVAL_HOURS || 6;
cron.schedule(`0 */${scrapeInterval} * * *`, async () => {
  logger.info('Starting scheduled scraping...');
  try {
    await redditScraper.scrapeAllTargetSubreddits();
    logger.info('Scheduled scraping completed');
  } catch (error) {
    logger.error('Scheduled scraping failed:', error);
  }
});

app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Reddit Scraper Service running on port ${PORT}`);
  
  knowledgeBase.initialize().then(() => {
    logger.info('Knowledge base initialized');
    
    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_INITIAL_SCRAPE === 'true') {
      logger.info('Starting initial scrape in development mode...');
      setTimeout(async () => {
        try {
          await redditScraper.scrapeAllTargetSubreddits();
          logger.info('Initial scrape completed successfully');
        } catch (error) {
          logger.error('Initial scrape failed:', error);
        }
      }, 5000);
    } else {
      logger.info('Initial scrape skipped (set ENABLE_INITIAL_SCRAPE=true to enable)');
    }
  }).catch(error => {
    logger.error('Knowledge base initialization failed:', error);
  });
});

module.exports = app;
