#!/usr/bin/env node

require('dotenv').config()

const { program } = require('commander')
const KnowledgeBase = require('./knowledge-base/knowledge-base')
const RedditScraper = require('./scrapers/reddit-scraper')
const logger = require('./utils/logger')
const axios = require('axios')

program
  .name('reddit-scraper-cli')
  .description('CLI for managing the Reddit Knowledge Base scraper')
  .version('1.0.0')

program
  .command('init')
  .description('Initialize the knowledge base database')
  .action(async () => {
    try {
      console.log('Initializing knowledge base...')
      const kb = new KnowledgeBase()
      await kb.initialize()
      console.log('Knowledge base initialized successfully')
      await kb.cleanup()
    } catch (error) {
      console.error('Initialization failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('scrape')
  .description('Scrape Reddit data')
  .option('-s, --subreddit <name>', 'Specific subreddit to scrape')
  .option('-l, --limit <number>', 'Number of posts to scrape', '50')
  .action(async options => {
    try {
      console.log('Starting Reddit scraping...')
      const scraper = new RedditScraper()

      if (options.subreddit) {
        console.log(`Scraping r/${options.subreddit}...`)
        await scraper.scrapeSubreddit(options.subreddit)
      } else {
        console.log('Scraping all target subreddits...')
        await scraper.scrapeAllTargetSubreddits()
      }

      console.log('Scraping completed successfully')
    } catch (error) {
      console.error('Scraping failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('search')
  .description('Search the knowledge base')
  .argument('<query>', 'Search query')
  .option('-l, --limit <number>', 'Number of results', '10')
  .action(async (query, options) => {
    try {
      console.log(`Searching for: "${query}"`)
      const kb = new KnowledgeBase()
      await kb.initialize()

      const results = await kb.search(query, parseInt(options.limit))

      if (results.length === 0) {
        console.log('No results found')
      } else {
        console.log(`Found ${results.length} results:\n`)

        results.forEach((result, index) => {
          console.log(`${index + 1}. [${result.type.toUpperCase()}] r/${result.subreddit}`)
          console.log(`   Title: ${result.title}`)
          console.log(
            `   Score: ${result.score} | Similarity: ${(result.similarity * 100).toFixed(1)}%`
          )
          console.log(`   Author: ${result.author || 'N/A'}`)

          if (result.content) {
            const snippet =
              result.content.length > 100
                ? result.content.substring(0, 100) + '...'
                : result.content
            console.log(`   Content: ${snippet}`)
          }

          if (result.url) {
            console.log(`   URL: ${result.url}`)
          }
          console.log()
        })
      }

      await kb.cleanup()
    } catch (error) {
      console.error('Search failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('stats')
  .description('Show knowledge base statistics')
  .action(async () => {
    try {
      const kb = new KnowledgeBase()
      await kb.initialize()

      const stats = await kb.getStatistics()
      const subredditStats = await kb.getSubredditStats()

      console.log('Knowledge Base Statistics:')
      console.log('─'.repeat(40))
      console.log(`Total Subreddits: ${stats.total_subreddits}`)
      console.log(`Total Posts: ${stats.total_posts}`)
      console.log(`Total Comments: ${stats.total_comments}`)
      console.log(`Total Chunks: ${stats.total_chunks}`)
      console.log(`Average Post Score: ${parseFloat(stats.avg_post_score || 0).toFixed(2)}`)
      console.log(`Latest Post: ${stats.latest_post || 'N/A'}`)

      if (subredditStats.length > 0) {
        console.log('\n📱 Subreddit Breakdown:')
        console.log('─'.repeat(40))
        subredditStats.slice(0, 10).forEach(sub => {
          console.log(
            `r/${sub.subreddit.padEnd(20)} | Posts: ${sub.total_posts.toString().padStart(4)} | Comments: ${sub.total_comments.toString().padStart(5)} | Avg Score: ${parseFloat(
              sub.avg_score || 0
            )
              .toFixed(1)
              .padStart(5)}`
          )
        })

        if (subredditStats.length > 10) {
          console.log(`... and ${subredditStats.length - 10} more subreddits`)
        }
      }

      await kb.cleanup()
    } catch (error) {
      console.error('Failed to get statistics:', error.message)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Check service status')
  .option('-u, --url <url>', 'Service URL', 'http://localhost:3002')
  .action(async options => {
    try {
      console.log(`Checking service at ${options.url}...`)

      const response = await axios.get(`${options.url}/health`, { timeout: 5000 })

      if (response.status === 200) {
        console.log('Service is running and healthy')
        console.log(`Response: ${JSON.stringify(response.data, null, 2)}`)

        try {
          const statsResponse = await axios.get(`${options.url}/stats`, { timeout: 5000 })
          console.log('\n Service Statistics:')
          console.log(`Posts: ${statsResponse.data.total_posts || 0}`)
          console.log(`Comments: ${statsResponse.data.total_comments || 0}`)
          console.log(`Subreddits: ${statsResponse.data.total_subreddits || 0}`)
        } catch (statsError) {
          console.log('Could not fetch service statistics')
        }
      }
    } catch (error) {
      console.error('❌ Service is not responding')
      console.error(`Error: ${error.message}`)

      if (error.code === 'ECONNREFUSED') {
        console.log('\nSuggestions:')
        console.log('1. Start the service with: npm start')
        console.log('2. Check if port 3002 is available')
      }

      process.exit(1)
    }
  })

program
  .command('clean')
  .description('Clean up old data from the knowledge base')
  .option('-d, --days <number>', 'Remove data older than N days', '30')
  .option('--confirm', 'Confirm the deletion')
  .action(async options => {
    if (!options.confirm) {
      console.log('This will permanently delete old data from the knowledge base')
      console.log('Use --confirm flag to proceed')
      return
    }

    try {
      console.log(`Cleaning data older than ${options.days} days...`)
      const kb = new KnowledgeBase()
      await kb.initialize()

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(options.days))

      const subredditsToUpdate = await kb.pool.query(
        `
        SELECT DISTINCT subreddit 
        FROM reddit_posts 
        WHERE created_utc >= $1
      `,
        [cutoffDate]
      )

      console.log(`Found ${subredditsToUpdate.rows.length} subreddits that will be affected`)

      const result = await kb.pool.query(
        `
        DELETE FROM reddit_posts 
        WHERE created_utc < $1
      `,
        [cutoffDate]
      )

      console.log(`Deleted ${result.rowCount} old posts`)

      const commentResult = await kb.pool.query(`
        DELETE FROM reddit_comments 
        WHERE post_reddit_id NOT IN (SELECT reddit_id FROM reddit_posts)
      `)

      console.log(`Deleted ${commentResult.rowCount} orphaned comments`)

      const chunkResult = await kb.pool.query(`
        DELETE FROM knowledge_chunks 
        WHERE (source_type = 'post' AND source_id NOT IN (SELECT id FROM reddit_posts))
           OR (source_type = 'comment' AND source_id NOT IN (SELECT id FROM reddit_comments))
      `)

      console.log(`Deleted ${chunkResult.rowCount} orphaned chunks`)

      console.log('Updating subreddit statistics...')
      let updatedCount = 0

      for (const row of subredditsToUpdate.rows) {
        await kb.updateSubredditStats(kb.pool, row.subreddit)
        updatedCount++
      }

      const removedStatsResult = await kb.pool.query(`
        DELETE FROM subreddit_stats 
        WHERE subreddit NOT IN (SELECT DISTINCT subreddit FROM reddit_posts)
      `)

      console.log(`Updated stats for ${updatedCount} subreddits`)
      console.log(
        `Removed stats for ${removedStatsResult.rowCount} subreddits with no remaining posts`
      )

      await kb.cleanup()
      console.log('✅ Cleanup completed successfully')
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message)
      process.exit(1)
    }
  })

program.parse()
