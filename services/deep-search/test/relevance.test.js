process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const relevance = require('../knowledge-base/relevance-judge')
const AgenticRAGService = require('../knowledge-base/agentic-rag-service')
const KnowledgeBase = require('../knowledge-base/knowledge-base')

const {
  DEFAULT_RELEVANCE_THRESHOLD,
  buildRelevanceQuestions,
  buildRelevanceState,
  judgeRelevance,
  selectRelevantResults,
  countAboveThreshold,
} = relevance

// --- helpers --------------------------------------------------------------------------------------

/** An Experimental_DecisionModelV4 whose answers come from `respond(options, callNumber)`. */
function stubDecisionModel(respond) {
  const calls = []
  const model = {
    specificationVersion: 'v4',
    provider: 'stub',
    modelId: 'stub-decider',
    supportedQuestionTypes: ['boolean'],
    async doDecide(options) {
      calls.push(options)
      return respond(options, calls.length)
    },
  }
  return { model, calls }
}

/** Candidate post whose title is "T-<id>", so a stub can tell which result a question names. */
function post(id, extra = {}) {
  return {
    type: 'post',
    reddit_id: id,
    subreddit: 'vit',
    title: `T-${id}`,
    content: `content of ${id}`,
    upvotes: 1,
    score: 1,
    similarity: 0.5,
    ...extra,
  }
}

const idInQuestion = question => /T-(\w+)/.exec(question.instructions)?.[1]

/** Stub that answers each question with probabilities[<candidate id>] (default 0). */
function probabilityModel(probabilities) {
  return stubDecisionModel(({ questions }) => ({
    answers: Object.fromEntries(
      Object.entries(questions).map(([qid, question]) => [
        qid,
        { type: 'boolean', probability: probabilities[idInQuestion(question)] ?? 0 },
      ])
    ),
    warnings: [],
  }))
}

function fakeKnowledgeBase(resultsByQuery) {
  const searches = []
  return {
    searches,
    async search(query) {
      searches.push(query)
      return resultsByQuery[query] || []
    },
  }
}

function fakeRefinementAgent(nextQuery) {
  const calls = []
  return {
    calls,
    async refineQuery(originalQuery, relevantResults, iteration) {
      calls.push({ originalQuery, relevantResults, iteration })
      return nextQuery
    },
  }
}

function makeService({ knowledgeBase, decisionModel, refinementAgent }) {
  return new AgenticRAGService({
    knowledgeBase,
    decisionModel,
    refinementAgent: refinementAgent || fakeRefinementAgent(null),
    chatModel: { specificationVersion: 'v4', provider: 'unused', modelId: 'unused' },
  })
}

// --- question construction ------------------------------------------------------------------------

