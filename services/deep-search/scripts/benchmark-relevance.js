#!/usr/bin/env node
/**
 * Benchmarks the production relevance judge (OpenAI Decisions via `judgeRelevance`) against the
 * hand-labeled fixture in test/fixtures/relevance-labeled.json. Calls the real API, never a
 * database.
 *
 *   OPENAI_API_KEY=... node scripts/benchmark-relevance.js
 *
 * Env: BENCH_RUNS (default 3), DEEP_SEARCH_DECISION_MODEL, DEEP_SEARCH_RELEVANCE_THRESHOLD,
 * AGENTIC_RELEVANCE_TIMEOUT_MS (default 10000 here so slow calls are measured, not dropped).
 */
const path = require('path')
const { openai } = require('@ai-sdk/openai')
const {
  DEFAULT_DECISION_MODEL_ID,
  DEFAULT_RELEVANCE_THRESHOLD,
  judgeRelevance,
  selectRelevantResults,
} = require('../knowledge-base/relevance-judge')

const fixture = require(path.join(__dirname, '..', 'test', 'fixtures', 'relevance-labeled.json'))

const runs = Math.max(1, Number.parseInt(process.env.BENCH_RUNS || '3', 10) || 3)
const modelId = process.env.DEEP_SEARCH_DECISION_MODEL || DEFAULT_DECISION_MODEL_ID
const thresholdEnv = Number.parseFloat(process.env.DEEP_SEARCH_RELEVANCE_THRESHOLD || '')
const threshold = Number.isFinite(thresholdEnv) ? thresholdEnv : DEFAULT_RELEVANCE_THRESHOLD
const timeoutMs = Number.parseInt(process.env.AGENTIC_RELEVANCE_TIMEOUT_MS || '10000', 10)

/** Probability that a random positive outranks a random negative (ties count half). */
function auc(items) {
  const positives = items.filter(item => item.label)
  const negatives = items.filter(item => !item.label)
  if (positives.length === 0 || negatives.length === 0) return NaN
  let wins = 0
  for (const pos of positives) {
    for (const neg of negatives) {
      if (pos.p > neg.p) wins += 1
      else if (pos.p === neg.p) wins += 0.5
    }
  }
  return wins / (positives.length * negatives.length)
}

function classification(items, t) {
  let tp = 0
  let fp = 0
  let tn = 0
  let fn = 0
  for (const item of items) {
    const predicted = item.p >= t
    if (predicted && item.label) tp++
    else if (predicted) fp++
    else if (item.label) fn++
    else tn++
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  return { accuracy: (tp + tn) / items.length, precision, recall, f1, tp, fp, tn, fn }
}

function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return NaN
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[index]
}

const fmt = (value, digits = 3) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a')

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required')
    process.exit(1)
  }

  const model = openai.decisionModel(modelId)
  const latencies = []
  const pooled = [] // every (run, candidate) judgement
  const failures = []
  const perQueryAuc = []
  const selection = { tp: 0, fp: 0, fn: 0 }
  const meanP = new Map() // candidate key -> { label, sum, n, text }

  console.log(
    `model=${modelId} runs=${runs} threshold=${threshold} queries=${fixture.queries.length} candidates=${fixture.queries.reduce((n, q) => n + q.candidates.length, 0)}`
  )

  for (let runIndex = 0; runIndex < runs; runIndex++) {
    for (const [queryIndex, item] of fixture.queries.entries()) {
      const result = await judgeRelevance({
        model,
        query: item.query,
        candidates: item.candidates,
        timeoutMs,
      })
      latencies.push(result.latencyMs)
      if (!result.ok) {
        failures.push(`${item.query}: ${result.reason}`)
        continue
      }

      const judged = item.candidates.map((candidate, index) => ({
        ...candidate,
        relevanceScore: result.probabilities[index] ?? 0,
      }))
      const items = judged.map(candidate => ({ label: candidate.label, p: candidate.relevanceScore }))
      pooled.push(...items)
      perQueryAuc.push(auc(items))

      const selected = new Set(selectRelevantResults(judged, { threshold }))
      for (const candidate of judged) {
        if (selected.has(candidate) && candidate.label) selection.tp++
        else if (selected.has(candidate)) selection.fp++
        else if (candidate.label) selection.fn++
      }

      judged.forEach((candidate, index) => {
        const key = `${queryIndex}:${index}`
        const entry = meanP.get(key) || {
          label: candidate.label,
          sum: 0,
          n: 0,
          text: `${item.query} | ${(candidate.title || candidate.content).slice(0, 60)}`,
        }
        entry.sum += candidate.relevanceScore
        entry.n += 1
        meanP.set(key, entry)
      })
    }
  }

  if (failures.length > 0) {
    console.log(`\nFailed calls (${failures.length}):`)
    failures.forEach(line => console.log(`  ${line}`))
  }
  if (pooled.length === 0) {
    console.error('No successful judgements')
    process.exit(1)
  }

  const means = [...meanP.values()].map(entry => ({ ...entry, p: entry.sum / entry.n }))
  const show = label =>
    means
      .filter(entry => entry.label === label)
      .sort((a, b) => b.p - a.p)
      .map(entry => `  ${fmt(entry.p, 2)}  ${entry.text}`)
      .join('\n')
  console.log('\nMean P(relevant) per candidate, labeled relevant:')
  console.log(show(true))
  console.log('\nMean P(relevant) per candidate, labeled not relevant:')
  console.log(show(false))

  console.log('\nThreshold sweep (pooled judgements):')
  console.log('  T     acc    prec   recall f1')
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    const c = classification(pooled, t)
    console.log(`  ${t.toFixed(1)}   ${fmt(c.accuracy)}  ${fmt(c.precision)}  ${fmt(c.recall)}  ${fmt(c.f1)}`)
  }

  const atThreshold = classification(pooled, threshold)
  const selPrecision = selection.tp / Math.max(1, selection.tp + selection.fp)
  const selRecall = selection.tp / Math.max(1, selection.tp + selection.fn)
  const validQueryAucs = perQueryAuc.filter(Number.isFinite)

  console.log('\n=== Relevance benchmark summary ===')
  console.log(`judgements=${pooled.length} failed_calls=${failures.length}/${latencies.length}`)
  console.log(`auc_pooled=${fmt(auc(pooled))}`)
  console.log(
    `auc_per_query_mean=${fmt(validQueryAucs.reduce((s, v) => s + v, 0) / validQueryAucs.length)}`
  )
  console.log(
    `at_threshold_${threshold}: accuracy=${fmt(atThreshold.accuracy)} precision=${fmt(atThreshold.precision)} recall=${fmt(atThreshold.recall)} (tp=${atThreshold.tp} fp=${atThreshold.fp} tn=${atThreshold.tn} fn=${atThreshold.fn})`
  )
  console.log(`selection_rule: precision=${fmt(selPrecision)} recall=${fmt(selRecall)}`)
  console.log(
    `latency_ms: p50=${percentile(latencies, 0.5)} p90=${percentile(latencies, 0.9)} max=${Math.max(...latencies)} (one call per query, ${fixture.queries[0].candidates.length} questions each)`
  )
}

run().catch(error => {
  console.error('Benchmark failed:', error)
  process.exit(1)
})
