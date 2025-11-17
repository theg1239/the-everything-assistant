# 02 · Platform Architecture

This document captures how the Everything Assistant is wired at the platform layer: routing, auth, database schema, APIs, rate limiting, and background workflows.

---

## 1. Application Layout

| Area | Purpose | Key Paths |
| --- | --- | --- |
| **App Router** | Pages, layouts, API routes | `app/` (chat, login, mgmt, hub workflows, API handlers) |
| **Components** | Client/UI primitives | `components/` (chat interface, hub panels, PDF dock, onboarding, admin visualizations) |
| **Lib** | Shared logic (auth, DB, tools, scrapers, RAG, rate limiting, workflows) | `lib/` |
| **Providers & Contexts** | React providers for session, theme, memory, PDF dock, rate limits | `providers/`, `contexts/` |
| **Services** | Companion microservices (WhatsApp bot, Discord bot, VTOP proxy, deep-search, papers portal, FFCS extension) | `services/` |
| **Scripts** | CLIs for seeding, migrations, performance tests, paper ingestion | `scripts/` |

`next.config.ts` uses the App Router exclusively; there is no `/pages` directory.

---

## 2. Authentication, Sessions & Security

### NextAuth (`lib/auth.ts`)
- Google OAuth provider with consent/refresh scopes.
- Session strategy: database-backed (Prisma `Session` table). Each session stores `requiresMFA`.
- `/login` renders the Google button; `app/page.tsx` and `app/chat/[id]/page.tsx` guard on `session.user`.

### Multi-Factor Authentication
- **REST endpoints** live under `app/api/user/mfa/**/*`:  
  - `route.ts`: GET status, DELETE to disable.  
  - `setup/route.ts`: start MFA (email OTP, TOTP, security key). Uses Nodemailer for email, `speakeasy` for TOTP, QR generation (`qrcode`).  
  - `verify/route.ts`: verify codes, store hashed backup codes (`lib/mfa.ts`).  
  - `verify-login/route.ts`: challenge during login using TOTP or backup codes.  
  - `method/route.ts`: change methods post-setup.  
  - `backup-codes/route.ts`: regenerate codes.  
  - `availability/route.ts`: surfaces which MFA methods are enabled (email requires SMTP env).  
  - **WebAuthn** routes (`webauthn/register`, `webauthn/verify`, `webauthn/authenticate`, `webauthn/verify-auth`) rely on `@simplewebauthn/server`, store credentials in `WebAuthnCredential`.
- `lib/mfa.ts` centralizes OTP generation/verification, QR helpers, backup-code hashing, rate-limiting per action, and security logging.

### Account Lifecycle
- `app/actions/account.ts` exposes `deleteAccountAction` to purge user rows plus dependent tables (memories, chats, MFA credentials, hub snapshots, WhatsApp data). Audit logs recorded via `logSecurityEvent`.

---

## 3. Data Layer (Prisma / CockroachDB)

`prisma/schema.prisma` targets CockroachDB with `relationJoins` preview. Highlights:

- **User**: preferences JSON, MFA flags, backup codes, `webAuthnCredentials`, WhatsApp conversations, hub snapshots.
- **Chat & Message**: standard chat log with `tool_invocations` stored as JSON. `StreamId` tracks SSE sessions.
- **CanvasDocument**: per-chat scratchpads (`/api/canvas`).
- **Memory & MemorySettings**: custom knowledge base for each user. Auto-save thresholds tuneable via API.
- **TokenUsage**: logging for every LLM call (prompt/completion tokens, model, metadata). Feeds mgmt charts.
- **Broadcast**: slides for the hero banner.
- **WhatsAppConversation/WhatsAppMessage**: persists off-platform conversations; linked to `User` where possible.
- **VTOPSnapshot**: normalized output of hub sync jobs (one row per command per user).
- **SecurityLog**: appended by MFA + account actions.

Cockroach-specific types (e.g., `crdb_internal_region`) are declared for future multi-region usage.

---

## 4. Models, Rate Limiting & AI Providers

### Rate-Limited AI Client (`lib/rate-limited-ai.ts`)
- Wraps `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/cerebras`, and `@openrouter/ai-sdk-provider` with:
  - API-key rotation + health checks (`lib/api-key-manager.ts` token buckets backed by Upstash Redis).
  - User-level throttling (`lib/user-rate-limiter.ts`).
  - Helper methods to stream text, generate objects, embed vectors, and produce usage stats per provider.
- `getRateLimitedAI(provider)` exports memoized instances; `rateLimitedAI` namespace wires convenient shorthands (e.g., `rateLimitedAI.google.streamText`).

