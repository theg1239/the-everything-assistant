# 04 · Multi-Channel & Companion Services

Besides the main Next.js app, the repo contains several standalone services and clients that extend the assistant into other channels or provide specialized backends. This doc summarizes what each service does, how it talks to the core app, and how to run or extend it.

---

## 1. WhatsApp Bot (`services/wa-bot`)

### Overview
- Express server (`server.js`) wrapping `whatsapp-web.js`. Handles QR login, reconnection, chunked message streaming, and a health monitor.
- Includes `whatsapp-service.js` (business logic) and `api-client.js` (forwarding requests to the main app via `MAIN_APP_URL` + `MAIN_APP_API_KEY`).

### Key Endpoints
| Route | Purpose |
| --- | --- |
| `GET /health` | Service heartbeat (uptime, WhatsApp readiness, memory usage). |
| `GET /api/whatsapp/status` | Connection info (ready flag, active chats, client metadata). |
| `POST /api/whatsapp/send` | Send outbound messages (requires body `{ phoneNumber, message }`). |
| `POST /api/webhook` | Receive broadcasts/system messages from the core app. |
| `GET /api/whatsapp/conversations` | Inspect active chat sessions. |
| `POST /api/whatsapp/restart` | Reinitialize the WhatsApp client. |
| `POST /api/whatsapp/test` | Trigger a test ping to a phone number. |

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
- Bridges the assistant and the VTOP CLI (binary stored in `services/proxy-service/binary*`).  
- Enforces OAuth 2.0 (PKCE) for MCP transports, so credentials never flow through chat payloads.  
- Exposes the same `hub-capabilities.json` manifest used by the UI to keep naming/parsers consistent.

### Endpoints
| Route | Description |
| --- | --- |
| `POST /vtop` | Execute a single CLI command (requires username + password or encrypted bundle). |
| `POST /vtop-interactive` | Start/advance interactive workflows (course-page). |
| `POST /vtop-interactive-continue` | Submit selections for an existing workflow session. |
| `POST /mcp` | MCP JSON-RPC endpoint (streamable HTTP or SSE fallback). Requires OAuth tokens. |
| `GET /commands` | List supported CLI commands. |
| `/oauth/*`, `/register` | OAuth 2.0 authorization server, PKCE support, client registration. |
| `/health` | Binary health check. |

### Extras
- `mcp-inspector.config.json` preconfigures Model Context Protocol Inspector to talk to the proxy.
- `workflows/course-page.js` encapsulates multi-step scraping for “course materials” (auto-semester/course/faculty inference).
- Rate limits: global + per-user VTOP limits (cache in-memory via `NodeCache`).

---

## 4. Reddit Deep Search (`services/deep-search`)

See §5 in `03-tools-and-integrations.md` for data flow. Operational notes:

- Node/Express app with verbose logging (request + response bodies).  
- `AgenticRAGService` and `RAGService` share the same `knowledge-base/knowledge-base` for direct vector lookups and fallback full-text search.  
- Scrapers support image OCR + Gemini Vision for memes/screenshots.  
- You can run `node cli.js scrape` to populate the DB, `node api-server.js` to serve endpoints, and `node test-zod-schema.js` / `test-video-analysis.js` for debugging.

---

## 5. Papers Portal (`services/papers`)

### What It Is
- A standalone Next.js app allowing admins to upload exam papers (PDFs or pasted images), run OCR, and review stored papers.  
- Components:
  - `components/upload-form.tsx` (drag/drop, paste, multiple file support, upload progress).  
  - `components/papers-list.tsx` (paginated gallery).  
  - `actions/uploadPaper.ts` (Server Action hooking to Cloudinary, `pdf-lib`, sharp, Gemini object output).  
- Tailwind UI with glassmorphism, fancy backgrounds, and card-based layout (`src/app/page.tsx`).

### Storage
- Uses Drizzle ORM with `drizzle.config.ts` (SQLite or Postgres, depending on env).  
- Upload pipeline:
  1. Validate file types/size and merge if multiple images are pasted.  
  2. Upload to Cloudinary (envs: `CLOUDINARY_*`).  
  3. Feed the PDF into `generateObject` (Gemini) with `PaperMetadataSchema`.  
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

| Service | Default Port | Start Command | Depends On |
| --- | --- | --- | --- |
| Main Next.js app | 3000 | `npm run dev` | CockroachDB (`DATABASE_URL`), Redis, Google OAuth, VTOP proxy (optional), Resend (optional) |
| WhatsApp bot | 3001 | `cd services/wa-bot && npm run dev` | Chromium deps (`install-chrome-*.sh`), `MAIN_APP_API_KEY`, `MAIN_APP_URL` |
| VTOP proxy | 3001 (if standalone) | `cd services/proxy-service && npm run dev` | VTOP CLI binary, `hub-capabilities.json`, OAuth envs |
| Discord bot | 3002 (Express) | `cd services/discord && npm run dev` | Discord token, API key to main app |
| Reddit deep-search | 3002 | `cd services/deep-search && node api-server.js` | Postgres (`DATABASE_URL2_RAG`), Gemini API key |
| Papers portal | 4000 (configurable) | `cd services/papers && npm run dev` | Cloudinary, Drizzle DB |

> Note: Ports overlap intentionally (WhatsApp vs proxy vs deep-search). Adjust `.env` or `Procfile` when co-running.

---

## 9. Operational Tips

- **Secrets**: each service ships with an `.env.example`; copy it before running anything.  
- **Logging**: all services log verbosely (esp. proxy + deep-search). Use `PROXY_VERBOSE_LOGS=0` or custom loggers if you deploy to production.  
- **Health Checks**: expose `/health` endpoints to uptime monitors (WhatsApp, proxy, deep-search, Discord).  
- **Deployments**: host long-lived bots on Render/Heroku/PM2, but ensure `MAIN_APP_API_KEY` stays synced with the core app’s `WHATSAPP_BOT_API_KEY`.

Use this doc whenever you need to extend a companion service, debug cross-channel messaging, or understand how the assistant stretches beyond the browser UI.
