#!/usr/bin/env node

require('dotenv').config()
const RedditScraper = require('./scrapers/reddit-scraper')
const logger = require('./utils/logger')
const { spawn } = require('child_process')

async function testVideoAnalysis(redditUrl = null) {
  console.log('🎥 Testing Reddit Video Analysis System\n')
  
  if (redditUrl) {
    console.log(`🔗 Target URL: ${redditUrl}\n`)
  } else {
    console.log('📖 Usage:')
    console.log('   node test-video-analysis.js [REDDIT_URL]')
    console.log('   node test-video-analysis.js https://www.reddit.com/r/Vit/comments/1lsfrj2/...')
    console.log('   (Without URL: tests with random video from r/videos)\n')
  }

  // Check environment setup
  console.log('1. Checking environment setup...')
  
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY is missing')
    process.exit(1)
  }
  
  if (!process.env.VIDEO_ANALYSIS_ENABLED || process.env.VIDEO_ANALYSIS_ENABLED !== 'true') {
    console.log('⚠️  VIDEO_ANALYSIS_ENABLED is not set to true')
    console.log('   Add VIDEO_ANALYSIS_ENABLED=true to your .env file')
    process.exit(1)
  }

  console.log('✅ Environment variables configured')

  // Check yt-dlp availability
  console.log('\n2. Checking yt-dlp availability...')
  try {
    await new Promise((resolve, reject) => {
      const ytDlp = spawn('yt-dlp', ['--version'])
      ytDlp.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      })
      ytDlp.on('error', reject)
    })
    console.log('✅ yt-dlp is available')
  } catch (error) {
    console.error('❌ yt-dlp is not available or not working properly')
    console.error('   Please install yt-dlp:')
    console.error('   - pip install yt-dlp')
    console.error('   - Or download from: https://github.com/yt-dlp/yt-dlp/releases')
    process.exit(1)
  }

  // Check ffmpeg availability
  console.log('\n3. Checking ffmpeg availability...')
  try {
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-version'])
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`))
        }
      })
      ffmpeg.on('error', reject)
    })
    console.log('✅ ffmpeg is available')
  } catch (error) {
    console.error('❌ ffmpeg is not available or not working properly')
    console.error('   Please install ffmpeg:')
    console.error('   - Windows: choco install ffmpeg')
    console.error('   - macOS: brew install ffmpeg')
    console.error('   - Linux: sudo apt install ffmpeg')
    process.exit(1)
  }

  // Test scraper initialization
  console.log('\n4. Initializing Reddit scraper...')
  const scraper = new RedditScraper()
  console.log('✅ Scraper initialized')

  if (redditUrl) {
    // Parse Reddit URL to extract subreddit and post ID
    console.log('\n5. Parsing Reddit URL...')
    const urlMatch = redditUrl.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/]+)/)
    
    if (!urlMatch) {
      console.error('❌ Invalid Reddit URL format')
      console.error('   Expected format: https://www.reddit.com/r/SUBREDDIT/comments/POST_ID/...')
      process.exit(1)
    }
    
    const [, subreddit, postId] = urlMatch
    console.log(`📝 Subreddit: r/${subreddit}`)
    console.log(`🆔 Post ID: ${postId}`)
    
    // Initialize session for the subreddit
    await scraper.initializeSession(subreddit)
    
    // Fetch the specific post
    console.log('\n6. Fetching post data...')
    let targetPost = await scraper.fetchSpecificPost(subreddit, postId)
    
    if (!targetPost) {
      // Fallback: try searching in recent posts
      console.log('⚠️  Direct fetch failed, searching in recent posts...')
      const posts = await scraper.fetchPosts(subreddit, {
        limit: 100,
        sort: 'new'
      })
      
      targetPost = posts.find(post => 
        post.id === postId || 
        post.id === `t3_${postId}` ||
        post.id.endsWith(postId)
      )
    }
    
    if (!targetPost) {
      console.error(`❌ Post ${postId} not found in r/${subreddit}`)
      console.error('   The post might be too old, deleted, or not accessible')
      process.exit(1)
    }
    
    console.log(`✅ Found post: "${targetPost.title}"`)
    console.log(`📊 Post type: ${targetPost.postType}`)
    console.log(`👍 Score: ${targetPost.score}`)
    
    if (targetPost.postType !== 'video') {
      console.log(`⚠️  This post is not a video post (type: ${targetPost.postType})`)
      
      // Still try to analyze if it has video content
      if (targetPost.videoSrc || targetPost.contentHref) {
        console.log(`🎥 But found video URL, proceeding with analysis...`)
      } else {
        console.log('❌ No video content found in this post')
        process.exit(1)
      }
    }
    
    const videoUrl = targetPost.videoSrc || targetPost.contentHref
    if (!videoUrl) {
      console.error('❌ No video URL found in post')
      process.exit(1)
    }
    
    console.log(`🎥 Video URL: ${videoUrl}`)
    
    // Test video analysis on the specific post
    console.log(`\n7. Analyzing video content...`)
    
    const videoAnalysis = await scraper.downloadAndAnalyzeVideo(
      videoUrl,
      {
        title: targetPost.title,
        subreddit: subreddit,
        postId: targetPost.id,
      },
      {
        url: videoUrl,
        poster: targetPost.poster,
        metadata: targetPost.videoMetadata || {},
      }
    )

    if (videoAnalysis) {
      console.log('\n✅ Video analysis completed successfully!')
      console.log(`📊 Analysis Results:`)
      console.log(`   - Content Type: ${videoAnalysis.content_type}`)
      console.log(`   - Student Relevance: ${videoAnalysis.student_relevance}/10`)
      console.log(`   - Frames Analyzed: ${videoAnalysis.frames_analyzed}`)
      console.log(`   - Video Size: ${(videoAnalysis.video_size_bytes / 1024 / 1024).toFixed(2)} MB`)
      console.log(`   - Description: ${videoAnalysis.description?.substring(0, 200)}...`)
      
      if (videoAnalysis.visible_text) {
        console.log(`   - Visible Text: ${videoAnalysis.visible_text.substring(0, 100)}...`)
      }
      
      if (videoAnalysis.educational_content) {
        console.log(`   - Educational Content: ${videoAnalysis.educational_content.substring(0, 150)}...`)
      }
      
      if (videoAnalysis.key_topics && videoAnalysis.key_topics.length > 0) {
        console.log(`   - Key Topics: ${videoAnalysis.key_topics.join(', ')}`)
      }
      
      console.log(`   - Summary: ${videoAnalysis.summary}`)
    } else {
      console.log('❌ Video analysis failed')
    }
    
  } else {
    // Original behavior - test with random video from r/videos
    console.log('\n5. Testing video post scraping from r/videos...')
    try {
      const posts = await scraper.scrapeSubreddit('videos', {
        limit: 5,
        includeComments: false,
        sort: 'hot'
      })
      
      console.log(`📝 Found ${posts.length} posts`)
      
      const videoPosts = posts.filter(post => post.postType === 'video')
      console.log(`🎥 Found ${videoPosts.length} video posts`)
      
      if (videoPosts.length === 0) {
        console.log('⚠️  No video posts found in this batch. Try running again or check r/videos')
        return
      }

      // Test video analysis on first video post
      const testPost = videoPosts[0]
      console.log(`\n6. Testing video analysis on: "${testPost.title}"`)
      console.log(`   Video URL: ${testPost.videoSrc || testPost.contentHref}`)
      
      if (!testPost.videoSrc && !testPost.contentHref) {
        console.log('⚠️  No video URL found in post data')
        return
      }

      const videoAnalysis = await scraper.downloadAndAnalyzeVideo(
        testPost.videoSrc || testPost.contentHref,
        {
          title: testPost.title,
          subreddit: 'videos',
          postId: testPost.id,
        },
        {
          url: testPost.videoSrc || testPost.contentHref,
          poster: testPost.poster,
          metadata: testPost.videoMetadata || {},
        }
      )

      if (videoAnalysis) {
        console.log('\n✅ Video analysis completed successfully!')
        console.log(`📊 Analysis Results:`)
        console.log(`   - Content Type: ${videoAnalysis.content_type}`)
        console.log(`   - Student Relevance: ${videoAnalysis.student_relevance}/10`)
        console.log(`   - Frames Analyzed: ${videoAnalysis.frames_analyzed}`)
        console.log(`   - Description: ${videoAnalysis.description?.substring(0, 200)}...`)
        
        if (videoAnalysis.visible_text) {
          console.log(`   - Visible Text: ${videoAnalysis.visible_text.substring(0, 100)}...`)
        }
        
        if (videoAnalysis.key_topics && videoAnalysis.key_topics.length > 0) {
          console.log(`   - Key Topics: ${videoAnalysis.key_topics.join(', ')}`)
        }
      } else {
        console.log('❌ Video analysis failed')
      }

    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`)
      console.error(error.stack)
    }
  }

  console.log('\n🎉 Video analysis test completed!')
}

if (require.main === module) {
  const redditUrl = process.argv[2] // Get URL from command line argument
  
  if (redditUrl && !redditUrl.includes('reddit.com')) {
    console.error('❌ Please provide a valid Reddit URL')
    console.error('Usage: node test-video-analysis.js [REDDIT_URL]')
    console.error('Example: node test-video-analysis.js https://www.reddit.com/r/Vit/comments/1lsfrj2/mens_hostel_b_block_is_getting_converted_to/')
    process.exit(1)
  }
  
  testVideoAnalysis(redditUrl).catch(console.error)
}

module.exports = testVideoAnalysis