describe('relevance questions', () => {
  it('puts the student question in state and each result in its own uniquely named question', () => {
    const candidates = [
      post('a', { title: 'Attendance rule' }),
      { type: 'comment', reddit_id: 'c', subreddit: 'vit', title: 'dup', content: 'A comment' },
    ]
    const questions = buildRelevanceQuestions(candidates)
    assert.deepEqual(Object.keys(questions), ['r0', 'r1'])
    for (const [id, question] of Object.entries(questions)) {
      assert.equal(question.type, 'boolean')
      assert.match(question.instructions, new RegExp(`^Search result ${id} — title: `))
      assert.match(question.instructions, /directly helps answer the student's question/)
    }
    assert.match(questions.r0.instructions, /"Attendance rule"/)
    assert.match(questions.r1.instructions, /"Comment in r\/vit"/)
    assert.match(questions.r1.instructions, /excerpt: "A comment"/)
    assert.equal(
      buildRelevanceState('how strict is attendance'),
      'A VIT Vellore student asked: "how strict is attendance"'
    )
  })
})

// --- judgeRelevance -------------------------------------------------------------------------------

describe('judgeRelevance', () => {
  it('makes one Decisions call and returns P(true) per candidate, mapped by question id', async () => {
    const { model, calls } = probabilityModel({ a: 0.9, b: 0.1, c: 0.55 })
    const verdict = await judgeRelevance({
      model,
      query: 'q?',
      candidates: [post('a'), post('b'), post('c')],
    })
    assert.equal(verdict.ok, true)
    assert.deepEqual(verdict.probabilities, [0.9, 0.1, 0.55])
    assert.equal(calls.length, 1)
    assert.deepEqual(Object.keys(calls[0].questions), ['r0', 'r1', 'r2'])
    assert.equal(calls[0].state[0].text, 'A VIT Vellore student asked: "q?"')
  })

  it('treats refused questions as not relevant and re-asks the rest once', async () => {
    const { model, calls } = stubDecisionModel(({ questions }, call) => ({
      answers: Object.fromEntries(
        Object.entries(questions).map(([qid, question]) => [
          qid,
          call === 1 && idInQuestion(question) === 'b'
            ? { type: 'refusal' }
            : { type: 'boolean', probability: 0.8 },
        ])
      ),
      warnings: [],
    }))
    const verdict = await judgeRelevance({
      model,
      query: 'q',
      candidates: [post('a'), post('b'), post('c')],
    })
    assert.equal(verdict.ok, true)
    assert.deepEqual(verdict.probabilities, [0.8, null, 0.8])
    assert.deepEqual(verdict.refusedIndexes, [1])
    assert.equal(calls.length, 2)
    assert.deepEqual(Object.keys(calls[1].questions), ['r0', 'r2'])
  })

  it('reports failure instead of throwing when the call errors', async () => {
    const { model } = stubDecisionModel(() => {
      throw new Error('boom')
    })
    const verdict = await judgeRelevance({ model, query: 'q', candidates: [post('a')] })
    assert.equal(verdict.ok, false)
    assert.match(verdict.reason, /boom/)
  })

  it('reports failure when the call exceeds the timeout', async () => {
    const { model } = stubDecisionModel(
      ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason))
        })
    )
    const verdict = await judgeRelevance({
      model,
      query: 'q',
      candidates: [post('a')],
      timeoutMs: 20,
      maxRetries: 0,
    })
    assert.equal(verdict.ok, false)
  })

  it('reports failure when every question is refused', async () => {
    const { model } = stubDecisionModel(({ questions }) => ({
      answers: Object.fromEntries(Object.keys(questions).map(id => [id, { type: 'refusal' }])),
      warnings: [],
    }))
    const verdict = await judgeRelevance({ model, query: 'q', candidates: [post('a')] })
    assert.equal(verdict.ok, false)
    assert.match(verdict.reason, /refused/)
  })
})

// --- selection rule -------------------------------------------------------------------------------

describe('selectRelevantResults', () => {
  const scored = ps => ps.map((p, i) => ({ id: i, relevanceScore: p }))

  it('uses a default threshold of 0.5', () => {
    assert.equal(DEFAULT_RELEVANCE_THRESHOLD, 0.5)
  })

  it('keeps p >= threshold sorted by p, ties in incoming order', () => {
    const picked = selectRelevantResults(scored([0.2, 0.9, 0.5, 0.49, 0.9, 0.7]))
    assert.deepEqual(
      picked.map(r => r.id),
      [1, 4, 5, 2]
    )
  })

  it('caps the selection at 12', () => {
    const picked = selectRelevantResults(scored(Array.from({ length: 20 }, () => 0.8)))
    assert.equal(picked.length, 12)
  })

  it('keeps the top 3 by p when nothing clears the threshold', () => {
    const picked = selectRelevantResults(scored([0.1, 0.3, null, 0.2, 0.05]))
    assert.deepEqual(
      picked.map(r => r.id),
      [1, 3, 0]
    )
  })

  it('honours a custom threshold', () => {
    const picked = selectRelevantResults(scored([0.3, 0.6, 0.8]), { threshold: 0.7 })
    assert.deepEqual(
      picked.map(r => r.id),
      [2]
    )
    assert.equal(countAboveThreshold(scored([0.3, 0.6, 0.8]), 0.6), 2)
  })
})

// --- agentic search -------------------------------------------------------------------------------

