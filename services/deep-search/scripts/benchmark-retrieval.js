#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const KnowledgeBase = require('../knowledge-base/knowledge-base')

const BENCHMARK_QUERIES = [
  {
    query: 'how are placements for cse in vit vellore',
    mustTerms: ['placement', 'placements', 'cse', 'offer', 'lpa', 'job'],
  },
  {
    query: 'vit vellore hostel outing rules and curfew',
    mustTerms: ['hostel', 'outing', 'curfew', 'warden', 'gate'],
  },
  {
    query: 'best mess in vit vellore campus',
    mustTerms: ['mess', 'food', 'caterer', 'veg', 'non veg'],
  },
  {
    query: 'branch change cgpa required in vit vellore',
    mustTerms: ['branch', 'change', 'cgpa', 'gpa', 'transfer'],
  },
  {
    query: 'how strict is attendance in vit vellore',
    mustTerms: ['attendance', '75', 'debar', 'class', 'marks'],
  },
  {
    query: 'internship opportunities for vit students',
    mustTerms: ['internship', 'intern', 'ppo', 'company', 'resume'],
  },
  {
    query: 'cat 1 cat 2 fee difference in vit',
    mustTerms: ['cat', 'fee', 'tuition', 'category', 'payment', 'price', 'cost'],
  },
  {
    query: 'is vit vellore wifi blocked for sites',
    mustTerms: ['wifi', 'blocked', 'network', 'internet', 'vpn'],
  },
  {
    query: 'clubs to join in vit vellore for freshers',
    mustTerms: ['club', 'chapter', 'fresher', 'join', 'activity'],
  },
  {
    query: 'good food spots near vit vellore campus',
    mustTerms: ['food', 'spot', 'restaurant', 'cafe', 'mess'],
  },
]

const topK = Number.parseInt(process.env.RETRIEVAL_BENCH_TOP_K || '10', 10)
const fetchLimit = Number.parseInt(process.env.RETRIEVAL_BENCH_FETCH_LIMIT || '20', 10)

const normalize = text => String(text || '').toLowerCase()

function countMustTermHits(result, mustTerms) {
  const text = normalize(`${result.title || ''} ${result.content || ''}`)
  let hits = 0
  for (const term of mustTerms) {
    if (text.includes(term)) hits++
  }
  return hits
}

async function run() {
  const kb = new KnowledgeBase()
  await kb.initialize()

  let totalTwoPlusHits = 0
  let totalThreePlusHits = 0

  try {
    for (const item of BENCHMARK_QUERIES) {
      const results = await kb.search(item.query, fetchLimit)
      const topResults = results.slice(0, topK)

      const twoPlusHits = topResults.filter(result => countMustTermHits(result, item.mustTerms) >= 2).length
      const threePlusHits = topResults.filter(
        result => countMustTermHits(result, item.mustTerms) >= 3
      ).length

      totalTwoPlusHits += twoPlusHits
      totalThreePlusHits += threePlusHits

      console.log(`\n--- ${item.query}`)
      console.log(`top${topK}_2plus_hits=${twoPlusHits} top${topK}_3plus_hits=${threePlusHits}`)

      topResults.slice(0, 5).forEach((result, index) => {
        const title = String(result.title || '')
          .replace(/\s+/g, ' ')
          .slice(0, 100)
        const rankingScore = Number(result.rankingScore || 0).toFixed(3)
        const similarity = Number(result.similarity || 0).toFixed(3)
        const score = Number(result.score || 0)
        console.log(
          `${index + 1}. [${result.type}] sim=${similarity} score=${score} rank=${rankingScore} | ${title}`
        )
      })
    }

    console.log('\n=== Retrieval Benchmark Summary ===')
    console.log(`queries=${BENCHMARK_QUERIES.length}`)
    console.log(`total_top${topK}_2plus_hits=${totalTwoPlusHits}`)
    console.log(`total_top${topK}_3plus_hits=${totalThreePlusHits}`)
    console.log(
      `avg_top${topK}_2plus_hits=${(totalTwoPlusHits / BENCHMARK_QUERIES.length).toFixed(2)}`
    )
    console.log(
      `avg_top${topK}_3plus_hits=${(totalThreePlusHits / BENCHMARK_QUERIES.length).toFixed(2)}`
    )
  } finally {
    await kb.cleanup()
  }
}

run().catch(error => {
  console.error('Benchmark failed:', error)
  process.exit(1)
})
