#!/usr/bin/env tsx

import { scrapePapersCodeChef } from '../lib/scrapers/papers-codechef'
import { scrapeVITPaperVault } from '../lib/scrapers/vit-papervault'
import { scrapeExamCooker } from '../lib/scrapers/examcooker'

type ScraperOutcome = {
  success: boolean
  papers: ReadonlyArray<{ title: string; examType: string; year: string }>
  source?: string
  searchUrl?: string
  error?: string
}

async function testScraper(
  label: string,
  slowHint: string,
  run: () => Promise<ScraperOutcome | undefined>
) {
  console.log(`\n📚 Testing ${label}...`)
  const started = Date.now()
  try {
    const result = await run()
    const duration = Date.now() - started

    if (!result) {
      console.log(`   ⚠️  No result returned`)
      return
    }

    console.log(`   ✅ Success: ${result.success}`)
    console.log(`   📄 Papers: ${result.papers.length}`)
    console.log(`   🌐 Source: ${result.source}`)
    console.log(`   🔗 URL: ${result.searchUrl || 'N/A'}`)
    console.log(`   ⏱️  Duration: ${duration}ms`)

    if (result.error) {
      console.log(`   ⚠️  Error: ${result.error}`)
    }

    if (result.papers.length > 0) {
      console.log(`\n   Top 3 papers:`)
      result.papers.slice(0, 3).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.title} (${p.examType}, ${p.year})`)
      })
    }

    if (duration < 5000) {
      console.log(`   ✓ Fast response → API approach used ✓`)
    } else {
      console.log(`   ⚠️  Slow response (${duration}ms) → ${slowHint}`)
    }
  } catch (error) {
    console.error(`   ❌ Failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function testPapersAPIs() {
  console.log('='.repeat(80))
  console.log('Testing Papers Scrapers API Approach')
  console.log('='.repeat(80))
  console.log('\nThis test verifies that:')
  console.log('1. API approach is used first (fast < 5s)')
  console.log('2. Browser scraping only triggers on API failure')
  console.log('3. All scrapers return success: true even with 0 papers\n')

  const testCourses = [
    { code: 'BMAT201L', name: 'Complex Variables and Linear Algebra' },
    { code: 'BCSE302L', name: 'Database Systems' },
  ]

  for (const testCourse of testCourses) {
    console.log('\n' + '-'.repeat(80))
    console.log(`Testing: ${testCourse.code} (${testCourse.name})`)
    console.log('-'.repeat(80))

    await testScraper('papers.codechefvit.com API', 'Possible browser fallback', () =>
      scrapePapersCodeChef(testCourse.code)
    )
    await testScraper('vitpapervault.in API', 'Possible browser fallback', () =>
      scrapeVITPaperVault(testCourse.code)
    )
    await testScraper('examcooker.acmvit.in API', 'Possible timeout or fallback', () =>
      scrapeExamCooker(testCourse.code)
    )
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ Test Complete!')
  console.log('='.repeat(80))
  console.log('\n✓ Expected Results:')
  console.log('  • success: true (even with 0 papers)')
  console.log('  • Fast response times (< 5 seconds)')
  console.log('  • searchUrl present (API endpoint hit)')
  console.log('  • No browser scraping fallback messages')
  console.log('\n✗ Failure Indicators:')
  console.log('  • success: false (complete API failure)')
  console.log('  • Slow responses (> 5 seconds)')
  console.log('  • Missing searchUrl')
  console.log('='.repeat(80))
}

testPapersAPIs().catch(console.error)