describe('AgenticRAGService.agenticSearch', () => {
  const savedEnv = {}
  const envKeys = [
    'DEEP_SEARCH_RELEVANCE_THRESHOLD',
    'DEEP_SEARCH_DECISION_MODEL',
    'AGENTIC_FIRST_PASS_MIN_RESULTS',
  ]
  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })
  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  it('stops after one pass when enough results clear the threshold; scores are the probabilities', async () => {
    const results = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => post(id))
    const kb = fakeKnowledgeBase({ q: results })
    const { model, calls } = probabilityModel({ a: 0.2, b: 0.95, c: 0.6, d: 0.7, e: 0.51, f: 0.1 })
    const refiner = fakeRefinementAgent('should not be used')
    const service = makeService({ knowledgeBase: kb, decisionModel: model, refinementAgent: refiner })

    const outcome = await service.agenticSearch('q')

    assert.equal(calls.length, 1)
    assert.equal(refiner.calls.length, 0)
    assert.deepEqual(kb.searches, ['q'])
    assert.equal(outcome.relevanceMode, 'decisions')
    assert.deepEqual(
      outcome.relevantResults.map(r => [r.reddit_id, r.relevanceScore]),
      [
        ['b', 0.95],
        ['d', 0.7],
        ['c', 0.6],
        ['e', 0.51],
      ]
    )
    assert.equal(outcome.confidentResults, 4)
  })

  it('refines when too few results pass, judges only new candidates, and selects across iterations', async () => {
    const kb = fakeKnowledgeBase({
      q: [post('a'), post('b'), post('c')],
      'refined q': [post('b'), post('d'), post('e')],
    })
    const { model, calls } = probabilityModel({ a: 0.9, b: 0.2, c: 0.1, d: 0.8, e: 0.3 })
    const refiner = fakeRefinementAgent('refined q')
    const service = makeService({ knowledgeBase: kb, decisionModel: model, refinementAgent: refiner })

    const outcome = await service.agenticSearch('q')

    assert.deepEqual(kb.searches, ['q', 'refined q'])
    assert.equal(refiner.calls.length, 1)
    assert.deepEqual(
      refiner.calls[0].relevantResults.map(r => r.reddit_id),
      ['a']
    )
    assert.equal(calls.length, 2)
    // b was judged in the first pass, so only d and e are asked about again.
    assert.deepEqual(Object.values(calls[1].questions).map(idInQuestion), ['d', 'e'])
    // Every question is about the original query, even on the refined search.
    assert.equal(calls[1].state[0].text, 'A VIT Vellore student asked: "q"')
    assert.deepEqual(
      outcome.relevantResults.map(r => r.reddit_id),
      ['a', 'd']
    )
    assert.deepEqual(outcome.queriesUsed, ['q', 'refined q'])
  })

  it('falls back to retrieval order (no scores) when the Decisions call fails', async () => {
    const results = Array.from({ length: 12 }, (_, i) => post(`p${i}`))
    const kb = fakeKnowledgeBase({ q: results })
    const { model } = stubDecisionModel(() => {
      throw new Error('decisions down')
    })
    const refiner = fakeRefinementAgent('refined q')
    const service = makeService({ knowledgeBase: kb, decisionModel: model, refinementAgent: refiner })

    const outcome = await service.agenticSearch('q')

    assert.equal(outcome.success, true)
    assert.equal(outcome.relevanceMode, 'retrieval-order')
    assert.deepEqual(
      outcome.relevantResults.map(r => r.reddit_id),
      results.slice(0, 8).map(r => r.reddit_id)
    )
    assert.ok(outcome.relevantResults.every(r => r.relevanceScore === null))
    assert.equal(refiner.calls.length, 0)
    assert.deepEqual(kb.searches, ['q'])
  })

  it('keeps first-pass judgements when the second Decisions call fails', async () => {
    const kb = fakeKnowledgeBase({ q: [post('a'), post('b')], 'refined q': [post('c')] })
    const { model } = stubDecisionModel(({ questions }, call) => {
      if (call === 2) throw new Error('decisions down')
      return {
        answers: Object.fromEntries(
          Object.entries(questions).map(([qid, question]) => [
            qid,
            { type: 'boolean', probability: idInQuestion(question) === 'a' ? 0.9 : 0.1 },
          ])
        ),
        warnings: [],
      }
    })
    const service = makeService({
      knowledgeBase: kb,
      decisionModel: model,
      refinementAgent: fakeRefinementAgent('refined q'),
    })

    const outcome = await service.agenticSearch('q')
    assert.equal(outcome.relevanceMode, 'decisions')
    assert.deepEqual(
      outcome.relevantResults.map(r => [r.reddit_id, r.relevanceScore]),
      [['a', 0.9]]
    )
  })

  it('reads the threshold and decision model id from the environment', () => {
    process.env.DEEP_SEARCH_RELEVANCE_THRESHOLD = '0.65'
    process.env.DEEP_SEARCH_DECISION_MODEL = 'gpt-6-luna-test'
    const service = new AgenticRAGService({
      knowledgeBase: fakeKnowledgeBase({}),
      refinementAgent: fakeRefinementAgent(null),
      chatModel: {},
    })
    assert.equal(service.relevanceThreshold, 0.65)
    assert.equal(service.decisionModel.modelId, 'gpt-6-luna-test')
    assert.equal(typeof service.decisionModel.doDecide, 'function')
  })
})

// --- retrieval fusion (no DB) ---------------------------------------------------------------------

