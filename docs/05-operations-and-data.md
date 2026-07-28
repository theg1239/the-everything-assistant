# 05 · Operations, Data & Playbooks

This playbook covers everything that keeps the assistant’s knowledge current: static context updates, RAG seeding, scripts, telemetry, broadcasts, workflows, and environment hygiene.

---

## 1. Context Systems

### Static Context Modules (`lib/data/*.ts`)

- Update these files whenever VIT releases new circulars:
  - `academic-calendar.ts`
  - `exam-schedule.ts`
  - `working-saturdays.ts`
  - `latest-events.ts`
  - `holidays.ts`
  - `current-status.ts`
- Each export implements `ContextData` (`section`, `title`, `lastUpdated`, `priority`, `content`, `metadata`).
- `lib/data/index.ts` aggregates them; `getHighPriorityContextData` is what feeds `getFormattedContextForAI`.
- Mark high-priority items for genuinely time-sensitive info; medium/low can be trimmed from prompts if token pressure rises.

### Comprehensive Knowledge Base (`lib/knowledge-base.ts`)

- Long-form markdown capturing rankings, admissions, FFCS rules, exam structures, GPA computation, etc.
- Append sections here when documenting evergreen knowledge.
- Remember to bump `scripts/seed-rag.ts` to re-embed new chunks (see §2).

---

## 2. RAG Seeding & Scripts

### `scripts/seed-rag.ts`

- Run with `tsx scripts/seed-rag.ts` (optional flags: `--fresh`, `--chunk 300`, `--custom "text"`).
- Requires `DATABASE_URL2` pointing at a Postgres instance with `pgvector`.
- Pipeline:
  1. Ensure `vit_rag_chunks` table exists (drop if `--fresh`).
  2. Combine `getContextForAIPrompt(includeAll=true)` + `VIT_COMPREHENSIVE_KNOWLEDGE`.
  3. Split into overlapping chunks via LangChain.
  4. Embed with Gemini and insert rows.

### Paper Indexing (`scripts/papers.ts`)

- Coordinates scraping, OCR, embeddings, and DB writes.
- Emits progress via `paperProgress.emitStep`, which feeds `/api/paper-progress/[runId]`.

### Performance Tests (`scripts/test-performance.ts`)

- Seeds a synthetic user, chats, and runs DB benchmarks (`lib/performance-tester.ts`).
- Use to validate CockroachDB indexes or gauge Prisma regressions.

### Migration Helpers

- `scripts/migrate-passkey-to-security-key.ts`, `scripts/migrate-webauthn-credentials.ts`: convert legacy credential formats.
- `scripts/migrate-postgres.js`: general-purpose data mover.

### Misc CLIs

- `scripts/query-knowledge.ts` queries the RAG DB from the CLI.
- `scripts/test-key.ts`, `scripts/test-performance:advanced|stress` for targeted load tests.
- `scripts/dump-db-to-csv.js` exports table data (see `scripts/dump/*.csv` for outputs).
- `scripts/tools/` is reserved for future automation (currently empty).

---

## 3. Broadcasts, Daily Briefing & Notifications

### Broadcast Lifecycle

1. Admin hits the mgmt tab (Broadcast form) → `POST /api/broadcast/send`.
2. Chats load the latest entry via `getLatestBroadcast()` on page load.
3. Admin can edit/delete via `PUT/DELETE /api/broadcast`.

### Daily Briefing Operations

- Enable per user by toggling `preferences.dailyBriefing.emailEnabled` (via `/api/user/preferences`).
- Admin-run job: `triggerDailyBriefingWorkflowAction` (server action) or `POST /api/(mgmt)/hub/send-briefing`.
- Emails dispatched through Resend (`lib/email/resend.tsx`). CTA parameters:
  - `hub=briefing` marks that the user arrived from the email.
  - `briefingAction=<command>` instructs the client to auto-open a hub snapshot.
- Keep `RESEND_API_KEY` and `RESEND_FROM` secret; set `BRIEFING_APP_URL` if you need different deep links.

### WhatsApp / Discord Hooks

- Use `/api/whatsapp-bot` to receive inbound messages from the services described in `04-multi-channel-and-services.md`.
- API key: `WHATSAPP_BOT_API_KEY` (core app) must match each bot’s `MAIN_APP_API_KEY`.

---

## 4. Telemetry & Analytics

### Token Usage

- `TokenUsage` table captures every LLM call.
- `/api/(mgmt)/usage` aggregates:
  - Recent events (`getRecentTokenUsage`)
  - Summaries (`getTokenUsageSummary`, `getTokenUsageAllTimeSummary`)
  - Lifetime buckets (`getTokenUsageLifetimeBuckets`)
  - Advanced stats (`getDetailedUsageStats` → hourly heatmap, daily peaks, top models, user totals, moving averages).
