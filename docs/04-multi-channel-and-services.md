# 04 · Multi-Channel & Companion Services

Besides the main Next.js app, the repo contains several standalone services and clients that extend the assistant into other channels or provide specialized backends. This doc summarizes what each service does, how it talks to the core app, and how to run or extend it.

---

## 1. WhatsApp Bot (`services/wa-bot`)

### Overview

- Express server (`server.js`) wrapping `whatsapp-web.js`. Handles QR login, reconnection, chunked message streaming, and a health monitor.
- Includes `whatsapp-service.js` (business logic) and `api-client.js` (forwarding requests to the main app via `MAIN_APP_URL` + `MAIN_APP_API_KEY`).

### Key Endpoints

| Route                             | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `GET /health`                     | Service heartbeat (uptime, WhatsApp readiness, memory usage).      |
| `GET /api/whatsapp/status`        | Connection info (ready flag, active chats, client metadata).       |
| `POST /api/whatsapp/send`         | Send outbound messages (requires body `{ phoneNumber, message }`). |
| `POST /api/webhook`               | Receive broadcasts/system messages from the core app.              |
| `GET /api/whatsapp/conversations` | Inspect active chat sessions.                                      |
| `POST /api/whatsapp/restart`      | Reinitialize the WhatsApp client.                                  |
| `POST /api/whatsapp/test`         | Trigger a test ping to a phone number.                             |

### Security & Rate Limits

