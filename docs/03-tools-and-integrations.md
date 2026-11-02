# 03 · Tools & Integrations

Every non-trivial capability surfaces to the models via `lib/tools.ts`. This doc enumerates those tools, the data sources they rely on, and the supporting agents/services used behind the scenes.

---

## 1. Tool Registry (`lib/tools.ts`)

`createVITTools(userId: string)` returns an object whose keys are tool names and whose values are `tool({...})` instances from the `ai` SDK. Tools cover six themes:

1. **Knowledge & RAG** – retrieving curated VIT policies and Reddit intelligence.
2. **Memory** – saving personalized facts back to Prisma.
3. **VTOP access** – executing CLI commands through the proxy service.
4. **Academic resources** – past papers, syllabi, placements, FFCS datasets, faculty directories.
5. **Campus life** – mess menus, timetable/course lookups, placements.
6. **Diagnostics** – progress emitters used by scripts.

Additional web capabilities:

- **Parallel Web search & extract** (`webSearch`, `webExtract`) – live web search and focused page extraction powered by `@parallel-web/ai-sdk-tools` (requires `PARALLEL_API_KEY`).
- **OpenAI hosted web search** (`web_search`) – Responses API search with inline citations, exposed by `@ai-sdk/openai`.
- **VTOP MCP OAuth** – WhatsApp users authorize via `/api/whatsapp/oauth/callback`, exchanging the `code` from the proxy and persisting tokens in user preferences.

All tools share the rate-limited AI clients defined in `lib/rate-limited-ai.ts`, so they automatically respect API key rotation and user-level throttling.

---

## 2. Knowledge Base & Context Layers

### Prompt Context (`lib/data/*.ts`, `lib/knowledge-base.ts`)

- `getCurrentVITContext()` in `lib/data/context-integration.ts` concatenates context sections (`academic-calendar`, `working-saturdays`, `exam-schedule`, `latest-events`, `holidays`, `current-status`) plus the longform `VIT_COMPREHENSIVE_KNOWLEDGE`.
- `scripts/seed-rag.ts` chunks this content (plus optional custom text) and writes into `vit_rag_chunks` (Postgres + `pgvector`). Each chunk stores metadata and a `vector(3072)` embedding.

### Knowledge Tool (`lib/knowledge-tools.ts`)

- `createKnowledgeTools()` exports `knowledgeBase`, which:
  - Embeds the query using OpenAI `text-embedding-3-large`.
  - Runs a DOT-product nearest-neighbor query over `vit_rag_chunks`.
  - Returns structured chunks with metadata and explicit instructions (“You must now provide a comprehensive answer…”).
- The assistant is instructed (in `lib/prompts.ts`) to always call `knowledgeBase` before giving up on policy questions.

### Reddit Agentic RAG

- `lib/tools.ts` includes helper functions (`searchRedditKnowledge`, `searchRedditRaw`, `getTrendingRedditTopics`, `getRedditOverview`) that target the deep-search service (see §5).
- The tool returns consolidated answers plus transparency data (sources, refined queries).

---

## 3. Past Papers & Exam Intelligence

### Scrapers

- `lib/scrapers/*` implement fetchers for:
  - `papers-scraper` (internal archive), `papers-codechef`, `vit-papervault`, `examcooker`.
  - `placement-scraper.ts` (see §4) and `mess-menu-scraper.ts`.
- Each scraper normalizes metadata (`title`, `url`, `examType`, `year`, `source`) and deduplicates PDF links.
- `findPastPapers` takes an exact course code (the model finds it with `searchCourseCatalog` first), `examType` (`cat1` | `cat2` | `fat` | `quiz`) and a four-digit `year`.

### Database (`lib/papers-db.ts`)

- Uses `DATABASE_URL2` (Postgres + pgvector). Tables:
  - `past_papers` (metadata + extracted questions)
  - `past_paper_chunks` (chunk embeddings)
  - `past_paper_question_embeddings` (question embeddings)
  - `paper_indexes` + `paper_index_papers` (groupings)
- Provides helpers to upsert chunks/questions, link indexes, load stats, and compute semantic rankings (`semanticRankQuestion`, `questionEmbeddingScores`).

### Public Endpoint

- `/api/public/papers/search` (unauthenticated) takes `courseCode` (aliases `course`, `q`, `query`) plus optional `examType` / `year`, fans out to all scrapers and returns deduped results + source diagnostics. The course is an exact code (`BCSE302L`), or text that is substring-matched (case-insensitive) against catalog codes and titles via `searchCourseCatalog`: exactly one match uses that course; several return `400 { error: "ambiguous_course", candidates: [{ code, name }] }`; none return `400 { error: "unresolved_course_code", candidates: [] }`. Successful responses are unchanged.
- **Changed:** nickname/acronym resolution (e.g. `DSA`, `DBMS`, `calc`) and "first fuzzy match wins" were removed. Callers that sent nicknames must send a code or a title fragment and pick from `candidates`.

---

## 4. Campus Data Utilities

