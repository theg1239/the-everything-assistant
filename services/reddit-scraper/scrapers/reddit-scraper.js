require('dotenv').config();

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { generateText, embed } = require('ai');
const { google } = require('@ai-sdk/google');
const ImageAnalyzer = require('./image-analyzer');

class RedditScraper {
  constructor() {
    this.baseUrl = 'https://www.reddit.com';
    this.userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
    this.session = axios.create({
      timeout: 30000,
      headers: { 'User-Agent': this.userAgent }
    });
    this.embeddingModel = google.embedding('text-embedding-004');
    this.embeddingDim = 768;
    this.imageAnalyzer = new ImageAnalyzer();
    this.imageAnalysisEnabled = process.env.IMAGE_ANALYSIS_ENABLED === 'true';

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY environment variable is required'
      );
    }

    this.sessionData = {
      cookies: null,
      navigationSessionId: null,
      csrfToken: null,
      loid: null,
      tokenV2: null,
      sessionTracker: null
    };
  }
  async scrapeSubreddit(subreddit, options = {}) {
    try {
      const {
        limit = 25,
        sort = 'best',
        timeframe = 'DAY',
        includeComments = true,
        maxCommentsPerPost = 50
      } = options;

      logger.info(`Starting scrape of r/${subreddit} with ${limit} posts`);
      await this.initializeSession(subreddit);

      const posts = await this.fetchPosts(subreddit, {
        limit,
        sort,
        timeframe
      });

      logger.info(`Found ${posts.length} posts`);
      if (includeComments) {
        for (const post of posts) {
          try {
            post.comments = await this.fetchComments(
              subreddit,
              post.id,
              maxCommentsPerPost
            );
            logger.info(
              `Fetched ${post.comments.length} comments for post ${post.id}`
            );
            await new Promise((r) => setTimeout(r, 1000));
          } catch (err) {
            logger.error(
              `Failed to fetch comments for post ${post.id}:`,
              err.message
            );
            post.comments = [];
          }
        }
      }

      return posts;
    } catch (error) {
      logger.error('Error scraping subreddit:', error);
      throw error;
    }
  }

  async initializeSession(subreddit) {
    try {
      logger.info(`Initializing session for r/${subreddit}`);
      const response = await this.session.get(
        `${this.baseUrl}/r/${subreddit}/`,
        {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Ch-Ua':
              '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Gpc': '1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0'
          }
        }
      );

      const $ = cheerio.load(response.data);
      let navigationSessionId = null;
      let csrfToken = null;

      $('script').each((_, script) => {
        const content = $(script).html();
        if (content) {
          const navMatch = content.match(
            /navigationSessionId['"]\s*:\s*['"]([^'"]+)['"]/
          );
          if (navMatch) navigationSessionId = navMatch[1];
          const csrfMatch = content.match(
            /csrf_token['"]\s*:\s*['"]([^'"]+)['"]/
          );
          if (csrfMatch) csrfToken = csrfMatch[1];
        }
      });

      const setCookies = response.headers['set-cookie'];
      let cookieString = '';
      if (setCookies) {
        const cookieMap = new Map();
        setCookies.forEach((cookie) => {
          const [nv] = cookie.split(';');
          const [name, val] = nv.split('=');
          if (name && val) cookieMap.set(name.trim(), val.trim());
        });
        cookieString = Array.from(cookieMap.entries())
          .map(([n, v]) => `${n}=${v}`)
          .join('; ');
        this.sessionData.loid = cookieMap.get('loid');
        this.sessionData.tokenV2 = cookieMap.get('token_v2');
        this.sessionData.sessionTracker = cookieMap.get('session_tracker');
      }

      this.sessionData.navigationSessionId =
        navigationSessionId || this.generateSessionId();
      this.sessionData.csrfToken = csrfToken;
      this.sessionData.cookies = cookieString;
      this.session.defaults.headers['Cookie'] = cookieString;

      logger.info('Session initialized successfully', {
        hasNavigationSessionId: !!this.sessionData.navigationSessionId,
        hasCsrfToken: !!this.sessionData.csrfToken,
        cookieCount: cookieString.split(';').length
      });

      return this.sessionData;
    } catch (error) {
      logger.error('Failed to initialize session:', error.message);
      throw error;
    }
  }

  generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }  async fetchPosts(subreddit, options = {}) {
    try {
      const { 
        limit = 25, 
        sort = 'best',
        timeframe = 'DAY',
        maxPages = parseInt(process.env.MAX_PAGES_PER_SUBREDDIT) || 10 
      } = options;
      
      let allPosts = [];
      let after = null;
      let feedLength = 4;
      let distance = 0;
      let adPostsServed = 1;
      let adDistance = 1;
      const seenPostIds = new Set();
      let consecutiveEmpty = 0;
      let pageCount = 0;
      const maxEmpty = 3;

      logger.info(`Starting to fetch posts from r/${subreddit} (limit: ${limit}, maxPages: ${maxPages}, sort: ${sort})`);

      while (allPosts.length < limit && consecutiveEmpty < maxEmpty && pageCount < maxPages) {
        pageCount++;
        const url = `${this.baseUrl}/svc/shreddit/community-more-posts/${sort}/`;
        const params = new URLSearchParams({
          t: timeframe,
          name: subreddit,
          navigationSessionId: this.sessionData.navigationSessionId,
          feedLength: feedLength.toString()
        });

        if (after) {
          params.append('after', after);
          params.append('distance', distance.toString());
          params.append('ad_posts_served', adPostsServed.toString());
          params.append('adDistance', adDistance.toString());
        } else {
          params.append('adDistance', '1');
          params.append('ad_posts_served', '1');
        }

        logger.info(`Page ${pageCount}: Fetching posts from: ${url}?${params.toString()}`);
        logger.debug(`Pagination state: after="${after || 'none'}", feedLength=${feedLength}, distance=${distance}`);
        
        const rsp = await this.session.get(`${url}?${params}`, {
          headers: {
            Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9',
            'Accept-Language': 'en-US,en;q=0.8',
            'Content-Type': 'application/x-www-form-urlencoded',
            Priority: 'u=1, i',
            'Sec-Ch-Ua':
              '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Gpc': '1',
            Referer: `${this.baseUrl}/r/${subreddit}/`,
            'Referrer-Policy': 'strict-origin-when-cross-origin'
          }
        });        const posts = this.parsePosts(rsp.data);
        logger.info(`Page ${pageCount}: Parsed ${posts.length} posts from response`);
        
        if (posts.length > 0) {
          const firstFewIds = posts.slice(0, 3).map(p => p.id).join(', ');
          logger.debug(`Page ${pageCount}: First few post IDs: ${firstFewIds}`);
        }
        
        if (posts.length === 0) {
          consecutiveEmpty++;
          logger.warn(`Page ${pageCount}: No posts found (consecutiveEmpty: ${consecutiveEmpty}/${maxEmpty})`);
          if (consecutiveEmpty >= maxEmpty) {
            logger.info('Breaking due to consecutive empty responses');
            break;
          }
        } else {
          consecutiveEmpty = 0;
        }

        const newOnes = posts.filter((p) => {
          if (seenPostIds.has(p.id)) {
            logger.debug(`Skipping duplicate post: ${p.id}`);
            return false;
          }
          seenPostIds.add(p.id);
          return true;
        });
        
        logger.info(`Page ${pageCount}: Found ${newOnes.length} new posts (${posts.length - newOnes.length} duplicates)`);
        
        if (newOnes.length === 0 && posts.length > 0) {
          logger.warn('All posts on this page are duplicates - this might indicate pagination issues');
          if (pageCount === 2 && sort === 'best') {
            logger.info('Switching to "hot" sort to try different pagination');
          }
          break;
        }

        allPosts = allPosts.concat(newOnes);
        
        feedLength += posts.length;
        distance = feedLength - 4;

        const $ = cheerio.load(rsp.data);
        const lastPost = $('shreddit-post').last();
        const newAfter = lastPost.length ? this.extractPaginationToken(rsp.data, lastPost) : null;
        
        logger.debug(`Page ${pageCount}: Extracted pagination token: ${newAfter ? newAfter.substring(0, 30) + '...' : 'none'}`);
        
        if (!newAfter) {
          logger.info('No more pagination token found, ending pagination');
          break;
        }
        
        if (newAfter === after) {
          logger.warn('Pagination token unchanged, ending pagination to prevent infinite loop');
          break;
        }
        
        after = newAfter;
        
        if (pageCount > 1) {
          adDistance = Math.min(adDistance + 1, 2);
        }
        
        await new Promise((r) => setTimeout(r, 500));
      }

      logger.info(
        `Pagination complete for r/${subreddit}: ${allPosts.length} unique posts collected from ${pageCount} pages (${seenPostIds.size} total seen)`
      );
      
      if (pageCount >= maxPages) {
        logger.info(`Reached maximum page limit (${maxPages})`);
      }
      
      return allPosts.slice(0, limit);
    } catch (error) {
      logger.error('Error fetching posts:', error.message);
      throw error;
    }
  }  extractPaginationToken(html, lastPost) {
    try {
      let postId = lastPost.attr('id');
      
      if (!postId) {
        postId = lastPost.attr('thingid') || lastPost.attr('thing-id') || lastPost.attr('post-id');
      }
      
      if (!postId) {
        const htmlStr = lastPost.toString();
        const idMatch = htmlStr.match(/id="([^"]+)"/);
        if (idMatch) postId = idMatch[1];
      }
      
      if (!postId) {
        const $ = require('cheerio').load(html);
        const allPosts = $('shreddit-post');
        if (allPosts.length > 0) {
          const lastPostHtml = allPosts.last().toString();
          const t3Match = lastPostHtml.match(/t3_([a-zA-Z0-9]+)/);
          if (t3Match) postId = t3Match[1];
        }
      }
      
      if (postId) {
        const cleanId = postId.replace(/^t3_/, '');
        const token = Buffer.from(`t3_${cleanId}`).toString('base64');
        logger.debug(`Extracted pagination token from post ID: ${cleanId} -> ${token}`);
        return token;
      }
      
      logger.warn('Could not extract pagination token - no post ID found');
      return null;
    } catch (error) {
      logger.error('Error extracting pagination token:', error.message);
      return null;
    }
  }

  parsePosts(html) {
    try {
      const $ = cheerio.load(html);
      const posts = [];
      $('shreddit-post').each((_, el) => {
        try {
          const $post = $(el);
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
            authorIcon: $post.attr('icon')
          };

          const txt = $post.find('[slot="text-body"]');
          if (txt.length) {
            const c =
              txt.find('.md').text().trim() || txt.text().trim();
            if (c) post.content = c;
          }

          const flair = $post.find('shreddit-post-flair .flair-content');
          if (flair.length) post.flair = flair.text().trim();          if (post.postType === 'image') {
            let img = null;
            
            const contentImg = $post.find('[slot="media"] img, .media-container img, .image-container img').first();
            if (contentImg.length) {
              img = contentImg;
            } else {
              const allImages = $post.find('img');
              img = allImages.filter((i, elem) => {
                const src = $(elem).attr('src') || '';
                const alt = $(elem).attr('alt') || '';
                
                return !src.includes('snoovatar') && 
                       !src.includes('avatar') && 
                       !src.includes('icon') &&
                       !src.includes('emoji') &&
                       !alt.toLowerCase().includes('avatar') &&
                       !alt.toLowerCase().includes('icon') &&
                       !alt.toLowerCase().includes('user') &&
                       src.length > 50;
              }).first();
            }
            
            if (img && img.length) {
              const imageUrl = img.attr('src');
              const imageAlt = img.attr('alt');
              
              if (imageUrl && 
                  (imageUrl.includes('i.redd.it') || 
                   imageUrl.includes('preview.redd.it') || 
                   imageUrl.includes('external-preview.redd.it')) &&
                  !imageUrl.includes('snoovatar')) {
                post.imageUrl = imageUrl;
                post.imageAlt = imageAlt;
              }
            }
          }else if (post.postType === 'video') {
            const vid = $post.find('shreddit-player-2');
            if (vid.length) {
              post.videoSrc = vid.attr('src');
              post.poster = vid.attr('poster');
              const pkg = vid.attr('packaged-media-json');
              if (pkg) {
                try {
                  post.videoMetadata = JSON.parse(
                    pkg.replace(/&quot;/g, '"')
                  );
                } catch {}
              }
            }
          }

          if (
            post.postType === 'link' ||
            post.domain !== `self.${post.subreddit}`
          ) {
            post.url = post.contentHref;
          }

          posts.push(post);
        } catch (err) {
          logger.error('Error parsing individual post:', err.message);
        }
      });

      logger.info(`Parsed ${posts.length} posts from HTML`);
      return posts;
    } catch (error) {
      logger.error('Error parsing posts HTML:', error.message);
      return [];
    }
  }

  async fetchComments(subreddit, postId, maxComments = 50) {
    try {
      const clean = postId.replace(/^t3_/, '');
      const url = `${this.baseUrl}/svc/shreddit/comments/r/${subreddit}/${clean}`;
      const params = new URLSearchParams({
        'render-mode': 'partial'
      });

      logger.info(`Fetching comments from: ${url}?${params}`);
      const rsp = await this.session.get(`${url}?${params}`, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.8',
          Priority: 'u=1, i',
          'Sec-Ch-Ua':
            '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Gpc': '1',
          Referer: `${this.baseUrl}/r/${subreddit}/comments/${clean}/`,
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        }
      });

      return this.parseComments(rsp.data, maxComments);
    } catch (error) {
      logger.error(
        `Error fetching comments for post ${postId}:`,
        error.message
      );
      return [];
    }
  }  parseComments(html, maxComments = 50) {
    try {
      const $ = cheerio.load(html);
      const comments = [];
      $('shreddit-comment').each((_, el) => {
        if (comments.length >= maxComments) return false;
        try {          const $c = $(el);
          
          let commentId = $c.attr('thingId') || $c.attr('thingid') || $c.attr('thing-id') || $c.attr('commentid') || $c.attr('id');
          
          if (!commentId && el.attribs) {
            commentId = el.attribs.thingId || el.attribs.thingid || el.attribs['thing-id'];
          }
          
          if (!commentId) {
            const htmlStr = $.html($c);
            const thingIdMatch = htmlStr.match(/thingId="([^"]+)"/i);
            if (thingIdMatch) {
              commentId = thingIdMatch[1];
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
            ariaLabel: $c.attr('ariaLabel')
          };

          const cc = $c.find('[slot="comment"]');
          if (cc.length) {
            const text =
              cc.find('.md').text().trim() || cc.text().trim();
            if (text) comment.content = text;
          }

          const timeago = $c.find('faceplate-timeago');
          if (timeago.length) comment.timestamp = timeago.attr('ts');

          const act = $c.find('shreddit-comment-action-row');
          if (act.length) comment.voteState = act.attr('vote-state');

          const av = $c.find('[slot="commentAvatar"] img');
          if (av.length) comment.authorIcon = av.attr('src');

          if (comment.content && comment.id) {
            comments.push(comment);
          }
        } catch (err) {
          logger.error('Error parsing individual comment:', err.message);
        }
      });

      logger.info(`Parsed ${comments.length} comments from HTML`);
      return comments;
    } catch (error) {
      logger.error('Error parsing comments HTML:', error.message);
      return [];
    }
  }

  async analyzeContent(content) {
    try {
      const prompt = `Analyze this Reddit content and extract key topics, sentiment, and important information for a student knowledge base:

Content: ${content}

Please provide:
1. Key topics and themes
2. Sentiment (positive/negative/neutral)
3. Important keywords
4. Brief summary
5. Relevance to students (high/medium/low)

Format as JSON.`;

      const { text } = await generateText({
        model: google('gemini-2.0-flash-lite'),
        prompt,
        maxTokens: 1000,
        temperature: 0.3
      });

      try {
        return JSON.parse(text);
      } catch {
        return {
          summary: text.substring(0, 500),
          sentiment: 'neutral',
          relevance: 'medium',
          keywords: [],
          topics: []
        };
      }
    } catch (error) {
      logger.error('Error analyzing content:', error.message);
      return null;
    }
  }

  async generateEmbedding(text) {
    if (!text || !text.trim()) {
      return new Array(this.embeddingDim).fill(0);
    }
    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text.substring(0, 8000)
      });
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error.message);
      return new Array(this.embeddingDim).fill(0);
    }
  }

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  async scrapeAllTargetSubreddits() {
    const targetSubreddits = (process.env.TARGET_SUBREDDITS || 'Vit')
      .split(',')
      .map((s) => s.trim());
    const maxPostsPerSubreddit =
      parseInt(process.env.MAX_POSTS_PER_SUBREDDIT) || 50;
    const maxPagesPerSubreddit = 
      parseInt(process.env.MAX_PAGES_PER_SUBREDDIT) || 10;

    logger.info(`Starting scraping of all target subreddits (${targetSubreddits.length} subreddits, max ${maxPostsPerSubreddit} posts each, max ${maxPagesPerSubreddit} pages each)`);
    
    for (const subreddit of targetSubreddits) {
      if (!subreddit) continue;
      try {
        logger.info(`Starting scrape of r/${subreddit}`);
        const posts = await this.scrapeSubreddit(subreddit, {
          limit: maxPostsPerSubreddit,
          includeComments: true,
          maxPages: maxPagesPerSubreddit
        });
        logger.info(`Scraped ${posts.length} posts from r/${subreddit}, now processing...`);
        await this.processPosts(posts, subreddit);
        logger.info(`Completed processing r/${subreddit}`);
        await this.delay(2000);
      } catch (error) {
        logger.error(`Failed to scrape subreddit ${subreddit}:`, error);
      }
    }
    logger.info('Completed scraping all target subreddits');
  }

  async processPosts(posts, subredditName) {
    const KnowledgeBase = require('../knowledge-base/knowledge-base');
    const kb = new KnowledgeBase();
    await kb.initialize();    for (const post of posts) {
      try {
        if (posts.indexOf(post) === 0) {
          logger.info(`Debug: First post structure - ID: ${post.id}, Comments: ${post.comments?.length || 0}`);
          if (post.comments && post.comments.length > 0) {
            logger.info(`Debug: First comment - ID: ${post.comments[0].id}, Content: ${post.comments[0].content?.substring(0, 50)}...`);
          }
        }
        
        const minUpvotesThreshold =
          parseInt(process.env.MIN_UPVOTES_THRESHOLD) || 5;
        if (post.score < minUpvotesThreshold) continue;        const postData = {
          reddit_id: post.id,
          subreddit: subredditName,
          title: post.title,
          content: post.content || '',
          author: post.author,
          created_utc: new Date(
            parseInt(post.createdTimestamp) * 1000
          ),
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
          tags: post.flair ? [post.flair] : []
        };        if (post.postType === 'image' && post.imageUrl) {
          const isValidImageUrl = post.imageUrl && 
            !post.imageUrl.includes('snoovatar') &&
            !post.imageUrl.includes('/avatars/') &&
            !post.imageUrl.includes('icon') &&
            !post.imageUrl.includes('emoji') &&
            (post.imageUrl.includes('i.redd.it') || 
             post.imageUrl.includes('preview.redd.it') || 
             post.imageUrl.includes('external-preview.redd.it')) &&
            post.imageUrl.length > 100;
          
          if (isValidImageUrl) {
            logger.info(`Analyzing image for post ${post.id}: ${post.imageUrl}`);
            try {
              const imageAnalysis = await this.downloadAndAnalyzeImage(post.imageUrl, {
                title: post.title,
                subreddit: subredditName
              });
              
              if (imageAnalysis) {
                postData.images = [{
                  url: post.imageUrl,
                  alt: post.imageAlt || '',
                  analysis: imageAnalysis
                }];
                
                const imageText = [
                  imageAnalysis.description,
                  imageAnalysis.visible_text,
                  imageAnalysis.educational_content
                ].filter(text => text && text.trim()).join(' ');
                
                if (imageText) {
                  postData.extracted_text = [postData.extracted_text, imageText].filter(Boolean).join(' ');
                }
                  logger.info(`Image analysis completed for post ${post.id}: relevance=${imageAnalysis.student_relevance}/10`);
              } else {
                logger.info(`No image analysis result for post ${post.id}`);
                postData.images = [{
                  url: post.imageUrl,
                  alt: post.imageAlt || '',
                  analysis: null
                }];
              }
            } catch (error) {
              logger.error(`Failed to analyze image for post ${post.id}:`, error.message);
              postData.images = [{
                url: post.imageUrl,
                alt: post.imageAlt || '',
                analysis: null,
                error: error.message
              }];
            }
          } else if (post.postType === 'image' && post.imageUrl) {
            logger.info(`Skipping image analysis for post ${post.id}: invalid image URL (likely avatar or UI element): ${post.imageUrl}`);
          }
        }

        const postId = await kb.storePost(postData);

        if (post.comments && post.comments.length > 0) {
          logger.info(`Processing ${post.comments.length} comments for post ${postData.reddit_id}`);
          for (const comment of post.comments) {
            if (!comment.content || !comment.content.trim()) {
              logger.debug(`Skipping comment without content for post ${postData.reddit_id}`);
              continue;
            }
            if (!comment.id) {
              logger.warn(`Skipping comment without ID for post ${postData.reddit_id}`);
              continue;
            }
            
            const commentData = {
              reddit_id: comment.id,
              post_reddit_id: postData.reddit_id,
              parent_comment_id: comment.parentId,
              subreddit: subredditName,
              author: comment.author || 'unknown',
              content: comment.content,
              created_utc: comment.timestamp
                ? new Date(parseInt(comment.timestamp) * 1000)
                : new Date(),
              upvotes: comment.score || 0,
              downvotes: 0,
              score: comment.score || 0,
              depth: comment.depth || 0,
              is_submitter: false,
              tags: []
            };
            
            try {
              await kb.storeComment(commentData);
              logger.info(`Stored comment ${comment.id} for post ${postData.reddit_id}`);
            } catch (error) {
              logger.error(`Failed to store comment ${comment.id} for post ${postData.reddit_id}:`, error);
            }
          }
        } else {
          logger.info(`No comments to process for post ${postData.reddit_id}`);
        }        logger.info(
          `Processed and stored post: ${post.title} with ${
            post.comments?.length || 0
          } comments`
        );
      } catch (error) {
        logger.error(`Failed to process post ${post.id}:`, error.message);
        logger.error('Full error details:', error);
      }
    }
  }

  async downloadAndAnalyzeImage(imageUrl, postContext = {}) {
    if (!this.imageAnalysisEnabled) {
      logger.debug('Image analysis disabled, skipping image download');
      return null;
    }

    if (!imageUrl || !imageUrl.startsWith('http')) {
      logger.debug('Invalid image URL, skipping analysis');
      return null;
    }

    try {
      logger.info(`Downloading and analyzing image: ${imageUrl}`);
      
      const response = await this.session.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'Accept': 'image/*',
          'User-Agent': this.userAgent
        }
      });

      if (!response.data || response.data.length === 0) {
        logger.warn('Downloaded image is empty');
        return null;
      }

      const imageBuffer = Buffer.from(response.data);
      
      if (imageBuffer.length > 10 * 1024 * 1024) {
        logger.warn(`Image too large (${imageBuffer.length} bytes), skipping analysis`);
        return null;
      }

      logger.debug(`Downloaded image: ${imageBuffer.length} bytes`);

      const analysis = await this.imageAnalyzer.analyzeImage(imageBuffer);
      
      if (analysis && !analysis.error) {
        logger.info(`Image analysis complete: ${analysis.description.substring(0, 100)}...`);
        
        const altText = await this.imageAnalyzer.analyzeImageForAccessibility(imageBuffer);
        
        return {
          ...analysis,
          alt_text_generated: altText,
          analyzed_at: new Date().toISOString(),
          image_size_bytes: imageBuffer.length,
          post_context: {
            title: postContext.title,
            subreddit: postContext.subreddit
          }
        };
      } else {
        logger.warn('Image analysis failed or returned error');
        return null;
      }

    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        logger.warn(`Image download failed - network error: ${error.message}`);
      } else if (error.response && error.response.status >= 400) {
        logger.warn(`Image download failed - HTTP ${error.response.status}: ${imageUrl}`);
      } else {
        logger.error(`Image analysis error: ${error.message}`);
      }
      return null;
    }
  }
}

module.exports = RedditScraper;
