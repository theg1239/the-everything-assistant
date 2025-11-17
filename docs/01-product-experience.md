# 01 · Product Experience

This guide walks through everything a user (student, admin, or reviewer) can touch inside the primary Next.js app: chat, the personal hub, onboarding, memories, PDF dock, follow-up prompts, broadcasts, and the emoji-laden management center.

> Key entry points: `app/page.tsx`, `app/chat/[id]/page.tsx`, and `components/chat-interface.tsx`.

---

## 1. Chat Interface & Session Flow

### Login & Routing
- Users authenticate via Google OAuth (NextAuth) before hitting `/` (`app/page.tsx`) or the explicit multi-chat route (`app/chat/[id]/page.tsx`). Unauthed sessions are redirected to `/login`.
- `components/login-form.tsx` renders the branded login card; `app/guidelines/(terms|privacy)/page.tsx` host static policy pages referenced in the CTA.

### Chat Surface (`components/chat-interface.tsx`)
- Renders a streaming transcript using `VirtualizedMessages`, model metadata, and `useChatStore` (Zustand) to coordinate UI state (selected tool, “full chat” layout, last user prompt).
- Injects:
  - **Chat header** with the active broadcast highlight.
  - **Multimodal composer** (`components/multimodal-input.tsx`) exposing:  
    - Message textarea with auto-resize + keyboard submit  
    - File picker paste/drop, stub icons for voice/image capture  
    - Tool dropdown integration (see below)  
    - Stop button wired to `useChat` streaming controller.
  - **Attachments & PDF dock** (mobile + desktop controls in `components/pdf-dock.tsx`, driven by `contexts/pdf-dock-context.tsx`). Files stay persisted in `localStorage` so users can reopen or minimize documents mid-chat.
  - **Suggested question chips** (`components/suggested-questions.tsx`) and follow-up suggestions (see §3).
  - **Scroll-to-top control**, rate-limit banners, streaming error overlays, and onboarding dialog toggles.

### Canvas & Rich Notes
- `/api/canvas` (`app/api/canvas/route.ts`) lets the UI save/read/update ad-hoc “Canvas documents” per chat for brainstorming or pasted PDFs.  
- CRUD actions run through `lib/db.ts` helpers (`createCanvasDocument`, `updateCanvasDocument`, `getCanvasDocuments`).

### Voting & Titles
- Quick reactions call `/api/vote` to persist `Vote` rows.  
- Chat titles auto-generate via `generateChatTitle` inside `app/api/chat/route.ts` using Groq (`meta-llama/llama-4-scout-17b…`) with a 5‑second guard; fallback is `extractTitleFromContent`.

### Broadcast Banner
- `app/page.tsx` fetches `/api/broadcast/latest` during SSR and injects the newest slide deck (author-created via the admin panel). The same dataset is managed at `/api/broadcast` (GET/PUT/DELETE).

---

## 2. Tooling Controls & Secure VTOP Prompts

### Tools Dropdown (`components/tools-dropdown.tsx`)
- Provides a user-facing selector for curated contexts: general chat, live web search, Reddit KB, VTOP access, past papers, mess menu. Selecting a tool updates `useChatStore.selectedTool`, influencing placeholder copy and enabling targeted prompts on the model side.

### Credential Flow (`components/vtop-tool-handler.tsx`)
- Listens for `vtopLoginTrigger` events emitted when `lib/tools.ts` returns `requiresCredentials`.  
- Opens `VTOPCredentialsDialog`, storing encrypted credentials locally via `lib/vtop-credentials.ts` (AES cipher tied to a session key Cookie).  
- Once credentials exist, auto-resubmits in the background. Hub overlays (next section) reuse the same storage.

### Memory Awareness
- The chat component wraps everything with `MemoryProvider` / `useMemory` (`contexts/memory-context.tsx`, `hooks/use-memories.ts`).  
- When memory auto-save is enabled (`MemorySettings` stored via `/api/memories/settings`), the assistant can write structured “facts” using the `saveMemory` tool (see `lib/memory/memory-tools.ts`).

---

## 3. Personalization Surfaces

### Follow-Up Suggestions
- `components/follow-up-suggestions.tsx` calls `/api/suggestions` (implemented in `app/api/suggestions/route.ts`) which uses `lib/follow-up-generator.ts` and `rateLimitedAI.google` to synthesize three next questions.  
- Suggestions respect the current semester context (`getCurrentVITContext`) and the assistant’s declared capabilities (mess menu, attendance, schedule, placements, etc.).

### Memories Manager
- `/api/memories` + `/api/memories/[id]` expose list/create/update/delete operations.  
- UI hooks handle optimistic updates and pagination; the settings card (auto-save toggle, filters) travels through the same API.

### User Preferences
- `/api/user/preferences` stores UI-specific config (onboarding, follow-up toggle, “aurora” background, daily briefing settings).  
- Chat uses `useOnboarding` (`hooks/use-onboarding.ts`) to determine whether to auto-launch the intro modal.

---

## 4. Personal Hub & VTOP Snapshots

