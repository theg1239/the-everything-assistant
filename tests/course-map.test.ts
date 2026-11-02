import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COURSE_MAP,
  MAX_COURSE_SEARCH_LIMIT,
  getCourseByCode,
  isCourseCodeFormat,
  normalizeCourseCode,
  searchCourseCatalog,
} from '../lib/course-map'

test('getCourseByCode is an exact lookup (case and whitespace only)', () => {
  assert.deepEqual(getCourseByCode('BCSE302L'), { code: 'BCSE302L', name: COURSE_MAP.BCSE302L })
  assert.deepEqual(getCourseByCode(' bcse 302l '), { code: 'BCSE302L', name: COURSE_MAP.BCSE302L })
  assert.equal(getCourseByCode('BCSE302'), null, 'no prefix matching')
  assert.equal(getCourseByCode('DBMS'), null, 'no acronym expansion')
  assert.equal(getCourseByCode('database systems'), null, 'no name matching')
})

test('normalizeCourseCode / isCourseCodeFormat validate the machine format only', () => {
  assert.equal(normalizeCourseCode(' bcse 302l'), 'BCSE302L')
  assert.equal(isCourseCodeFormat('BCSE302L'), true)
  assert.equal(isCourseCodeFormat('CSI2002'), true)
  assert.equal(isCourseCodeFormat('bmat101l'), true)
  assert.equal(isCourseCodeFormat('DSA'), false)
  assert.equal(isCourseCodeFormat('data structures'), false)
})

test('searchCourseCatalog is a case-insensitive substring search over codes and titles', () => {
  const byTitle = searchCourseCatalog('calculus')
  assert.ok(byTitle.results.some(course => course.code === 'BMAT101L'))
  assert.ok(
    byTitle.results.every(
      course =>
        course.name.toLowerCase().includes('calculus') ||
        course.code.toLowerCase().includes('calculus')
    )
  )

  const byCode = searchCourseCatalog('bmat10')
  assert.ok(byCode.results.length > 0)
  assert.ok(byCode.results.every(course => course.code.startsWith('BMAT10')))
})

test('searchCourseCatalog returns candidates in catalog order without expanding nicknames', () => {
  const codes = Object.keys(COURSE_MAP)
  const { results } = searchCourseCatalog('engineering', 50)
  const positions = results.map(course => codes.indexOf(course.code))
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b)
  )
  // Acronyms are not resolved: "DSA" only matches catalog text that literally contains it.
  for (const course of searchCourseCatalog('dsa').results) {
    assert.ok(`${course.code} ${course.name}`.toLowerCase().includes('dsa'))
  }
})

test('searchCourseCatalog reports the total and caps the result list', () => {
  const all = searchCourseCatalog('a', 1000)
  assert.equal(all.results.length, Math.min(all.total, MAX_COURSE_SEARCH_LIMIT))
  assert.equal(searchCourseCatalog('a', 3).results.length, 3)
  assert.deepEqual(searchCourseCatalog('   '), { total: 0, results: [] })
  assert.deepEqual(searchCourseCatalog('zzzz-not-a-course'), { total: 0, results: [] })
})

test('labelHasExamType compares scraped exam labels on alphanumerics only', async () => {
  const { labelHasExamType } = await import('../lib/scrapers/exam-type')
  assert.equal(labelHasExamType('CAT-1', 'cat1'), true)
  assert.equal(labelHasExamType('BCSE302L cat 2 slot A1', 'cat2'), true)
  assert.equal(labelHasExamType('FAT', 'fat'), true)
  assert.equal(labelHasExamType('CAT-2', 'cat1'), false)
  assert.equal(labelHasExamType(undefined, 'quiz'), false)
})
