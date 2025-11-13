/**
 * Test script for papers scrapers API approach
 * Tests both CodeChef and PaperVault APIs with a course name query
 */

import { scrapePapersCodeChef } from '../../lib/scrapers/papers-codechef'
import { scrapeVITPaperVault } from '../../lib/scrapers/vit-papervault'

async function testPapersAPIs() {
  console.log('='.repeat(80))
  console.log('Testing Papers Scrapers API Approach')
  console.log('='.repeat(80))

  // Test with a common course
  const testCourses = [
    { code: 'BMAT201L', name: 'Complex Variables and Linear Algebra' },
    { code: 'BCSE302L', name: 'Database Systems' },
    { code: 'BCSE101E', name: 'Computer Programming' },
  ]

  for (const testCourse of testCourses) {
    console.log('\n' + '-'.repeat(80))
    console.log(`Testing with course: ${testCourse.code} (${testCourse.name})`)
    console.log('-'.repeat(80))

    // Test CodeChef Papers API
    console.log('\n📚 Testing papers.codechefvit.com API...')
    console.log('Expected: Should use API approach and return results (or empty array)')
    console.log('Should NOT fall back to browser scraping unless API fails\n')

    const startCodeChef = Date.now()
    try {
      const codechefResult = await scrapePapersCodeChef(testCourse.code)
      const durationCodeChef = Date.now() - startCodeChef

      console.log('✅ CodeChef Result:')
      console.log(`   Success: ${codechefResult.success}`)
      console.log(`   Papers found: ${codechefResult.papers.length}`)
      console.log(`   Source: ${codechefResult.source}`)
      console.log(`   Search URL: ${codechefResult.searchUrl || 'N/A'}`)
      console.log(`   Duration: ${durationCodeChef}ms`)
      console.log(`   Error: ${codechefResult.error || 'None'}`)

      if (codechefResult.papers.length > 0) {
        console.log('\n   Sample papers:')
        codechefResult.papers.slice(0, 3).forEach((paper, idx) => {
          console.log(`   ${idx + 1}. ${paper.title}`)
          console.log(`      Type: ${paper.examType}, Year: ${paper.year}`)
          console.log(`      URL: ${paper.url.substring(0, 80)}...`)
        })
      }

      // Verify API approach was used (should be fast, < 5 seconds)
      if (durationCodeChef > 5000 && !codechefResult.error) {
        console.log(
          '\n   ⚠️  WARNING: Request took > 5s, might have used browser scraping fallback!'
        )
      } else {
        console.log('   ✓ Fast response indicates API approach was used')
      }
    } catch (error) {
      console.error('❌ CodeChef API test failed:', error)
    }

    // Test VIT PaperVault API
    console.log('\n📚 Testing vitpapervault.in API...')
    console.log('Expected: Should use API approach and return results (or empty array)')
    console.log('Should NOT fall back to browser scraping unless API fails\n')

    const startPaperVault = Date.now()
    try {
      const papervaultResult = await scrapeVITPaperVault(testCourse.code)
      const durationPaperVault = Date.now() - startPaperVault

      console.log('✅ PaperVault Result:')
      console.log(`   Success: ${papervaultResult.success}`)
      console.log(`   Papers found: ${papervaultResult.papers.length}`)
      console.log(`   Source: ${papervaultResult.source}`)
      console.log(`   Search URL: ${papervaultResult.searchUrl || 'N/A'}`)
      console.log(`   Duration: ${durationPaperVault}ms`)
      console.log(`   Error: ${papervaultResult.error || 'None'}`)

      if (papervaultResult.papers.length > 0) {
        console.log('\n   Sample papers:')
        papervaultResult.papers.slice(0, 3).forEach((paper, idx) => {
          console.log(`   ${idx + 1}. ${paper.title}`)
          console.log(`      Type: ${paper.examType}, Year: ${paper.year}`)
          console.log(`      URL: ${paper.url.substring(0, 80)}...`)
        })
      }

      // Verify API approach was used (should be fast, < 5 seconds)
      if (durationPaperVault > 5000 && !papervaultResult.error) {
        console.log(
          '\n   ⚠️  WARNING: Request took > 5s, might have used browser scraping fallback!'
        )
      } else {
        console.log('   ✓ Fast response indicates API approach was used')
      }
    } catch (error) {
      console.error('❌ PaperVault API test failed:', error)
    }

    console.log('\n' + '-'.repeat(80))
  }

  console.log('\n' + '='.repeat(80))
  console.log('Test Complete!')
  console.log('='.repeat(80))
  console.log('\nKey Indicators of Success:')
  console.log('  ✓ success: true (even with 0 papers means API worked)')
  console.log('  ✓ Fast response times (< 5 seconds)')
  console.log('  ✓ searchUrl present (indicates API endpoint was hit)')
  console.log('  ✓ No "falling back to browser scraping" messages')
  console.log('\nKey Indicators of Failure:')
  console.log('  ✗ success: false (API completely failed)')
  console.log('  ✗ Slow response times (> 5 seconds = browser scraping)')
  console.log('  ✗ No searchUrl (might indicate browser scraping was used)')
  console.log('='.repeat(80))
}

// Run the test
testPapersAPIs().catch(console.error)