### Hub Shell (`components/hub/hub.tsx`)
- Slides up via `vaul` drawer with controls for closing, sync status, and linking.  
- Relies on `HubStoreProvider` for cross-panel state (selected snapshot, sync progress, quick actions).  
- Panels live under `components/hub/panels` (VTOP quick cards, Reddit feed, placement stats, past papers, mess menu, syllabi).

### Snapshot Sources
- `app/actions/hub.ts` orchestrates everything server-side:
  - `loadPersonalHubState` builds the current `PersonalHubState` from Prisma `VTOPSnapshot` rows (`lib/vtop-snapshots.ts`).
  - `syncCoreHubSnapshots` hits the proxy batch endpoint to refresh the nine “core” commands (profile, timetable, attendance, marks, cgpa, exams, da, etc.).
  - `refreshVTOPSnapshotAction` executes a single VTOP tool call when the user taps “Refresh” in the UI.
  - `runHubToolAction` proxies any other tool defined in `lib/tools.ts`.
- Capabilities, parser hints, auto-sync flags, and interactive requirements are defined in `hub-capabilities.json` + `lib/hub/capabilities.ts`. Adding a new VTOP CLI command requires updating both.

### Daily Briefing
- `lib/hub/daily-briefing.ts` summarizes snapshots into quick “messages” and CTA chips, also used by the hub overlay (`components/hub/daily-briefing-overlay.tsx`).  
- `app/workflows/daily-briefing/workflow.ts` (started via `app/actions/workflows.ts` or `/api/(mgmt)/hub/send-briefing`) iterates eligible users, composes emails through `lib/email/resend.tsx`, and logs delivery stats.

---

## 5. Guidance, Onboarding & Policies

- Privacy + Terms pages live in `app/guidelines/privacy/page.tsx` and `app/guidelines/terms/page.tsx`; they are linked from the login card and should be updated any time data handling changes.
- The onboarding dialog (`components/onboarding-dialog.tsx`) listens to `useOnboarding` for first-run triggers and exposes a “reset onboarding” action via localStorage.
- Rate-limit warnings bubble up from `contexts/rate-limit-context.tsx` + `/api/(mgmt)/rate-limit-status` so the UI can caution heavy users before throttling.

---

## 6. Broadcasts & Admin-Facing UI

### Creating Broadcasts
- `/api/broadcast/send` (POST), `/api/broadcast` (GET for list, PUT/DELETE to edit/remove).  
- Broadcasts are stored in `Broadcast` Prisma table and fanned out to the chat header via `getLatestBroadcast` in `app/page.tsx`.

### Management Portal (`app/mgmt`)
- Guarded by `RATE_LIMIT_ADMIN_EMAIL` inside `app/mgmt/page.tsx`.  
- Key widgets/components:
  - **Overview** (`components/overview.tsx`): lifetime vs recent token charts (using `/api/(mgmt)/usage` + `lib/stats.ts`), highlights top bursts, counts total users and 30‑minute message volume.
  - **Token usage heatmap + chart** (`components/token-usage-chart.tsx`, `components/token-usage.tsx`).
  - **User explorer** (`components/users-list.tsx`) hitting `/api/(mgmt)/users`.
  - **User messages browser** (`components/messages-viewer.tsx`, `/api/(mgmt)/user-messages` and `/api/(mgmt)/chat-messages/[chatId]`).
  - **Hub briefing dispatcher** (`components/briefing-dispatch.tsx`) to email any user’s stored snapshots.
  - **API key & rate-limit health** (`components/api-key-mgmt.tsx`, `/api/(mgmt)/rate-limit-status`).
  - **System stats** (`components/system-statistics.tsx`, `components/system-health.tsx`) showing Redis/env validation warnings, active broadcasts, etc.
- Note: `lib/stats.ts:getToolCallStats` is currently a stub; the admin UI hides the widget gracefully, but filling it would let you visualize per-tool invocation counts.

---

## 7. WhatsApp & Discord Entry Points (UI Hooks)

Although the bots run as separate services (see `04-multi-channel-and-services.md`), the main app exposes `/api/whatsapp-bot` for secure ingress. The chat UI itself doesn’t reference these endpoints, but administrators can trigger WhatsApp broadcasts through the webhook interface (`services/wa-bot/server.js`).

Discord and WhatsApp conversations ultimately create standard `User`, `Chat`, `Message`, and `Memory` rows, so everything you see in the product surface applies to those channels once the bot forwards content to `/api/chat`.

---

### TL;DR

The product layer is a cohesive mix of:
- **Chat-first UX** with power-user affordances (tool shortcuts, PDF dock, auto titles, follow-ups).
- **A structured VTOP hub** that keeps snapshots synced, exposes quick actions, and feeds daily briefings.
- **Personal memory + context toggles** so responses can stay bespoke without re-asking everything.
- **A playful yet insightful admin portal** filled with charts, broadcast editors, and health dashboards.

Use this doc whenever you’re about to tweak UX copy, add a new panel, or wire a tool into the conversation flow—you’ll know exactly which components, contexts, and APIs are involved.
