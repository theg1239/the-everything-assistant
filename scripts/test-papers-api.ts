#!/usr/bin/env tsx
/**
 * Test script for papers scrapers API approach
 * Tests CodeChef, PaperVault, and ExamCooker APIs with a course name query
 * 
 * Run with: pnpm tsx scripts/test-papers-api.ts
 */

async function testPapersAPIs() {
  console.log('='.repeat(80))
  console.log('Testing Papers Scrapers API Approach')
  console.log('='.repeat(80))
  console.log('\nThis test verifies that:')
  console.log('1. API approach is used first (fast < 5s)')
  console.log('2. Browser scraping only triggers on API failure')
  console.log('3. All scrapers return success: true even with 0 papers\n')

  // Dynamic import to handle ESM/CommonJS
  const { scrapePapersCodeChef } = await import('../lib/scrapers/papers-codechef.js')
  const { scrapeVITPaperVault } = await import('../lib/scrapers/vit-papervault.js')
  const { scrapeExamCooker } = await import('../lib/scrapers/examcooker.js')

  // Test with common courses
  const testCourses = [
    { code: 'BMAT201L', name: 'Complex Variables and Linear Algebra' },
    { code: 'BCSE302L', name: 'Database Systems' },
  ]

  for (const testCourse of testCourses) {
    console.log('\n' + '-'.repeat(80))
    console.log(`Testing: ${testCourse.code} (${testCourse.name})`)
    console.log('-'.repeat(80))

    // Test CodeChef Papers API
    console.log('\n📚 Testing papers.codechefvit.com API...')
    const startCodeChef = Date.now()
    try {
      const result = await scrapePapersCodeChef(testCourse.code)
      const duration = Date.now() - startCodeChef

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
        result.papers.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`   ${i + 1}. ${p.title} (${p.examType}, ${p.year})`)
        })
      }

      // Check if API was used (fast response)
      if (duration < 5000) {
        console.log(`   ✓ Fast response → API approach used ✓`)
      } else {
        console.log(`   ⚠️  Slow response (${duration}ms) → Possible browser fallback`)
      }
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`)
    }

    // Test VIT PaperVault API
    console.log('\n📚 Testing vitpapervault.in API...')
    const startVault = Date.now()
    try {
      const result = await scrapeVITPaperVault(testCourse.code)
      const duration = Date.now() - startVault

      console.log(`   ✅ Success: ${result.success}`)
      console.log(`   📄 Papers: ${result.papers.length}`)
      console.log(`   🌐 Source: ${result.source}`)
      console.log(`   🔗 URL: ${(result as any).searchUrl || 'N/A'}`)
      console.log(`   ⏱️  Duration: ${duration}ms`)
      
      if ((result as any).error) {
        console.log(`   ⚠️  Error: ${(result as any).error}`)
      }

      if (result.papers.length > 0) {
        console.log(`\n   Top 3 papers:`)
        result.papers.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`   ${i + 1}. ${p.title} (${p.examType}, ${p.year})`)
        })
      }

      // Check if API was used (fast response)
      if (duration < 5000) {
        console.log(`   ✓ Fast response → API approach used ✓`)
      } else {
        console.log(`   ⚠️  Slow response (${duration}ms) → Possible browser fallback`)
      }
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`)
    }
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

// Run test
testPapersAPIs().catch(console.error)
    // Test ExamCooker API
    console.log('\n📚 Testing examcooker.acmvit.in API...')
    const startExamCooker = Date.now()
    try {
      const result = await scrapeExamCooker(testCourse.code)
      const duration = Date.now() - startExamCooker

      console.log(`   ✅ Success: ${result.success}`)
      console.log(`   📄 Papers: ${result.papers.length}`)
      console.log(`   🌐 Source: ${result.source}`)
      console.log(`   🔗 URL: ${result.searchUrl || 'N/A'}`)
      console.log(`   ⏱️  Duration: ${duration}ms`)

      if ((result as any).error) {
        console.log(`   ⚠️  Error: ${(result as any).error}`)
      }

      if (result.papers.length > 0) {
        console.log(`\n   Top 3 papers:`)
        result.papers.slice(0, 3).forEach((p: any, i: number) => {
          console.log(`   ${i + 1}. ${p.title} (${p.examType}, ${p.year})`)
        })
      }

      if (duration < 5000) {
        console.log(`   ✓ Fast response → API approach used ✓`)
      } else {
        console.log(`   ⚠️  Slow response (${duration}ms) → Possible timeout or fallback`)
      }
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`)
    }