### Environment Guardrails (`lib/env-config.ts`)
- Validates required env vars (GOOGLE keys, Redis credentials, admin email).  
- Exposes summary for the mgmt UI (`/api/(mgmt)/rate-limit-status`).

### User-Facing Rate Alerts
- `contexts/rate-limit-context.tsx` + `app/api/(mgmt)/rate-limit-status` drive the on-screen warnings and admin dashboard.  
- `/api/(mgmt)/rate-limit-status` can rotate API keys, reset token buckets, or update config at runtime.

---

## 5. API Surface (App Router Routes)

Below is a non-exhaustive, categorized table—refer to the path column while debugging. All endpoints live in `app/api`.

| Category | Route | File | Purpose |
| --- | --- | --- | --- |
| **Chat** | `POST /chat` | `app/api/chat/route.ts` | Stream assistant replies via `ai` SDK, persisting messages/tool invocations. |
|  | `GET /chat/:id` | `app/api/chat/[id]/route.ts` | Fetch chat transcript. |
|  | `GET /chat/:id/stream` | `app/api/chat/[id]/stream/route.ts` | (Reserved) SSE handshake; currently returns 204 but can be extended. |
|  | `GET/PATCH/DELETE /chats` | `app/api/chats/route.ts` | List, archive, delete all/archived chats. |
|  | `GET/PATCH /chats/:id` | `app/api/chats/[id]/route.ts` | Fetch chat with messages, restore archived chat. |
|  | `GET /chats/:id/title` | `app/api/chats/[id]/title/route.ts` | Lightweight title fetch (used when the UI needs to confirm rename). |
| **Canvas & Docs** | `GET/POST/PUT /canvas` | `app/api/canvas/route.ts` | CRUD operations for Canvas documents per chat. |
| **Memories** | `GET/POST /memories` | `app/api/memories/route.ts` | List/create memories. |
|  | `GET/PATCH/DELETE /memories/:id` | `.../[id]/route.ts` | Single memory management. |
|  | `GET/PATCH /memories/settings` | `.../settings/route.ts` | Toggle auto-save, token budget, filters. |
| **User Prefs & MFA** | `GET/PATCH /user/preferences` | `app/api/user/preferences/route.ts` | Persist UI prefs + daily briefing options. |
|  | `/user/mfa/**/*` | see §2 | Full MFA lifecycle (status, setup, verify, backup codes, WebAuthn). |
| **Hub + VTOP** | `POST /hub` | `app/api/hub/route.ts` | Execute any tool by name (used by hub quick actions). |
|  | `POST /hub/vtop` | `.../vtop/route.ts` | Dedicated VTOP streaming endpoint returning `vtopResultSchema`-validated JSON. |
|  | `POST /hub/daily-briefing-email` | `.../daily-briefing-email/route.ts` | Self-serve briefing email for the current user. |
|  | `POST /hub/daily-briefing-email/test` | `.../test/route.ts` | Send a preview email built from stored snapshots. |
| **Knowledge & Tools** | `GET /knowledge` | `app/api/knowledge/route.ts` | Dumps all `vit_rag_chunks` (admin helper). |
|  | `POST /suggestions` | `app/api/suggestions/route.ts` | Generate follow-up questions. |
|  | `POST /feedback` | `app/api/feedback/route.ts` | Create GitHub issues for feedback or KB contributions. |
|  | `GET /public/papers/search` | `app/api/public/papers/search/route.ts` | Anonymous endpoint aggregating past papers across scrapers. |
| **Broadcasts & Messages** | `GET/PUT/DELETE /broadcast` | `app/api/broadcast/route.ts` | Manage slide decks (admin). |
|  | `POST /broadcast/send` | `.../send/route.ts` | Add new broadcast entry. |
| **WhatsApp/Discord Ingress** | `POST /whatsapp-bot` | `app/api/whatsapp-bot/route.ts` | Authenticated gateway for bot messages; auto-creates phantom users based on phone/Discord IDs, injects conversation history. |
| **Paper Progress** | `GET /paper-progress/:runId` | `app/api/paper-progress/[runId]/route.ts` | SSE stream for ingestion stages. |
|  | `POST /paper-progress/push` | `.../push/route.ts` | Server-side hook to push progress events (used by scripts/services). |
| **Admin / Mgmt** | `GET /mgmt/users` | `app/api/(mgmt)/users/route.ts` | Paginated user list (admin email gated). |
|  | `GET /mgmt/user-messages` | `.../(mgmt)/user-messages/route.ts` | Search messages per user. |
|  | `GET /mgmt/chat-messages/:chatId` | `.../(mgmt)/chat-messages/[chatId]/route.ts` | Fetch messages for inspection. |
|  | `GET /mgmt/stats` | `.../(mgmt)/stats/route.ts` | Aggregated counts (users, messages, tool stats placeholder). |
|  | `GET /mgmt/usage` | `.../(mgmt)/usage/route.ts` | Token usage snapshots (recent, summary, lifetime buckets). |
|  | `GET/POST /mgmt/rate-limit-status` | `.../(mgmt)/rate-limit-status/route.ts` | Env validation + API key controls. |
|  | `POST /mgmt/hub/send-briefing` | `.../hub/send-briefing/route.ts` | Trigger daily briefing for any user ID/email. |