describe('KnowledgeBase fusion and de-duplication', () => {
  const kb = Object.create(KnowledgeBase.prototype)

  it('fuses vector and full-text ranks by RRF with equal weights; full-text-only hits have similarity 0', () => {
    const vector = [
      { type: 'post', reddit_id: 'v1', similarity: 0.9 },
      { type: 'post', reddit_id: 'both', similarity: 0.8 },
    ]
    const text = [
      { type: 'post', reddit_id: 't1', textRank: 0.5 },
      { type: 'post', reddit_id: 'both', textRank: 0.4 },
    ]
    const fused = kb.fuseResultsByRrf(
      [
        { strategy: 'vector', results: vector },
        { strategy: 'text', results: text },
      ],
      10
    )
    assert.deepEqual(
      fused.map(r => r.reddit_id),
      ['both', 'v1', 't1']
    )
    assert.equal(fused[0].rrfScore, 1 / 62 + 1 / 62)
    assert.deepEqual(fused[0].sourceStrategies, ['vector', 'text'])
    assert.equal(fused.find(r => r.reddit_id === 't1').similarity, 0)
    assert.equal(fused.find(r => r.reddit_id === 'both').similarity, 0.8)
  })

  it('drops chunks of retrieved posts and exact duplicate text, preserving order', () => {
    const unique = kb.removeDuplicates([
      { type: 'chunk', reddit_id: '7', source_key: 'post:7', title: 'x', content: 'x' },
      { type: 'comment', reddit_id: 'c1', source_key: 'comment:3', title: 'hi', content: 'hi' },
      { type: 'post', reddit_id: 'p7', source_key: 'post:7', title: 'P', content: 'body' },
      { type: 'post', reddit_id: 'p8', source_key: 'post:8', title: 'P', content: 'body' },
      { type: 'chunk', reddit_id: '9', source_key: 'post:9', title: 'y', content: 'y' },
    ])
    assert.deepEqual(
      unique.map(r => r.reddit_id),
      ['c1', 'p7', '9']
    )
  })
})

// --- no keyword scoring left ----------------------------------------------------------------------

describe('no natural-language heuristics remain', () => {
  const removedServiceMethods = [
    'selectRelevantResults',
    'scoreResultRelevance',
    'estimateRelevanceFromRetrieval',
    'countTermMatches',
    'calculateAverageLexicalCoverage',
    'getNextQuery',
  ]
  const removedKnowledgeBaseMethods = [
    'extractSearchTerms',
    'countTermMatches',
    'countWeightedTermMatches',
    'buildDynamicTermWeights',
    'scoreSearchResult',
    'buildVectorQueryVariants',
    'searchByKeywords',
    'escapeRegex',
    'createResultFingerprint',
    'isNearDuplicateFingerprint',
  ]
  const removedIdentifiers = [
    'extractKeyTerms',
    'extractSearchTerms',
    'countTermMatches',
    'countWeightedTermMatches',
    'buildDynamicTermWeights',
    'scoreSearchResult',
    'estimateFallbackScores',
    'estimateRelevanceFromRetrieval',
    'blendRelevanceScores',
    'calculateAverageLexicalCoverage',
    'shouldUseLlmRelevance',
    'buildVectorQueryVariants',
    'searchByKeywords',
    'scoreResultRelevance',
    'ResultQualityAgent',
    'QueryRelevanceAgent',
    'lexical',
    'thinkingBudget',
  ]

  it('removed methods are gone from the service and knowledge base', () => {
    for (const name of removedServiceMethods) {
      assert.equal(name in AgenticRAGService.prototype, false, `AgenticRAGService#${name}`)
    }
    assert.equal('extractKeyTerms' in AgenticRAGService, false)
    for (const name of removedKnowledgeBaseMethods) {
      assert.equal(name in KnowledgeBase.prototype, false, `KnowledgeBase#${name}`)
    }
    assert.equal(AgenticRAGService.QueryRelevanceAgent, undefined)
    assert.equal(AgenticRAGService.ResultQualityAgent, undefined)
  })

  it('the legacy keyword RAG service is gone', () => {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'knowledge-base', 'rag-service.js')), false)
  })

  it('search and relevance sources contain no term matching, stop words or removed helpers', () => {
    const dir = path.join(__dirname, '..', 'knowledge-base')
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8')
      for (const identifier of removedIdentifiers) {
        assert.equal(source.includes(identifier), false, `${file} still mentions ${identifier}`)
      }
      assert.doesNotMatch(source, /toLowerCase\(\)\s*\.includes/, `${file}: toLowerCase().includes`)
      assert.doesNotMatch(source, /new RegExp\(/, `${file}: new RegExp`)
      assert.doesNotMatch(source, /stop_?words/i, `${file}: stop word list`)
    }
  })
})