| Tool                          | Description                                                                                                                                                                                           | Data Source / Files                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Mess Menu** (`getMessMenu`) | Reads static JSON menus (`public/menu-data/…`) and filters by hostel/mess/date/meal.                                                                                                                  | `lib/scrapers/mess-menu-scraper.ts`                            |
| **Course Catalog / FFCS**     | `getCourseData` loads JSON dumps per school (`public/ffcs/{school}.json`). Course search & slot filtering happen in `lib/ffcs-tool.ts`.                                                               | `public/ffcs/*.json`                                           |
| **Course Catalog** (`searchCourseCatalog`, `lookupCourseCode`) | `COURSE_MAP` (code → official title) with an exact code lookup and a case-insensitive substring search returning candidates. No acronyms or fuzzy scoring: the model searches, reads candidates and passes exact codes to other tools. | `lib/course-map.ts`                                            |
| **Faculty Directory**         | `getFacultyInfo` fetches `public/faculty.json`, filtering by exact school acronym, and case-insensitive substrings of department, faculty name, or course code/title (no acronym tables or spelling correction).                                                                                       | `public/faculty.json`                                          |
| **Syllabi Downloader**        | `getSyllabus` looks up `public/syllabi.json` by exact code, else case-insensitive substring of code/title/filename; several matches come back as candidates for the model to choose.                                                                                                                | `public/syllabi.json`                                          |
| **Placement Insights**        | `scrapePlacementInfo` parses CSVs in `public/placements` (standard + WITCH programs), de-dupes by student/reg no, computes stats (highest/lowest/median CTC, per-company placements, campus filters). | `lib/scrapers/placement-scraper.ts`, `public/placements/*.csv` |

All of these tools return structured JSON that the assistant can render as markdown or pass into hub panels (e.g., `components/hub/panels/placement-panel.tsx`).

---

## 5. Reddit Knowledge System (`services/deep-search`)

The deep-search microservice (port 3002 by default) powers all Reddit-related tools:

- **`api-server.js`** exposes `/health`, `/api/search`, `/api/ask`, `/api/stats`, `/api/trending`, `/api/compare`.
- **Agentic pipeline**: `knowledge-base/agentic-rag-service` refines queries, scoring replies with Gemini before returning citations, search attempts, and refined prompts.
- **Database**: `knowledge-base/knowledge-base` uses Postgres with `reddit_posts`, `reddit_comments`, vector embeddings, and optional image/video analysis via Gemini Vision.
- **Scrapers** live in `scrapers/` and can process posts, comments, plus OCR on screenshots.
- **Configuration** documented in `services/deep-search/README.md` + `AGENTIC_RAG.md` (env vars, intervals, thresholds).

`lib/tools.ts` hits this service via `REDDIT_API_URL` (falling back to `http://localhost:3002` in dev).

---

## 6. VTOP & Hub Capabilities

### Command Metadata

- `hub-capabilities.json` defines every command exposed in the hub: title, description, groups (“academics”, “logistics”, “documents”), auto-sync flag, parser hints, interactive requirements.
- `lib/hub/capabilities.ts` loads the manifest into a typed map, so both the UI and proxy service share a single source of truth.

### Runtime Flow

1. The assistant (or hub) calls the `queryVTOP` tool with `command` and optional exact flags (`semester` index or `"list"`, option indices, `materials` index grammar, application fields). Multi-step commands return `needs_selection` / `needs_input` / `needs_confirmation` with the full `step.options` list and a `continuation`; the model (or the workflow card) continues with `continuation` + `choice` (option id(s), a value, or `true`/`false`).
2. `lib/tools.ts` resolves credentials (stored per user or via `VTOPCredentialsDialog`), builds a payload, and calls the proxy service (`services/proxy-service`, default `http://localhost:3001`).
3. The proxy runs the CLI (`POST /vtop`), continues workflows (`POST /vtop/continue`, which rejects anything that is not an offered option id with `400 invalid_input` + `validIds`), and returns raw JSON + temporary download links.
4. `app/api/hub/vtop/route.ts` (or server actions in `app/actions/hub.ts`) parse the raw output via `lib/hub/parsers/*`, or falls back to Gemini to format into the shared `vtopResultSchema`.
5. Snapshots are stored in Prisma (`VTOPSnapshot`).
6. Hub panels and the daily briefing overlay (`components/hub/daily-briefing-overlay.tsx`) render structured content or quick insight summaries.

### Insights & Parsers

- Parsers live under `lib/hub/parsers` (attendance, marks, exams, assignments, leave, library dues, etc.). Each yields human-readable HTML and machine-friendly `structured_data`.
- Additional insight engines (e.g., “attendance-risk”, “next-class”) run in the panel logic and leverage `structured_data`.

---

## 7. Memory Tooling

- `createMemoryTool(userId)` (within `lib/tools.ts`) exposes a `saveMemory` tool with schema: `{ memoryContent, memoryId?, importance?, tags? }`.
- To update an existing memory the model passes its `memoryId` (ids are listed in the memory context); otherwise a new memory is created. Identical content is skipped; there is no similarity-based merging.

---

## 8. Diagnostics & Support Scripts

- `scripts/test-performance.ts` seeds test chats and benchmarks DB access via `lib/performance-tester.ts` and `lib/db-optimizations.ts`. Results are surfaced in the mgmt UI.
- `scripts/dump/*.csv` captures anonymized schema snapshots (users, chats, messages, security logs) for quick exports.
- `scripts/migrate-*.ts` files move passkeys/security keys or Postgres data when schemas change.

---

## 9. Quick Reference Checklist

- Update `hub-capabilities.json` + `lib/hub/capabilities.ts` whenever you add a new VTOP CLI command or change auto-sync settings.
- Ensure new scrapers write safe summaries (no secrets) and include clear `source` labels.
- When adding a tool, plug it into both the chat assistant (via `createVITTools`) and, if applicable, the hub panels or mgmt dashboards, so users have a visual companion.
- Verify any new RAG data types are whitelisted in `lib/data/index.ts` (otherwise the context won’t surface in prompts or seeds).

Use this doc when you need to understand what data the assistant can touch, how it gets structured, and which services or scripts keep that data fresh.
