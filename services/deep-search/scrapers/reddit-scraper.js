require('dotenv').config()

const axios = require('axios')
const cheerio = require('cheerio')
const logger = require('../utils/logger')
const { generateObject, embed } = require('ai')
const { google } = require('@ai-sdk/google')
const { z } = require('zod')
const ImageAnalyzer = require('./image-analyzer')
const fs = require('fs').promises
const path = require('path')
const { spawn } = require('child_process')
const sharp = require('sharp')

class RedditScraper {
  constructor() {
    this.baseUrl = 'https://www.reddit.com'
    this.userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
    this.session = axios.create({
      timeout: 30000,
      headers: { 'User-Agent': this.userAgent },
    })
    this.embeddingModel = google.embedding('text-embedding-004')
    this.embeddingDim = 768
    this.imageAnalyzer = new ImageAnalyzer()
    this.imageAnalysisEnabled = process.env.IMAGE_ANALYSIS_ENABLED === 'true'

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is required')
    }

    this.sessionData = {
      cookies: null,
      navigationSessionId: null,
      csrfToken: null,
      loid: null,
      tokenV2: null,
      sessionTracker: null,
    }
  }
  async scrapeSubreddit(subreddit, options = {}) {
    try {
      const {
        limit = 25,
        sort = 'new',
        timeframe = 'DAY',
        includeComments = true,
        maxCommentsPerPost = 50,
      } = options

      logger.info(`Starting scrape of r/${subreddit} with ${limit} posts`)
      await this.initializeSession(subreddit)

      const posts = await this.fetchPosts(subreddit, {
        limit,
        sort,
        timeframe,
      })

      logger.info(`Found ${posts.length} posts`)
      if (includeComments) {
        for (const post of posts) {
          try {
            post.comments = await this.fetchComments(subreddit, post.id, maxCommentsPerPost)
            logger.info(`Fetched ${post.comments.length} comments for post ${post.id}`)
            await new Promise(r => setTimeout(r, 1000))
          } catch (err) {
            logger.error(`Failed to fetch comments for post ${post.id}:`, err.message)
            post.comments = []
          }
        }
      }

      return posts
    } catch (error) {
      logger.error('Error scraping subreddit:', error)
      throw error
    }
  }

  async initializeSession(subreddit) {
    try {
      logger.info(`Initializing session for r/${subreddit}`)
      const response = await this.session.get(`${this.baseUrl}/r/${subreddit}/`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Gpc': '1',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0',
        },
      })

      const $ = cheerio.load(response.data)
      let navigationSessionId = null
      let csrfToken = null

      $('script').each((_, script) => {
        const content = $(script).html()
        if (content) {
          const navMatch = content.match(/navigationSessionId['"]\s*:\s*['"]([^'"]+)['"]/)
          if (navMatch) navigationSessionId = navMatch[1]
          const csrfMatch = content.match(/csrf_token['"]\s*:\s*['"]([^'"]+)['"]/)
          if (csrfMatch) csrfToken = csrfMatch[1]
        }
      })

      const setCookies = response.headers['set-cookie']
      let cookieString = ''
      if (setCookies) {
        const cookieMap = new Map()
        setCookies.forEach(cookie => {
          const [nv] = cookie.split(';')
          const [name, val] = nv.split('=')
          if (name && val) cookieMap.set(name.trim(), val.trim())
        })
        cookieString = Array.from(cookieMap.entries())
          .map(([n, v]) => `${n}=${v}`)
          .join('; ')
        this.sessionData.loid = cookieMap.get('loid')
        this.sessionData.tokenV2 = cookieMap.get('token_v2')
        this.sessionData.sessionTracker = cookieMap.get('session_tracker')
      }

      this.sessionData.navigationSessionId = navigationSessionId || this.generateSessionId()
      this.sessionData.csrfToken = csrfToken
      this.sessionData.cookies = cookieString
      this.session.defaults.headers['Cookie'] = cookieString

      logger.info('Session initialized successfully', {
        hasNavigationSessionId: !!this.sessionData.navigationSessionId,
        hasCsrfToken: !!this.sessionData.csrfToken,
        cookieCount: cookieString.split(';').length,
      })

      return this.sessionData
    } catch (error) {
      logger.error('Failed to initialize session:', error.message)
      throw error
    }
  }

  generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
  async fetchPosts(subreddit, options = {}) {
    try {
      const {
        limit = 25,
        sort = 'new',
        timeframe = 'DAY',
        maxPages = parseInt(process.env.MAX_PAGES_PER_SUBREDDIT) || 50,
      } = options

      let allPosts = []
      let after = null
      let feedLength = 4
      let distance = 0
      let adPostsServed = 1
      let adDistance = 1
      const seenPostIds = new Set()
      let consecutiveEmpty = 0
      let pageCount = 0
      const maxEmpty = 3

      logger.info(
        `Starting to fetch posts from r/${subreddit} (limit: ${limit}, maxPages: ${maxPages}, sort: ${sort})`
      )

      while (allPosts.length < limit && consecutiveEmpty < maxEmpty && pageCount < maxPages) {
        pageCount++
        const url = `${this.baseUrl}/svc/shreddit/community-more-posts/${sort}/`
        const params = new URLSearchParams({
          t: timeframe,
          name: subreddit,
          navigationSessionId: this.sessionData.navigationSessionId,
          feedLength: feedLength.toString(),
        })

        if (after) {
          params.append('after', after)
          params.append('distance', distance.toString())
          params.append('ad_posts_served', adPostsServed.toString())
          params.append('adDistance', adDistance.toString())
        } else {
          params.append('adDistance', '1')
          params.append('ad_posts_served', '1')
        }

        logger.info(`Page ${pageCount}: Fetching posts from: ${url}?${params.toString()}`)
        logger.debug(
          `Pagination state: after="${after || 'none'}", feedLength=${feedLength}, distance=${distance}`
        )

        const rsp = await this.session.get(`${url}?${params}`, {
          headers: {
            Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9',
            'Accept-Language': 'en-US,en;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
            Priority: 'u=1, i',
            'Sec-Ch-Ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Gpc': '1',
            Referer: `${this.baseUrl}/r/${subreddit}/`,
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        })
        const posts = this.parsePosts(rsp.data)
        logger.info(`Page ${pageCount}: Parsed ${posts.length} posts from response`)

        if (posts.length > 0) {
          const firstFewIds = posts
            .slice(0, 3)
            .map(p => p.id)
            .join(', ')
          logger.debug(`Page ${pageCount}: First few post IDs: ${firstFewIds}`)
        }

        if (posts.length === 0) {
          consecutiveEmpty++
          logger.warn(
            `Page ${pageCount}: No posts found (consecutiveEmpty: ${consecutiveEmpty}/${maxEmpty})`
          )
          if (consecutiveEmpty >= maxEmpty) {
            logger.info('Breaking due to consecutive empty responses')
            break
          }
        } else {
          consecutiveEmpty = 0
        }

        const newOnes = posts.filter(p => {
          if (seenPostIds.has(p.id)) {
            logger.debug(`Skipping duplicate post: ${p.id}`)
            return false
          }
          seenPostIds.add(p.id)
          return true
        })

        logger.info(
          `Page ${pageCount}: Found ${newOnes.length} new posts (${posts.length - newOnes.length} duplicates)`
        )

        if (newOnes.length === 0 && posts.length > 0) {
          logger.warn(
            'All posts on this page are duplicates - this might indicate pagination issues'
          )
          if (pageCount === 2 && sort === 'best') {
            logger.info('Switching to "hot" sort to try different pagination')
          }
          break
        }

        allPosts = allPosts.concat(newOnes)

        feedLength += posts.length
        distance = feedLength - 4

        const $ = cheerio.load(rsp.data)
        const lastPost = $('shreddit-post').last()
        const newAfter = lastPost.length ? this.extractPaginationToken(rsp.data, lastPost) : null

        logger.debug(
          `Page ${pageCount}: Extracted pagination token: ${newAfter ? newAfter.substring(0, 30) + '...' : 'none'}`
        )

        if (!newAfter) {
          logger.info('No more pagination token found, ending pagination')
          break
        }

        if (newAfter === after) {
          logger.warn('Pagination token unchanged, ending pagination to prevent infinite loop')
          break
        }

        after = newAfter

        if (pageCount > 1) {
          adDistance = Math.min(adDistance + 1, 2)
        }

        await new Promise(r => setTimeout(r, 500))
      }

      logger.info(
        `Pagination complete for r/${subreddit}: ${allPosts.length} unique posts collected from ${pageCount} pages (${seenPostIds.size} total seen)`
      )

      if (pageCount >= maxPages) {
        logger.info(`Reached maximum page limit (${maxPages})`)
      }

      return allPosts.slice(0, limit)
    } catch (error) {
      logger.error('Error fetching posts:', error.message)
      throw error
    }
  }
  extractPaginationToken(html, lastPost) {
    try {
      let postId = lastPost.attr('id')

      if (!postId) {
        postId = lastPost.attr('thingid') || lastPost.attr('thing-id') || lastPost.attr('post-id')
      }

      if (!postId) {
        const htmlStr = lastPost.toString()
        const idMatch = htmlStr.match(/id="([^"]+)"/)
        if (idMatch) postId = idMatch[1]
      }

      if (!postId) {
        const $ = require('cheerio').load(html)
        const allPosts = $('shreddit-post')
        if (allPosts.length > 0) {
          const lastPostHtml = allPosts.last().toString()
          const t3Match = lastPostHtml.match(/t3_([a-zA-Z0-9]+)/)
          if (t3Match) postId = t3Match[1]
        }
      }

      if (postId) {
        const cleanId = postId.replace(/^t3_/, '')
        const token = Buffer.from(`t3_${cleanId}`).toString('base64')
        logger.debug(`Extracted pagination token from post ID: ${cleanId} -> ${token}`)
        return token
      }

      logger.warn('Could not extract pagination token - no post ID found')
      return null
    } catch (error) {
      logger.error('Error extracting pagination token:', error.message)
      return null
    }
  }

  parseTimestamp(timestampStr) {
    if (!timestampStr) return new Date()

    if (typeof timestampStr === 'string' && timestampStr.includes('T')) {
      const isoDate = new Date(timestampStr)
      if (!isNaN(isoDate.getTime())) {
        return isoDate
      }
    }

    const unixTimestamp = parseInt(timestampStr)
    if (!isNaN(unixTimestamp)) {
      if (unixTimestamp > 1000000000000) {
        return new Date(unixTimestamp)
      } else {
        return new Date(unixTimestamp * 1000)
      }
    }

    return new Date()
  }

  parsePosts(html) {
    try {
      const $ = cheerio.load(html)
      const posts = []
      $('shreddit-post').each((_, el) => {
        try {
          const $post = $(el)
          const post = {
            id: $post.attr('id'),
            title: $post.attr('post-title'),
            author: $post.attr('author'),
            authorId: $post.attr('author-id'),
            score: parseInt($post.attr('score')) || 0,
            commentCount: parseInt($post.attr('comment-count')) || 0,
            subreddit: $post.attr('subreddit-name'),
            subredditId: $post.attr('subreddit-id'),
            postType: $post.attr('post-type'),
            domain: $post.attr('domain'),
            permalink: $post.attr('permalink'),
            contentHref: $post.attr('content-href'),
            createdTimestamp: $post.attr('created-timestamp'),
            voteType: $post.attr('vote-type') || '',
            isEmbeddable: $post.attr('is-embeddable') === 'true',
            feedIndex: parseInt($post.attr('feedIndex')) || 0,
            authorIcon: $post.attr('icon'),
          }

          if (!post.createdTimestamp) {
            const timeago = $post.find('faceplate-timeago')
            if (timeago.length) {
              post.createdTimestamp = timeago.attr('ts')
            }
          }

          const txt = $post.find('[slot="text-body"]')
          if (txt.length) {
            const c = txt.find('.md').text().trim() || txt.text().trim()
            if (c) post.content = c
          }

          const flair = $post.find('shreddit-post-flair .flair-content')
          if (flair.length) post.flair = flair.text().trim()
          if (post.postType === 'image') {
            let img = null

            const contentImg = $post
              .find('[slot="media"] img, .media-container img, .image-container img')
              .first()
            if (contentImg.length) {
              img = contentImg
            } else {
              const allImages = $post.find('img')
              img = allImages
                .filter((i, elem) => {
                  const src = $(elem).attr('src') || ''
                  const alt = $(elem).attr('alt') || ''

                  return (
                    !src.includes('snoovatar') &&
                    !src.includes('avatar') &&
                    !src.includes('icon') &&
                    !src.includes('emoji') &&
                    !alt.toLowerCase().includes('avatar') &&
                    !alt.toLowerCase().includes('icon') &&
                    !alt.toLowerCase().includes('user') &&
                    src.length > 50
                  )
                })
                .first()
            }

            if (img && img.length) {
              const imageUrl = img.attr('src')
              const imageAlt = img.attr('alt')

              if (
                imageUrl &&
                (imageUrl.includes('i.redd.it') ||
                  imageUrl.includes('preview.redd.it') ||
                  imageUrl.includes('external-preview.redd.it')) &&
                !imageUrl.includes('snoovatar')
              ) {
                post.imageUrl = imageUrl
                post.imageAlt = imageAlt
              }
            }
          } else if (post.postType === 'video') {
            const vid = $post.find('shreddit-player-2')
            if (vid.length) {
              post.videoSrc = vid.attr('src')
              post.poster = vid.attr('poster')
              const pkg = vid.attr('packaged-media-json')
              if (pkg) {
                try {
                  post.videoMetadata = JSON.parse(pkg.replace(/&quot;/g, '"'))
                } catch {}
              }
            }

            const mediaUi = $post.find('shreddit-media-ui')
            if (mediaUi.length) {
              const preview = mediaUi.attr('preview')
              if (preview && !post.videoSrc) {
                post.videoSrc = preview
              }
              const poster = mediaUi.attr('poster')
              if (poster && !post.poster) {
                post.poster = poster
              }
            }

            const videoEl = $post.find('video')
            if (videoEl.length && !post.videoSrc) {
              post.videoSrc = videoEl.attr('src')
              post.poster = videoEl.attr('poster')
            }

            if (!post.videoSrc && post.contentHref && post.contentHref.includes('v.redd.it')) {
              post.videoSrc = post.contentHref
            }
          }

          if (post.postType === 'link' || post.domain !== `self.${post.subreddit}`) {
            post.url = post.contentHref
          }

          posts.push(post)
        } catch (err) {
          logger.error('Error parsing individual post:', err.message)
        }
      })

      logger.info(`Parsed ${posts.length} posts from HTML`)
      return posts
    } catch (error) {
      logger.error('Error parsing posts HTML:', error.message)
      return []
    }
  }

  async fetchComments(subreddit, postId, maxComments = 50) {
    try {
      const clean = postId.replace(/^t3_/, '')
      const url = `${this.baseUrl}/svc/shreddit/comments/r/${subreddit}/${clean}`
      const params = new URLSearchParams({
        'render-mode': 'partial',
      })

      logger.info(`Fetching comments from: ${url}?${params}`)
      const rsp = await this.session.get(`${url}?${params}`, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.8',
          Priority: 'u=1, i',
          'Sec-Ch-Ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Gpc': '1',
          Referer: `${this.baseUrl}/r/${subreddit}/comments/${clean}/`,
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      })

      return this.parseComments(rsp.data, maxComments)
    } catch (error) {
      logger.error(`Error fetching comments for post ${postId}:`, error.message)
      return []
    }
  }
  async fetchSpecificPost(subreddit, postId) {
    try {
      const cleanId = postId.replace(/^t3_/, '')
      const url = `${this.baseUrl}/r/${subreddit}/comments/${cleanId}/`

      logger.info(`Fetching specific post: ${url}`)

      const response = await this.session.get(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Ch-Ua': '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Gpc': '1',
          'Upgrade-Insecure-Requests': '1',
          Referer: `${this.baseUrl}/r/${subreddit}/`,
        },
      })

      const posts = this.parsePosts(response.data)

      if (posts.length > 0) {
        const post = posts[0] // The specific post should be the first one
        logger.info(`Found specific post: ${post.title}`)
        return post
      } else {
        logger.warn(`No post found with ID ${postId} in r/${subreddit}`)
        return null
      }
    } catch (error) {
      logger.error(`Error fetching specific post ${postId}:`, error.message)
      return null
    }
  }
  parseComments(html, maxComments = 50) {
    try {
      const $ = cheerio.load(html)
      const comments = []
      $('shreddit-comment').each((_, el) => {
        if (comments.length >= maxComments) return false
        try {
          const $c = $(el)

          let commentId =
            $c.attr('thingId') ||
            $c.attr('thingid') ||
            $c.attr('thing-id') ||
            $c.attr('commentid') ||
            $c.attr('id')

          if (!commentId && el.attribs) {
            commentId = el.attribs.thingId || el.attribs.thingid || el.attribs['thing-id']
          }

          if (!commentId) {
            const htmlStr = $.html($c)
            const thingIdMatch = htmlStr.match(/thingId="([^"]+)"/i)
            if (thingIdMatch) {
              commentId = thingIdMatch[1]
            }
          }

          const comment = {
            id: commentId,
            author: $c.attr('author'),
            score: parseInt($c.attr('score')) || 0,
            depth: parseInt($c.attr('depth')) || 0,
            parentId: $c.attr('parentId') || $c.attr('parent-id'),
            postId: $c.attr('postId') || $c.attr('post-id'),
            permalink: $c.attr('permalink'),
            contentType: $c.attr('content-type'),
            ariaLabel: $c.attr('ariaLabel'),
          }

          const cc = $c.find('[slot="comment"]')
          if (cc.length) {
            const text = cc.find('.md').text().trim() || cc.text().trim()
            if (text) comment.content = text
          }

          const timeago = $c.find('faceplate-timeago')
          if (timeago.length) comment.timestamp = timeago.attr('ts')

          const act = $c.find('shreddit-comment-action-row')
          if (act.length) comment.voteState = act.attr('vote-state')

          const av = $c.find('[slot="commentAvatar"] img')
          if (av.length) comment.authorIcon = av.attr('src')

          if (comment.content && comment.id) {
            comments.push(comment)
          }
        } catch (err) {
          logger.error('Error parsing individual comment:', err.message)
        }
      })

      logger.info(`Parsed ${comments.length} comments from HTML`)
      return comments
    } catch (error) {
      logger.error('Error parsing comments HTML:', error.message)
      return []
    }
  }

  async analyzeContent(content) {
    try {
      const contentAnalysisSchema = z.object({
        topics: z.array(z.string()).describe('Key topics and themes'),
        sentiment: z.enum(['positive', 'negative', 'neutral']).describe('Overall sentiment'),
        keywords: z.array(z.string()).describe('Important keywords'),
        summary: z.string().describe('Brief summary'),
        relevance: z.enum(['high', 'medium', 'low']).describe('Relevance to students'),
      })

      const prompt = `Analyze this Reddit content and extract key topics, sentiment, and important information for a student knowledge base:

Content: ${content}

Please provide:
1. Key topics and themes
2. Sentiment (positive/negative/neutral)
3. Important keywords
4. Brief summary
5. Relevance to students (high/medium/low)`

      const { object } = await generateObject({
        model: google('gemini-flash-latest'),
        prompt,
        schema: contentAnalysisSchema,
        maxTokens: 1000,
        temperature: 0.3,
      })

      return object
    } catch (error) {
      logger.error('Error analyzing content:', error.message)

      return {
        topics: [],
        sentiment: 'neutral',
        keywords: [],
        summary: 'Content analysis failed',
        relevance: 'medium',
      }
    }
  }

  async generateEmbedding(text) {
    if (!text || !text.trim()) {
      return new Array(this.embeddingDim).fill(0)
    }
    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text.substring(0, 8000),
      })
      return embedding
    } catch (error) {
      logger.error('Error generating embedding:', error.message)
      return new Array(this.embeddingDim).fill(0)
    }
  }

  delay(ms) {
    return new Promise(r => setTimeout(r, ms))
  }
  async scrapeAllTargetSubreddits() {
    const targetSubreddits = (process.env.TARGET_SUBREDDITS || 'Vit').split(',').map(s => s.trim())
    const maxPostsPerSubreddit = parseInt(process.env.MAX_POSTS_PER_SUBREDDIT) || 5000
    const maxPagesPerSubreddit = parseInt(process.env.MAX_PAGES_PER_SUBREDDIT) || 50

    logger.info(
      `Starting scraping of all target subreddits (${targetSubreddits.length} subreddits, max ${maxPostsPerSubreddit} posts each, max ${maxPagesPerSubreddit} pages each)`
    )

    for (const subreddit of targetSubreddits) {
      if (!subreddit) continue
      try {
        logger.info(`Starting scrape of r/${subreddit}`)
        const posts = await this.scrapeSubreddit(subreddit, {
          limit: maxPostsPerSubreddit,
          includeComments: true,
          maxPages: maxPagesPerSubreddit,
        })
        logger.info(`Scraped ${posts.length} posts from r/${subreddit}, now processing...`)
        await this.processPosts(posts, subreddit)
        logger.info(`Completed processing r/${subreddit}`)
        await this.delay(2000)
      } catch (error) {
        logger.error(`Failed to scrape subreddit ${subreddit}:`, error)
      }
    }
    logger.info('Completed scraping all target subreddits')
  }

  async processPosts(posts, subredditName) {
    const KnowledgeBase = require('../knowledge-base/knowledge-base')
    const kb = new KnowledgeBase()
    await kb.initialize()
    for (const post of posts) {
      try {
        if (posts.indexOf(post) === 0) {
          logger.info(
            `Debug: First post structure - ID: ${post.id}, Comments: ${post.comments?.length || 0}`
          )
          if (post.comments && post.comments.length > 0) {
            logger.info(
              `Debug: First comment - ID: ${post.comments[0].id}, Content: ${post.comments[0].content?.substring(0, 50)}...`
            )
          }
        }

        const minUpvotesThreshold = parseInt(process.env.MIN_UPVOTES_THRESHOLD) || 5
        if (post.score < minUpvotesThreshold) continue
        const postData = {
          reddit_id: post.id,
          subreddit: subredditName,
          title: post.title,
          content: post.content || '',
          author: post.author,
          created_utc: this.parseTimestamp(post.createdTimestamp),
          upvotes: Math.max(0, post.score),
          downvotes: 0,
          score: post.score,
          num_comments: post.commentCount || 0,
          url: post.url || '',
          permalink: post.permalink,
          is_video: post.postType === 'video',
          post_type: post.postType || 'text',
          images: post.images || [],
          extracted_text: post.content || '',
          tags: post.flair ? [post.flair] : [],
        }

        if (post.postType === 'video' && (post.videoSrc || post.contentHref)) {
          logger.info(`Processing video post ${post.id}: ${post.title}`)

          const videoUrl = post.videoSrc || post.contentHref
          const videoData = {
            url: videoUrl,
            poster: post.poster,
            metadata: post.videoMetadata || {},
          }

          try {
            const videoContext = {
              title: post.title,
              subreddit: subredditName,
              postId: post.id,
              content: post.content || '',
              author: post.author,
              score: post.score,
              commentCount: post.commentCount || 0,
              flair: post.flair || '',
              comments: post.comments
                ? post.comments.slice(0, 10).map(c => ({
                    author: c.author,
                    content: c.content,
                    score: c.score || 0,
                    depth: c.depth || 0,
                  }))
                : [],
            }

            const videoAnalysis = await this.downloadAndAnalyzeVideo(
              videoUrl,
              videoContext,
              videoData
            )

            if (videoAnalysis) {
              postData.video = {
                ...videoData,
                analysis: videoAnalysis,
              }
              postData.url = videoUrl

              const videoText = [
                videoAnalysis.description,
                videoAnalysis.visible_text,
                videoAnalysis.educational_content,
                videoAnalysis.summary,
              ]
                .filter(text => text && text.trim())
                .join(' ')

              if (videoText) {
                postData.extracted_text = [postData.extracted_text, `Video content: ${videoText}`]
                  .filter(Boolean)
                  .join(' ')
              }

              logger.info(
                `Video analysis completed for post ${post.id}: relevance=${videoAnalysis.student_relevance}/10, type=${videoAnalysis.content_type}`
              )
            } else {
              logger.info(`No video analysis result for post ${post.id}`)
              postData.video = videoData
            }
          } catch (error) {
            logger.error(`Failed to analyze video for post ${post.id}:`, error.message)
            postData.video = {
              ...videoData,
              analysis: null,
              error: error.message,
            }
          }

          if (post.poster && this.imageAnalysisEnabled) {
            try {
              logger.info(`Analyzing video thumbnail for post ${post.id}: ${post.poster}`)
              const thumbnailAnalysis = await this.downloadAndAnalyzeImage(post.poster, {
                title: post.title,
                subreddit: subredditName,
              })

              if (thumbnailAnalysis) {
                if (!postData.images) postData.images = []
                postData.images.push({
                  url: post.poster,
                  alt: 'Video thumbnail',
                  analysis: thumbnailAnalysis,
                  type: 'video_thumbnail',
                })

                if (!postData.video?.analysis) {
                  const thumbnailText = [
                    thumbnailAnalysis.description,
                    thumbnailAnalysis.visible_text,
                    thumbnailAnalysis.educational_content,
                  ]
                    .filter(text => text && text.trim())
                    .join(' ')

                  if (thumbnailText) {
                    postData.extracted_text = [
                      postData.extracted_text,
                      `Video thumbnail: ${thumbnailText}`,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                }

                logger.info(`Video thumbnail analysis completed for post ${post.id}`)
              }
            } catch (error) {
              logger.error(`Failed to analyze video thumbnail for post ${post.id}:`, error.message)
            }
          }
        }
        else if (post.postType === 'image' && post.imageUrl) {
          const isValidImageUrl =
            post.imageUrl &&
            !post.imageUrl.includes('snoovatar') &&
            !post.imageUrl.includes('/avatars/') &&
            !post.imageUrl.includes('icon') &&
            !post.imageUrl.includes('emoji') &&
            (post.imageUrl.includes('i.redd.it') ||
              post.imageUrl.includes('preview.redd.it') ||
              post.imageUrl.includes('external-preview.redd.it')) &&
            post.imageUrl.length > 100

          if (isValidImageUrl) {
            logger.info(`Analyzing image for post ${post.id}: ${post.imageUrl}`)
            try {
              const imageAnalysis = await this.downloadAndAnalyzeImage(post.imageUrl, {
                title: post.title,
                subreddit: subredditName,
              })

              if (imageAnalysis) {
                postData.images = [
                  {
                    url: post.imageUrl,
                    alt: post.imageAlt || '',
                    analysis: imageAnalysis,
                  },
                ]

                const imageText = [
                  imageAnalysis.description,
                  imageAnalysis.visible_text,
                  imageAnalysis.educational_content,
                ]
                  .filter(text => text && text.trim())
                  .join(' ')

                if (imageText) {
                  postData.extracted_text = [postData.extracted_text, imageText]
                    .filter(Boolean)
                    .join(' ')
                }
                logger.info(
                  `Image analysis completed for post ${post.id}: relevance=${imageAnalysis.student_relevance}/10`
                )
              } else {
                logger.info(`No image analysis result for post ${post.id}`)
                postData.images = [
                  {
                    url: post.imageUrl,
                    alt: post.imageAlt || '',
                    analysis: null,
                  },
                ]
              }
            } catch (error) {
              logger.error(`Failed to analyze image for post ${post.id}:`, error.message)
              postData.images = [
                {
                  url: post.imageUrl,
                  alt: post.imageAlt || '',
                  analysis: null,
                  error: error.message,
                },
              ]
            }
          } else if (post.postType === 'image' && post.imageUrl) {
            logger.info(
              `Skipping image analysis for post ${post.id}: invalid image URL (likely avatar or UI element): ${post.imageUrl}`
            )
          }
        }

        const postId = await kb.storePost(postData)

        if (post.comments && post.comments.length > 0) {
          logger.info(`Processing ${post.comments.length} comments for post ${postData.reddit_id}`)
          for (const comment of post.comments) {
            if (!comment.content || !comment.content.trim()) {
              logger.debug(`Skipping comment without content for post ${postData.reddit_id}`)
              continue
            }
            if (!comment.id) {
              logger.warn(`Skipping comment without ID for post ${postData.reddit_id}`)
              continue
            }

            const commentData = {
              reddit_id: comment.id,
              post_reddit_id: postData.reddit_id,
              parent_comment_id: comment.parentId,
              subreddit: subredditName,
              author: comment.author || 'unknown',
              content: comment.content,
              created_utc: this.parseTimestamp(comment.timestamp),
              upvotes: comment.score || 0,
              downvotes: 0,
              score: comment.score || 0,
              depth: comment.depth || 0,
              is_submitter: false,
              tags: [],
            }

            try {
              await kb.storeComment(commentData)
              logger.info(`Stored comment ${comment.id} for post ${postData.reddit_id}`)
            } catch (error) {
              logger.error(
                `Failed to store comment ${comment.id} for post ${postData.reddit_id}:`,
                error
              )
            }
          }
        } else {
          logger.info(`No comments to process for post ${postData.reddit_id}`)
        }

        logger.info(
          `Processed and stored ${post.postType} post: ${post.title} with ${post.comments?.length || 0} comments`
        )
      } catch (error) {
        logger.error(`Failed to process post ${post.id}:`, error.message)
        logger.error('Full error details:', error)
      }
    }
  }

  async downloadAndAnalyzeImage(imageUrl, postContext = {}) {
    if (!this.imageAnalysisEnabled) {
      logger.debug('Image analysis disabled, skipping image download')
      return null
    }

    if (!imageUrl || !imageUrl.startsWith('http')) {
      logger.debug('Invalid image URL, skipping analysis')
      return null
    }

    try {
      logger.info(`Downloading and analyzing image: ${imageUrl}`)

      const response = await this.session.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          Accept: 'image/*',
          'User-Agent': this.userAgent,
        },
      })

      if (!response.data || response.data.length === 0) {
        logger.warn('Downloaded image is empty')
        return null
      }

      const imageBuffer = Buffer.from(response.data)

      if (imageBuffer.length > 10 * 1024 * 1024) {
        logger.warn(`Image too large (${imageBuffer.length} bytes), skipping analysis`)
        return null
      }

      logger.debug(`Downloaded image: ${imageBuffer.length} bytes`)

      const analysis = await this.imageAnalyzer.analyzeImage(imageBuffer)

      if (analysis && !analysis.error) {
        logger.info(`Image analysis complete: ${analysis.description.substring(0, 100)}...`)

        const altText = await this.imageAnalyzer.analyzeImageForAccessibility(imageBuffer)

        return {
          ...analysis,
          alt_text_generated: altText,
          analyzed_at: new Date().toISOString(),
          image_size_bytes: imageBuffer.length,
          post_context: {
            title: postContext.title,
            subreddit: postContext.subreddit,
          },
        }
      } else {
        logger.warn('Image analysis failed or returned error')
        return null
      }
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        logger.warn(`Image download failed - network error: ${error.message}`)
      } else if (error.response && error.response.status >= 400) {
        logger.warn(`Image download failed - HTTP ${error.response.status}: ${imageUrl}`)
      } else {
        logger.error(`Image analysis error: ${error.message}`)
      }
      return null
    }
  }

  async downloadAndAnalyzeVideo(videoUrl, postContext = {}, videoData = {}) {
    if (!process.env.VIDEO_ANALYSIS_ENABLED || process.env.VIDEO_ANALYSIS_ENABLED !== 'true') {
      logger.debug('Video analysis disabled, skipping video download')
      return null
    }

    if (!videoUrl || !videoUrl.startsWith('http')) {
      logger.debug('Invalid video URL, skipping analysis')
      return null
    }

    try {
      logger.info(`Downloading and analyzing video: ${videoUrl}`)

      const videosDir = path.join(process.cwd(), 'services', 'deep-search', 'temp', 'videos')
      const framesDir = path.join(videosDir, 'frames')
      await fs.mkdir(videosDir, { recursive: true })
      await fs.mkdir(framesDir, { recursive: true })

      const videoId = postContext.postId || Date.now().toString()
      const videoFilename = `${videoId}.%(ext)s`
      const videoTemplate = path.join(videosDir, videoFilename)

      let downloadedFile = null

      try {
        downloadedFile = await this.downloadVideoWithYtDlp(videoUrl, videoTemplate)
      } catch (ytDlpError) {
        logger.warn(`yt-dlp failed: ${ytDlpError.message}`)

        logger.info('Attempting manual Reddit video download as fallback...')
        downloadedFile = await this.downloadRedditVideoManually(videoUrl, videosDir, videoId)
      }

      if (!downloadedFile) {
        logger.warn('All video download methods failed')
        return null
      }

      const stats = await fs.stat(downloadedFile)
      logger.info(`Video downloaded: ${stats.size} bytes`)

      if (stats.size < 1000) {
        logger.warn(`Downloaded file too small (${stats.size} bytes), likely not a video file`)
        await fs.unlink(downloadedFile).catch(() => {})
        return null
      }

      if (stats.size > 50 * 1024 * 1024) {
        logger.warn(`Video too large (${stats.size} bytes), skipping analysis`)
        await fs.unlink(downloadedFile).catch(() => {})
        return null
      }

      const frames = await this.extractVideoFrames(downloadedFile, framesDir, videoId)

      if (frames.length === 0) {
        logger.warn('No frames extracted from video')
        return null
      }

      const videoAnalysis = await this.analyzeVideoFrames(frames, postContext, videoData)


      return {
        ...videoAnalysis,
        video_url: videoUrl,
        frames_analyzed: frames.length,
        video_size_bytes: stats.size,
        analyzed_at: new Date().toISOString(),
        post_context: {
          title: postContext.title,
          subreddit: postContext.subreddit,
          postId: postContext.postId,
        },
      }
    } catch (error) {
      logger.error(`Video analysis error: ${error.message}`)
      return null
    }
  }

  async downloadRedditVideoManually(originalUrl, videosDir, videoId) {
    try {
      const videoIdMatch = originalUrl.match(/v\.redd\.it\/([^\/\?]+)/)
      if (!videoIdMatch) {
        logger.warn('Could not extract video ID from Reddit URL')
        return null
      }

      const redditVideoId = videoIdMatch[1]
      logger.info(`Extracted Reddit video ID: ${redditVideoId}`)

      const possibleUrls = [
        `https://v.redd.it/${redditVideoId}/DASH_720.mp4`,
        `https://v.redd.it/${redditVideoId}/DASH_480.mp4`,
        `https://v.redd.it/${redditVideoId}/DASH_360.mp4`,
        `https://v.redd.it/${redditVideoId}/DASH_240.mp4`,
        `https://v.redd.it/${redditVideoId}/DASH_96.mp4`,
      ]

      for (const url of possibleUrls) {
        try {
          logger.debug(`Trying direct download: ${url}`)

          const response = await this.session.get(url, {
            responseType: 'stream',
            timeout: 30000,
            headers: {
              Accept: 'video/*',
              'User-Agent': this.userAgent,
            },
          })

          const videoPath = path.join(videosDir, `${videoId}.mp4`)
          const writer = require('fs').createWriteStream(videoPath)
          response.data.pipe(writer)

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
          })

          const stats = await fs.stat(videoPath)
          if (stats.size > 1000) {
            logger.info(`Successfully downloaded video manually: ${stats.size} bytes`)
            return videoPath
          } else {
            await fs.unlink(videoPath).catch(() => {})
          }
        } catch (error) {
          logger.debug(`Direct download failed for ${url}: ${error.message}`)
          continue
        }
      }

      logger.warn('Manual Reddit video download failed for all quality levels')
      return null
    } catch (error) {
      logger.error(`Error in manual Reddit video download: ${error.message}`)
      return null
    }
  }

  async downloadVideoWithYtDlp(videoUrl, outputTemplate) {
    return new Promise((resolve, reject) => {
      logger.info(`Using yt-dlp to download: ${videoUrl}`)

      const ytDlpArgs = [
        videoUrl,
        '-o',
        outputTemplate,
        '--no-playlist',
        '--format',
        'bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best',
        '--max-filesize',
        '50M',
        '--merge-output-format',
        'mp4',
        '--no-check-certificate',
        '--no-warnings',
        '--quiet',
        '--print',
        'after_move:filepath',
      ]

      logger.debug(`yt-dlp command: yt-dlp ${ytDlpArgs.join(' ')}`)

      const ytDlp = spawn('yt-dlp', ytDlpArgs)

      let stdout = ''
      let stderr = ''

      ytDlp.stdout.on('data', data => {
        stdout += data.toString()
      })

      ytDlp.stderr.on('data', data => {
        stderr += data.toString()
      })

      ytDlp.on('close', code => {
        if (code === 0) {
          const lines = stdout.trim().split('\n')
          const filename = lines[lines.length - 1].trim()

          if (filename && filename.length > 0 && !filename.startsWith('ERROR')) {
            logger.info(`yt-dlp downloaded video to: ${filename}`)
            resolve(filename)
          } else {
            logger.error('yt-dlp succeeded but no valid filename returned')
            logger.debug(`stdout: ${stdout}`)
            reject(new Error('No filename returned from yt-dlp'))
          }
        } else {
          logger.error(`yt-dlp failed with code ${code}`)
          logger.error(`stderr: ${stderr}`)
          logger.error(`stdout: ${stdout}`)

          if (stderr.includes('Requested format is not available')) {
            logger.info('Retrying with more permissive format selection...')
            this.downloadVideoWithYtDlpFallback(videoUrl, outputTemplate)
              .then(resolve)
              .catch(reject)
          } else {
            reject(new Error(`yt-dlp failed: ${stderr || stdout || 'Unknown error'}`))
          }
        }
      })

      ytDlp.on('error', error => {
        logger.error(`yt-dlp spawn error: ${error.message}`)
        reject(error)
      })
    })
  }

  async downloadVideoWithYtDlpFallback(videoUrl, outputTemplate) {
    return new Promise((resolve, reject) => {
      logger.info(`Using yt-dlp fallback method for: ${videoUrl}`)

      const ytDlpArgs = [
        videoUrl,
        '-o',
        outputTemplate,
        '--no-playlist',
        '--format',
        'best/bestvideo+bestaudio/worst',
        '--max-filesize',
        '50M',
        '--merge-output-format',
        'mp4',
        '--no-check-certificate',
        '--ignore-errors',
        '--no-warnings',
        '--quiet',
        '--print',
        'after_move:filepath',
      ]

      logger.debug(`yt-dlp fallback command: yt-dlp ${ytDlpArgs.join(' ')}`)

      const ytDlp = spawn('yt-dlp', ytDlpArgs)

      let stdout = ''
      let stderr = ''

      ytDlp.stdout.on('data', data => {
        stdout += data.toString()
      })

      ytDlp.stderr.on('data', data => {
        stderr += data.toString()
      })

      ytDlp.on('close', code => {
        if (code === 0) {
          const lines = stdout.trim().split('\n')
          const filename = lines[lines.length - 1].trim()

          if (filename && filename.length > 0 && !filename.startsWith('ERROR')) {
            logger.info(`yt-dlp fallback downloaded video to: ${filename}`)
            resolve(filename)
          } else {
            logger.error('yt-dlp fallback succeeded but no valid filename returned')
            reject(new Error('No filename returned from yt-dlp fallback'))
          }
        } else {
          logger.error(`yt-dlp fallback failed with code ${code}: ${stderr}`)
          reject(new Error(`yt-dlp fallback failed: ${stderr || 'Unknown error'}`))
        }
      })

      ytDlp.on('error', error => {
        logger.error(`yt-dlp fallback spawn error: ${error.message}`)
        reject(error)
      })
    })
  }

  async extractVideoFrames(videoPath, framesDir, videoId, maxFrames = 10) {
    return new Promise((resolve, reject) => {
      const framePattern = path.join(framesDir, `${videoId}_frame_%03d.jpg`)

      const ffmpeg = spawn('ffmpeg', [
        '-i',
        videoPath,
        '-vf',
        `fps=1/2,scale=640:480`,
        '-frames:v',
        maxFrames.toString(),
        '-q:v',
        '2',
        framePattern,
        '-y',
      ])

      let stderr = ''
      ffmpeg.stderr.on('data', data => {
        stderr += data.toString()
      })

      ffmpeg.on('close', async code => {
        if (code !== 0) {
          logger.error(`ffmpeg failed with code ${code}: ${stderr}`)
          resolve([])
          return
        }

        try {
          const files = await fs.readdir(framesDir)
          const frameFiles = files
            .filter(file => file.startsWith(`${videoId}_frame_`) && file.endsWith('.jpg'))
            .sort()
            .map(file => path.join(framesDir, file))

          logger.info(`Extracted ${frameFiles.length} frames from video`)
          resolve(frameFiles)
        } catch (error) {
          logger.error(`Error reading frames directory: ${error.message}`)
          resolve([])
        }
      })

      ffmpeg.on('error', error => {
        logger.error(`ffmpeg spawn error: ${error.message}`)
        resolve([])
      })
    })
  }

  async analyzeVideoFrames(framePaths, postContext = {}, videoData = {}) {
    const frameImages = []
    try {
      const maxFramesToAnalyze = 8 // Limit to avoid token limits

      for (let i = 0; i < Math.min(framePaths.length, maxFramesToAnalyze); i++) {
        try {
          const frameBuffer = await fs.readFile(framePaths[i])
          const resizedBuffer = await sharp(frameBuffer)
            .resize(512, 384, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer()

          const base64Image = resizedBuffer.toString('base64')
          frameImages.push({
            type: 'image',
            image: base64Image,
            mimeType: 'image/jpeg',
          })
        } catch (error) {
          logger.error(`Error processing frame ${framePaths[i]}: ${error.message}`)
        }
      }

      if (frameImages.length === 0) {
        logger.warn('No frames could be processed for analysis')
        return null
      }

      const contextInfo = {
        post: {
          title: postContext.title || 'Unknown',
          subreddit: postContext.subreddit || 'Unknown',
          content: postContext.content || '',
          author: postContext.author || 'Unknown',
          score: postContext.score || 0,
          flair: postContext.flair || 'None',
        },
        comments: postContext.comments || [],
      }

      let commentsContext = ''
      if (contextInfo.comments.length > 0) {
        const topComments = contextInfo.comments
          .filter(c => c.content && c.content.trim())
          .slice(0, 5) // Top 5 comments for context
          .map(
            c =>
              `- ${c.author} (${c.score} points): ${c.content.substring(0, 200)}${c.content.length > 200 ? '...' : ''}`
          )
          .join('\n')

        if (topComments) {
          commentsContext = `\n\nTop comments from users:\n${topComments}`
        }
      }

      const videoAnalysisSchema = z.object({
        description: z.string().describe('Detailed description of what happens in the video'),
        educational_content: z
          .string()
          .describe('Educational, informative, or learning-relevant information present'),
        visible_text: z
          .string()
          .describe('Any text, captions, or written content visible in the frames'),
        key_topics: z.array(z.string()).describe('Main themes, subjects, or topics covered'),
        student_relevance: z
          .number()
          .min(1)
          .max(10)
          .describe('Rating from 1-10 of relevance for students'),
        content_type: z
          .string()
          .describe(
            'Category of the video (lecture, tutorial, demonstration, discussion, entertainment, etc.)'
          ),
        summary: z.string().describe('Brief 2-3 sentence summary of the video content'),
        context_alignment: z
          .string()
          .describe('How well the video content matches the post title and comments context'),
        frame_count: z.number().describe('Number of frames analyzed'),
      })

      const prompt = `Analyze this video from Reddit post in r/${contextInfo.post.subreddit}.

**POST CONTEXT:**
- Title: "${contextInfo.post.title}"
- Content: "${contextInfo.post.content}"
- Author: ${contextInfo.post.author}
- Score: ${contextInfo.post.score} upvotes
- Flair: ${contextInfo.post.flair}${commentsContext}

**VIDEO DETAILS:**
The video has been broken down into ${frameImages.length} key frames for analysis.
Video metadata: ${JSON.stringify(videoData, null, 2)}

**ANALYSIS REQUIREMENTS:**
Based on the post context, comments, and video frames, please analyze the video content and provide:

1. **Description**: What happens in the video? Describe the main content, actions, and visual elements.
2. **Educational Content**: Any educational, informative, or learning-relevant information present.
3. **Visible Text**: Any text, captions, or written content visible in the frames.
4. **Key Topics**: Main themes, subjects, or topics covered (consider the post title and comments context).
5. **Student Relevance**: Rate from 1-10 how relevant this video is for students (consider educational value, study tips, career advice, academic content, etc.).
6. **Content Type**: Categorize the video (e.g., lecture, tutorial, demonstration, discussion, entertainment, etc.).
7. **Summary**: Brief 2-3 sentence summary of the video content that relates to the post context.
8. **Context Alignment**: How well does the video content match the post title and comments context?`

      const messages = [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...frameImages],
        },
      ]

      const { object: analysis } = await generateObject({
        model: google('gemini-flash-latest'),
        messages,
        schema: videoAnalysisSchema,
        maxTokens: 2000,
        temperature: 0.3,
      })

      analysis.frame_count = frameImages.length

      logger.info(`Video analysis completed: ${analysis.description?.substring(0, 100)}...`)
      logger.debug('Video analysis result:', JSON.stringify(analysis, null, 2))

      return analysis
    } catch (error) {
      logger.error('Error analyzing video frames:', error.message)

      return {
        description: 'Failed to analyze video content',
        educational_content: '',
        visible_text: '',
        key_topics: [],
        student_relevance: 1,
        content_type: 'unknown',
        summary: 'Video analysis failed due to processing error',
        context_alignment: 'Unable to determine alignment',
        frame_count: frameImages.length,
      }
    }
  }

  async cleanupVideoFiles(videoPath, framesDir) {
    try {
      await fs.unlink(videoPath).catch(() => {})

      const files = await fs.readdir(framesDir).catch(() => [])
      for (const file of files) {
        await fs.unlink(path.join(framesDir, file)).catch(() => {})
      }
    } catch (error) {
      logger.error(`Error cleaning up video files: ${error.message}`)
    }
  }
}

module.exports = RedditScraper
