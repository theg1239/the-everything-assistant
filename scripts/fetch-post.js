#!/usr/bin/env node
// scripts/scrape-reddit-post.js

require('dotenv').config()
const path = require('path')
const fetch = global.fetch || require('node-fetch')
const KnowledgeBase = require(path.join(__dirname, '..', 'services', 'deep-search', 'knowledge-base', 'knowledge-base'))

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: node scrape-reddit-post.js <reddit_post_url>')
    process.exit(1)
  }

  // ensure we hit the JSON endpoint
  const jsonUrl = url.endsWith('/') ? `${url}.json` : `${url}/.json`

  const kb = new KnowledgeBase()
  await kb.initialize()   // create tables/indexes if needed

  console.log(`Fetching ${jsonUrl}…`)
  const res = await fetch(jsonUrl, {
    headers: { 'User-Agent': 'KnowledgeBaseScraper/1.0' }
  })
  if (!res.ok) {
    console.error('Fetch error:', res.status, res.statusText)
    process.exit(1)
  }

  const [postListing, commentsListing] = await res.json()

  // upsert the main post
  const postData = postListing.data.children[0].data
  const postRowId = await kb.upsertRedditPost(postData)
  console.log(`✔ Stored post ${postData.id} as row ${postRowId}`)

  // recurse through comments
  async function recurse(list) {
    for (const node of list) {
      if (node.kind !== 't1') continue
      const comment = node.data
      const rowId = await kb.upsertRedditComment(comment)
      console.log(`  • comment ${comment.id} → row ${rowId}`)
      if (comment.replies && comment.replies.data) {
        await recurse(comment.replies.data.children)
      }
    }
  }

  console.log('Storing comments…')
  await recurse(commentsListing.data.children)

  console.log('All done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})