- Admin UI visualizes these via `components/token-usage-chart.tsx` + `components/overview.tsx`.

> **TODO**: `lib/stats.ts:getToolCallStats` is empty. Fill it to enable per-tool analytics in `/api/(mgmt)/stats` and the corresponding UI cards.

### Security Logs

- `lib/mfa.ts#logSecurityEvent` writes to `SecurityLog` for MFA attempts, method changes, login failures, etc.
- Use this table (or build endpoints) for audit exports or SIEM integration.

### Paper Progress

- `lib/progress/paper-progress.ts` caches up to 150 events per `runId`.
- SSE endpoint: `GET /api/paper-progress/:runId`.
- Manual push: `POST /api/paper-progress/push`.
- Browser events: `window.dispatchEvent(new CustomEvent('paper-progress', { detail }))`.

---

## 5. Environment & Secrets

### Minimal Local Setup

| Variable                                       | Purpose                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                                 | CockroachDB (primary Prisma connection).                                   |
| `DATABASE_URL2`                                | Postgres with `pgvector` for RAG/past papers.                              |
| `UPSTASH_REDIS_REST_URL/TOKEN`                 | Rate limiting + API key rotation.                                          |
| `GOOGLE_CLIENT_ID/SECRET`                      | NextAuth login.                                                            |
| `OPENAI_API_KEY` / `OPENAI_API_KEYS`           | All language, vision, embedding, image, and hosted-search model calls.     |
| `PARALLEL_API_KEY`                             | Optional retained Parallel web search and extraction tools.                |
| `RESEND_API_KEY`, `RESEND_FROM`                | Daily briefing emails.                                                     |
| `WHATSAPP_BOT_API_KEY`, `MAIN_APP_API_KEY`     | Bot ingress auth.                                                          |
| `VTOP_PROXY_URL`                               | Base URL for the VTOP proxy service (defaults to `http://localhost:3001`). |
| `RATE_LIMIT_ADMIN_EMAIL`                       | Grants access to `/mgmt` and mgmt APIs.                                    |
| `SMTP_EMAIL`, `SMTP_APP_PASSWORD`, `SMTP_USER` | Required for email-based MFA.                                              |

Check `.env.example` for additional optional vars (Chrome path overrides, Resend fallback, OAuth defaults).

When changing `OPENAI_EMBEDDING_MODEL`, `RAG_EMBEDDING_MODEL`, or the configured vector
dimension, rebuild the affected indexes. Embeddings produced by different models must not be mixed
in the same vector index.

### Secrets Hygiene

- Never commit `.env`. Use Vercel/System secrets or 1Password.
- `/app/api/knowledge` returns raw RAG chunks — protect it behind middleware if you’re worried about leakage.

---

## 6. Data Assets & Dumps

- **FFCS JSON**: `public/ffcs/*.json` (per school). Keep these updated each semester if slots/faculty change.
- **Faculty directory**: `public/faculty.json`.
- **Syllabi**: `public/syllabi.json`.
- **Placement CSVs**: `public/placements/*.csv` (standard + WITCH).
- **Knowledge dumps**: `scripts/dump/*.csv` (user/chats/messages snapshots). Useful for migrations or offline analysis.
- **Test fixtures**: `test/data/05-versions-space.pdf` (PDF sample used by the papers portal).

---

## 7. Known Gaps & TODOs

- Implement `getToolCallStats` to populate admin charts and quickly detect runaway tools.
- Consider auth on `/api/knowledge` before pushing to production.
- Add a cron/deployment job to run `scripts/seed-rag.ts --fresh` whenever you update `lib/data` or `lib/knowledge-base.ts`.
- Document the env expectations for `services/*` in their respective READMEs (many already include instructions, but verify them whenever you change APIs).
- Keep `broadcast` slides fresh so the landing hero doesn’t become stale—tie this to product launches or exam seasons.

---

## 8. Quick Ops Checklist

1. **Update context** (lib/data + knowledge base) whenever academic calendars or policies change.
2. **Reseed RAG** after context updates (`scripts/seed-rag.ts`).
3. **Monitor rate limits** via `/api/(mgmt)/rate-limit-status` and rotate keys if needed.
4. **Verify workflows** by sending yourself a `POST /hub/daily-briefing-email/test`.
5. **Audit MFA** by checking `/api/user/mfa` responses and `SecurityLog`.
6. **Back up data** using `scripts/dump-db-to-csv.js` before running destructive migrations.

Keep this playbook handy when you’re on “ops duty” or preparing for semester rollovers—most maintenance tasks boil down to updating context files, reseeding embeddings, and keeping secrets in sync across services.
