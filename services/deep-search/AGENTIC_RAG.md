# Agentic RAG

`POST /api/ask` answers a student's question from the Reddit knowledge base. Language judgements
are made by models, never by hand-written word lists, term counting or query rewriting.

## Flow

```
question
  │
  ├─ 1. Retrieve (knowledge-base.js `search`)
  │     pgvector cosine similarity on the question embedding ─┐
  │     Postgres full-text search (websearch_to_tsquery,     ├─ reciprocal rank fusion (k=60)
  │       ts_rank_cd; the DB's own parser/stemmer)           ─┘   → structural de-dup → type balance
  │
  ├─ 2. Judge (relevance-judge.js `judgeRelevance`)
  │     ONE OpenAI Decisions call (`experimental_decide`, gpt-6-luna) for up to
  │     AGENTIC_RELEVANCE_CANDIDATES new candidates: one boolean question per candidate.
  │     relevanceScore = returned P(true).
  │
  ├─ 3. Stop or refine
  │     ≥ AGENTIC_FIRST_PASS_MIN_RESULTS candidates with P ≥ threshold → stop.
  │     Otherwise the chat model (gpt-6.1-terra) writes one refined query → steps 1–2 again,
  │     judging only candidates not seen before (max 2 passes).
  │
  ├─ 4. Select (over every candidate judged in any pass)
  │     keep P ≥ threshold sorted by P, at most 12; if none pass, the top 3 by P
  │     (the answer prompt is then told the evidence is weak).
  │
  └─ 5. Answer with the chat model (gpt-6.1-terra), HTML, citing real users/upvotes.
```

### Decisions request shape

Following OpenAI's Decisions guidance (shared evidence in the input, per-item content in its own
question, observable criteria):

- `state`: `A VIT Vellore student asked: "<question>"`. Always the original question, so
  probabilities from both passes are on one scale.
- `questions`: `r0 … rN`, each a `boolean` question whose `instructions` name and contain that
  result:

  ```
  Search result r{i} — title: "{title}"; excerpt: "{excerpt}". Does this result contain information,
  experiences or advice that directly helps answer the student's question? Count partial answers and
  closely related rules or facts as helpful. Results about a different topic or place do not count.
  ```

  Comments and chunks have no title of their own, so they are labelled `Comment in r/<sub>` /
  `Excerpt from a r/<sub> discussion`. Excerpts are capped at 600 characters.

### Failures

- **Refusal** (`Experimental_DecisionRefusalError`): refused candidates are treated as not relevant
  and the remaining questions are asked once more.
- **Any other error / timeout** (`AGENTIC_RELEVANCE_TIMEOUT_MS`, one SDK retry): logged. If nothing
  was judged yet, the top 8 candidates in retrieval (RRF) order are used with `relevanceScore: null`
  and no refinement pass; if an earlier pass was judged, its results are kept. There is no keyword
  scoring fallback.
- **Refinement failure or intent drift**: search stops with what it has.

## Relevance threshold

Default `0.5` (`DEEP_SEARCH_RELEVANCE_THRESHOLD`), chosen on the labeled fixture
`test/fixtures/relevance-labeled.json` (8 VIT queries × 6 Reddit-style candidates, 24 relevant,
24 not; negatives include same-keyword/different-topic and other-campus results). Run:

```bash
OPENAI_API_KEY=... npm run benchmark:relevance   # BENCH_RUNS=3 by default
```

Measured with gpt-6-luna, 3 runs (144 judgements, 24 calls):

- The probabilities are strongly bimodal. Every negative scored ≤ 0.20 (the highest was "hostel
  fees are separate from tuition" for a tuition-category question); 22 of 24 positives scored
  ≥ 0.90. The other two positives (borderline "related fact" labels: hostel booking order for a
  single-room question, merit scholarship for a fee-category question) scored ≤ 0.05.
- Every threshold from 0.3 to 0.9 gives the same result: accuracy 0.958, precision 1.000, recall
  0.917. 0.5 sits in the middle of the empty 0.20–0.90 gap, so it has the most margin on both sides.
- AUC 0.974 pooled (0.972 mean per query). Latency per call (6 questions) p50 503–545 ms, p90
  720–783 ms over two benchmark runs.

The previous relevance path on the same fixture: gpt-6.1-terra 0–1 scores blended with keyword
overlap, then re-scored with lexical coverage. Its final score had AUC 0.872, its selection precision
was 0.865 and recall 0.444, and the terra call took p50 2,086 ms / p90 2,606 ms. Raw terra scores
had AUC 0.985, so keyword blending lowered the ranking quality.

Re-check the threshold if the question wording, the decision model or the candidate format changes.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEEP_SEARCH_DECISION_MODEL` | `gpt-6-luna` | OpenAI Decisions model for relevance |
| `DEEP_SEARCH_RELEVANCE_THRESHOLD` | `0.5` | keep results with P(relevant) ≥ this |
| `AGENTIC_RELEVANCE_CANDIDATES` | `15` | candidates judged per pass (capped at 400, the API limit) |
| `AGENTIC_RELEVANCE_TIMEOUT_MS` | `3000` | Decisions call timeout |
| `AGENTIC_FIRST_PASS_MIN_RESULTS` | `4` | stop after a pass once this many results have P ≥ threshold |
| `AGENTIC_SEARCH_LIMIT` | `20` | retrieval results per pass |
| `AGENTIC_REFINEMENT_TIMEOUT_MS` | `3000` | refinement call timeout |
| `AGENTIC_RESPONSE_*` | | answer generation timeouts and token limits |

## API

`POST /api/ask` `{ "query": "...", "conversationHistory": [] }` returns `response`, `sources`,
`confidence`, `searchResults`, `searchAttempts`, `refinedQueries` and `serviceUsed: "agentic"`.
`sources[].relevanceScore` is P(relevant) from the Decisions model (or `null` in the retrieval-order
fallback). `useAgentic` is accepted and ignored: the legacy keyword RAG service and `/api/compare`
were removed.

## Tests

`npm test` runs `test/relevance.test.js` with a stub decision model (no network, no database).
