'use strict'

/**
 * Proxy-side matching of natural-language hints ("CSE1001", "dsa", "anuj kumar", "module 2",
 * "previous semester") against the option tables cli-top emits. Used to auto-advance a
 * workflow when the user's request already identifies an option, so the client only sees a
 * question when the answer is genuinely ambiguous.
 */

const FILLER = new Set([
  'the', 'of', 'and', 'for', 'a', 'an', 'in', 'to', 'by', 'with', 'on', 'my',
  'dr', 'prof', 'professor', 'sir', 'mam', 'maam', 'mr', 'mrs', 'ms',
  'notes', 'slides', 'materials', 'material', 'download', 'please', 'course', 'class',
])
const ACRONYM_FILLER = new Set(['and', 'of', 'for', 'the', 'in', 'with', 'to', 'a', 'an'])

const norm = text =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const tokens = text => norm(text).split(' ').filter(Boolean)

function acronym(text) {
  return tokens(text)
    .filter(word => !ACRONYM_FILLER.has(word) && /^[a-z]/.test(word))
    .map(word => word[0])
    .join('')
}

function score(option, hint) {
  const h = norm(hint)
  if (!h) return 0
  const cells = Object.values(option.cells || {}).map(norm)
  if (norm(option.label) === h || cells.includes(h)) return 100
  const optionTokens = tokens(option.text)
  const raw = tokens(hint)
  const meaningful = raw.filter(word => !FILLER.has(word))
  const hintTokens = meaningful.length ? meaningful : raw

  const codes = hintTokens.filter(word => /^[a-z]{2,4}\d{3,4}[a-z]?$/.test(word))
  if (codes.length && codes.every(code => optionTokens.includes(code))) return 95

  const compact = hintTokens.join('')
  if (compact.length >= 2 && cells.some(cell => acronym(cell) === compact)) return 85

  const matched = hintTokens.filter(word =>
    optionTokens.some(token => token === word || (word.length >= 2 && token.startsWith(word)) || (/^\d+$/.test(word) && token.includes(word)))
  )
  const coverage = matched.length / hintTokens.length
  if (coverage === 1) return 70 + Math.min(10, matched.join('').length)
  return Math.round(coverage * 50)
}

function rank(options, hint) {
  return options
    .map(option => ({ option, score: score(option, hint) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.option.index - b.option.index)
}

/** Relative semester hints resolved by position (cli-top lists semesters oldest -> newest). */
function relativeSemester(options, hint) {
  const h = norm(hint)
  if (!options.length) return undefined
  if (/^(latest|current|this|now|this semester|current semester|latest semester)$/.test(h)) return options[options.length - 1]
  if (/^(previous|prev|last|last semester|previous semester|prev semester)$/.test(h)) return options[options.length - 2]
  if (/^(first|oldest)( semester)?$/.test(h)) return options[0]
  return undefined
}

/**
 * Single choice. Returns { option } when exactly one option clearly matches, otherwise
 * { ranked } (best first) so callers can show the closest options.
 */
function matchOne(options, hint, { param } = {}) {
  if (param === 'semester') {
    const relative = relativeSemester(options, hint)
    if (relative) return { option: relative, ranked: [] }
  }
  if (/^\d+$/.test(String(hint).trim())) {
    const index = parseInt(hint, 10)
    const option = options.find(candidate => candidate.index === index)
    if (option) return { option, ranked: [] }
  }
  const ranked = rank(options, hint)
  const [best, second] = ranked
  if (best && best.score >= 60 && (!second || best.score - second.score >= 10)) return { option: best.option, ranked }
  return { ranked: ranked.map(entry => entry.option) }
}

/**
 * Multi choice (course materials). Returns { selection } in cli-top's --materials grammar,
 * or {} when the hint doesn't identify anything.
 */
function matchMany(options, hint) {
  const text = String(hint || '').trim()
  if (!text) return {}
  if (/^(all|everything|every ?thing|bulk|0)$/i.test(text) || /\ball (of )?(the )?(materials?|files|notes|slides)\b/i.test(text)) {
    return { selection: '0', ids: options.map(option => option.id) }
  }
  if (/^\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*$/.test(text)) {
    return { selection: text.replace(/\s+/g, '') }
  }
  const moduleMatches = [...text.matchAll(/\b(?:module|mod|unit|m)\s*-?\s*(\d+)\b/gi)].map(m => m[1])
  if (moduleMatches.length) {
    const wanted = new Set(moduleMatches.map(n => String(parseInt(n, 10))))
    const picked = options.filter(option => {
      const moduleKey = Object.keys(option.cells || {}).find(key => /module/i.test(key))
      return moduleKey && wanted.has(String(parseInt(option.cells[moduleKey], 10)))
    })
    if (picked.length) return { selection: picked.map(option => option.index).join(','), ids: picked.map(option => option.id) }
    return {}
  }
  const picked = rank(options, text).filter(entry => entry.score >= 70)
  if (picked.length) {
    const sorted = picked.map(entry => entry.option).sort((a, b) => a.index - b.index)
    return { selection: sorted.map(option => option.index).join(','), ids: sorted.map(option => option.id) }
  }
  return {}
}

module.exports = { matchOne, matchMany, score, norm, acronym }