> ⚠️ `lib/stats.ts:getToolCallStats` is currently empty, so `/api/(mgmt)/stats` returns `toolCallStats: undefined`. Fill it to unlock per-tool charts in the admin UI.

---

## 6. Workflows & Background Jobs

### Daily Briefing Workflow
- Declared in `app/workflows/daily-briefing/workflow.ts`, executed via `workflow/api` (World modeling).  
- Steps:
  1. `fetchBriefingAudienceStep` filters users with email + enabled preferences (stored in `User.preferences.dailyBriefing`).
  2. `buildBriefingPacketStep` composes snapshots per user (via `listVTOPSnapshots`).  
  3. `deliverBriefingEmailStep` calls `lib/email/resend.tsx` (Resend API) with CTA links that deep-link back to the hub.
- Triggered through:
  - `app/actions/workflows.ts#triggerDailyBriefingWorkflowAction` (server action, invoked from mgmt tab).  
  - `/api/(mgmt)/hub/send-briefing` for per-user sends.  
  - `/app/workflows/...` can be wired to cron/queues via Vercel or external runner.

### Paper Ingestion & Progress
- CLI script `scripts/papers.ts` orchestrates scraping + chunking. Emits `paper-progress` events that bubble to `/api/paper-progress/[runId]` SSE clients and optionally persist to `/api/paper-progress/push`.
- `lib/progress/paper-progress.ts` caches events, rebroadcasts to the browser, and forwards to Next.js routes (useful when the CLI runs outside the Next runtime).

### RAG Seeding
- `scripts/seed-rag.ts` populates `vit_rag_chunks` using `lib/data/context-*` + `lib/knowledge-base.ts`. It optionally drops the table (`--fresh`) and supports custom text inserts.

---

## 7. Messaging, Bots & External Touchpoints

See `04-multi-channel-and-services.md` for deep dives, but from the platform’s POV:

- `/api/whatsapp-bot` ingests WhatsApp or Discord payloads (distinguished via the `source` field). It creates “bot users” (fake emails like `whatsapp-XXXX@whatsapp-bot.local`) and routes the entire message list through the same `rateLimitedAI.google.streamText` path used by the web UI.
- `/api/hub/vtop` communicates with the **VTOP proxy service** (services/proxy-service) which performs CLI invocations and OAuth-signed MCP interactions. The proxy shares `hub-capabilities.json` via the `HUB_CAPABILITIES_PATH` fallback.

---

## 8. Broadcasts, Notifications & Emails

- **Broadcast slides** stored in `Broadcast` show up on login and the chat home page. They are pure JSON arrays of `{ title, text, image }`.
- **WhatsApp/Discord notifications** are orchestrated entirely in their respective services, but the main app exposes the webhook endpoints described above.
- **Daily briefing emails** come from `lib/email/resend.tsx` (custom JSX template with CTA buttons linking back to `/` + query params `hub=briefing` + `briefingAction=<command>`). They rely on environment variables `RESEND_API_KEY`, `RESEND_FROM`, `BRIEFING_APP_URL`.

---

## 9. Operations Checklist

- **Env Vars**: Keep `.env.example` current. Minimum for local dev: Google OAuth keys, `DATABASE_URL`, Upstash Redis, `UPSTASH_REDIS_REST_TOKEN`, VTOP proxy URL, `GOOGLE_GENERATIVE_AI_API_KEY`, `RESEND_API_KEY`, `RATE_LIMIT_ADMIN_EMAIL`.  
- **Secrets Hygiene**: `app/api/knowledge` dumps the entire RAG table—protect it in production via middleware/auth if needed.  
- **Known TODOs**: implement `getToolCallStats`, tighten auth around `/api/knowledge`, add missing `workflows` HTTP trigger (if desired).  
- **Testing**: `scripts/test-performance.ts` seeds sample chats, runs DB queries (`lib/performance-tester.ts` + `lib/db-optimizations.ts`), and prints summary stats.

Use this architecture doc whenever you’re wiring new APIs, adjusting auth flows, or verifying how data flows between the UI, backend, and services.