- CORS + Helmet + configurable rate limiter (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`).
- Requests to `/api/webhook` or `/api/whatsapp/send` should include the `WEBHOOK_SECRET` or API key header.
- Message replay/back-pressure is controlled via `activeChats` maps and `processingTimeMs`.

### Integration with Core App

- All inbound messages are relayed to `/api/whatsapp-bot` (main app). That route handles API key validation, bootstraps a pseudo-user (email derived from phone/user ID), and invokes `rateLimitedAI` with proper memories/preferences.

---

## 2. Discord Bot (`services/discord`)

### Features

- Built with `discord.js` v14 and Express. Supports:
  - Slash commands (`/ask`, `/status`, `/help`) registered globally and per guild.
  - Owner-only commands (context analysis, `@everyone` tagging) flagged by `BOT_OWNER_ID`.
  - Automatic rate limiting per user, context storage, DM forwarding, “smart routing” (long replies go to DM unless owner overrides).
  - Health endpoints mirroring the WhatsApp service (`GET /health`, `GET /api/discord/status`, etc.).

### Flow

1. Discord messages arrive via `discord-service.ts`, which builds conversation context (up to `maxMessages` per channel).
2. When the bot needs AI, it calls the main app through `api-client.ts` (same signature as WhatsApp).
3. Responses get chunked, optionally sent as embeds with attachments. Owner privileges allow mass pings or context analysis.

### Deployment

- Configure `DISCORD_TOKEN`, `BOT_OWNER_ID`, `MAIN_APP_URL`, `MAIN_APP_API_KEY`.
- Use `npm run dev` / `npm start` or wrap with PM2. Slash commands auto-register on startup.

---

## 3. VTOP Proxy Service (`services/proxy-service`)

### Purpose

- Bridges the assistant and [cli-top](https://cli-top.acmvit.in) v2.12.1 (Linux build committed at `services/proxy-service/binary`, override with `BINARY_PATH`). It drives cli-top only through its machine-facing `cli-top proxy <user> <password> <command> [flags]` JSON protocol: one zod-validated envelope per run, `selection_required` steps instead of prompts, no stdin/stdout scraping.
- Exposes every cli-top proxy command (profile, marks, grades, attendance, timetable, today, tomorrow, dayafter, holiday, calendar, exams, cgpa, receipts, hostel, library-dues, msg, events, leave/nightslip status **and apply**, da, facility, syllabus, course-page, course-page-archive, course-allocation, sync) plus the legacy aliases. The command list, per-command flag allow-list, multi-step steps and cache TTLs come from the shared root `hub-capabilities.json`.
- Multi-step commands use one generic model: a request either completes or returns `needs_selection` / `needs_input` / `needs_confirmation` with options and an encrypted, short-lived `continuation` token; `POST /vtop/continue` with a `choice` resumes it by re-running cli-top with the accumulated flags (stateless, survives restarts). Natural-language hints (`select: { course: "CSE1001", faculty: "anuj", materials: "module 2" }`) resolve steps automatically.
- Downloads (course materials, syllabus, DA papers, exam `.ics`) are collected from a private per-run `HOME`, served through HMAC-signed expiring `/files/...` links (plus a `.zip` bundle) and deleted after `FILE_TTL_SECONDS`.
- Performance: per-user TTL cache for reads, single-flight de-duplication, a queue with global + per-user concurrency caps (1 VTOP session per student at a time), one-login `sync` batches (NDJSON streaming), and a cached cli-top kill-switch document so children skip a blocking HTTPS fetch per spawn.
- Security: every VTOP endpoint requires the shared secret `PROXY_API_KEY` (`Authorization: Bearer`, fail-closed); MCP transports use OAuth 2.0 + PKCE (consent secret required, no auto-registration by default, refresh-token rotation). cli-top children get an allow-listed environment and an isolated working directory. See the service README for details and known limits (cli-top only accepts the password as an argument).

### Endpoints

| Route                                     | Description                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /vtop`                              | Run a command: `{ command, username, password, flags?, select?, confirm?, fresh? }`.       |
| `POST /vtop/continue`                     | Continue a multi-step command: `{ continuation, choice, password }`.                      |
| `POST /sync` (alias `/vtop-sync`)         | Batch refresh with one login; `?stream=1` streams NDJSON (cached entries first).          |
| `POST /vtop-interactive`, `…-continue`    | Legacy course-page workflow API (adapter over the generic workflow).                      |
| `GET /files/:id/:name`, `/files/bundle/…` | Signed, expiring download links.                                                            |
| `POST /mcp`                               | MCP JSON-RPC (streamable HTTP or SSE): one tool per command + `vtop-continue` + `sync`.   |
| `GET /commands`                           | Catalog: commands, params, steps, kinds, cache TTLs.                                       |
| `/oauth/*`, `/register`                   | OAuth 2.0 authorization server for MCP clients.                                            |
| `GET /health` (public), `GET /stats`      | Health (binary, kill switch, auth configured) / cache, queue and file-store counters.      |

### App integration

- `lib/vtop-proxy.ts` holds the zod schemas and the HTTP client (sends `VTOP_PROXY_API_KEY`); `lib/tools.ts` (`queryVTOP`) maps tool input to `flags` + `select` hints, uses the user's server-side stored credentials, and continues workflows with `continuation` + `choice`.
- `components/vtop-workflow-card.tsx` renders pending steps (options, filters, multi-select, confirmations) and downloaded files; picking an option pre-fills the chat input.
- Tests: `cd services/proxy-service && npm test` (node:test against a protocol-faithful fake cli-top in `test/fixtures/`); `npm run bench` for latency numbers.

---

## 4. Reddit Deep Search (`services/deep-search`)

See §5 in `03-tools-and-integrations.md` for data flow. Operational notes:

- Node/Express app with verbose logging (request + response bodies).
- `AgenticRAGService` and `RAGService` share the same `knowledge-base/knowledge-base` for direct vector lookups and fallback full-text search.
- Scrapers support image OCR + Gemini Vision for memes/screenshots.
- You can run `node cli.js scrape` to populate the DB, `node api-server.js` to serve endpoints, and `npm run test:schema` / `npm run test:video` for debugging.

---

## 5. Papers Portal (`services/papers`)

### What It Is

- A standalone Next.js app allowing admins to upload exam papers (PDFs or pasted images), run OCR, and review stored papers.
- Components:
  - `components/upload-form.tsx` (drag/drop, paste, multiple file support, upload progress).
  - `components/papers-list.tsx` (paginated gallery).
  - `actions/uploadPaper.ts` (Server Action hooking to Cloudinary, `pdf-lib`, sharp, and OpenAI structured vision output).
- Tailwind UI with glassmorphism, fancy backgrounds, and card-based layout (`src/app/page.tsx`).

### Storage

- Uses Drizzle ORM with `drizzle.config.ts` (SQLite or Postgres, depending on env).
- Upload pipeline:
  1. Validate file types/size and merge if multiple images are pasted.
  2. Upload to Cloudinary (envs: `CLOUDINARY_*`).
  3. Feed the PDF into `generateObject` (GPT-5.6 Luna) with `PaperMetadataSchema`.
  4. Save metadata + OCR text in the DB (`db/schema.ts`).
  5. Emit toast notifications + refresh list via ref callbacks.

---

## 6. FFCS Chrome Extension (`services/ffcs-extension`)

- Minimal MV3 extension that injects `content.js` into `vtop.vit.ac.in` pages.
- Popup (`popup.html` + `popup.js`) offers a “Scrape” button. On click:
  - Checks if the active tab is VTOP.
  - Injects `content.js`, which scrapes course allocation tables and triggers a download (CSV).
  - Popup receives status updates via `chrome.runtime.onMessage`.
- Manifest permissions: `activeTab`, `scripting`, `downloads`, host permissions for VTOP.

---

## 8. Running Everything Together

| Service            | Default Port         | Start Command                                   | Depends On                                                                                  |
| ------------------ | -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Main Next.js app   | 3000                 | `npm run dev`                                   | CockroachDB (`DATABASE_URL`), Redis, Google OAuth, VTOP proxy (optional), Resend (optional) |
| WhatsApp bot       | 3001                 | `cd services/wa-bot && npm run dev`             | Chromium deps (`install-chrome-*.sh`), `MAIN_APP_API_KEY`, `MAIN_APP_URL`                   |
| VTOP proxy         | 3001 (if standalone) | `cd services/proxy-service && npm run dev`      | VTOP CLI binary, `hub-capabilities.json`, OAuth envs                                        |
| Discord bot        | 3002 (Express)       | `cd services/discord && npm run dev`            | Discord token, API key to main app                                                          |
| Reddit deep-search | 3002                 | `cd services/deep-search && node api-server.js` | Postgres (`DATABASE_URL2_RAG`), Gemini API key                                              |
| Papers portal      | 4000 (configurable)  | `cd services/papers && npm run dev`             | Cloudinary, Drizzle DB                                                                      |

> Note: Ports overlap intentionally (WhatsApp vs proxy vs deep-search). Adjust `.env` or `Procfile` when co-running.

---

## 9. Operational Tips

- **Secrets**: each service ships with an `.env.example`; copy it before running anything.
- **Logging**: deep-search logs verbosely. The VTOP proxy logs only method/path/status/duration and masked usernames (never credentials, argv or VTOP output); `PROXY_VERBOSE_LOGS=1` adds debug logs outside production.
- **Health Checks**: expose `/health` endpoints to uptime monitors (WhatsApp, proxy, deep-search, Discord).
- **Deployments**: host long-lived bots on Render/Heroku/PM2, but ensure `MAIN_APP_API_KEY` stays synced with the core app’s `WHATSAPP_BOT_API_KEY`.

Use this doc whenever you need to extend a companion service, debug cross-channel messaging, or understand how the assistant stretches beyond the browser UI.
