<p align="center">
  <img src="public/assets/teaaa.png" alt="Project Logo">
</p>

<p align="center">
  <a href="https://the-everything-assistant.vercel.app">ask me anything here</a>
</p>

---

## Overview

The Everything Assistant is an AI-native campus companion that blends chat, workflows, and multi-channel agents. It ships a Next.js web experience, curated knowledge base + RAG stack, WhatsApp/Discord bots, FFCS tooling, and proxy services that make university systems feel realtime.

### Core Features

- **Conversational Interface**: Interact with the AI through a chat interface.
- **Tool Handling**: Integrate and utilize external tools or services.
- **Modular Structure**: Organized codebase with clear separation of concerns.
- **Microservices**: Some tools are built as microservices.

## Technology Stack

This project is built using modern web technologies:

- **Framework**: Next.js with TypeScript
- **UI**: Tailwind CSS
- **AI Integration**: Vercel AI SDk
- **Database**: Prisma ORM (with Neon)
- **Authentication**: NextAuth.js
- **Deployment**: Vercel, Heroku, Render


### Prerequisites

- Node.js 22.x (see `package.json` engines)
- pnpm 9+ (preferred) or npm 10+
- Postgres database
- Upstash Redis

### Install & Run Locally

```bash
git clone https://github.com/theg1239/the-everything-assistant.git
cd the-everything-assistant
cp .env.example .env
pnpm install
pnpm dev
```

The dev server runs at `http://localhost:3000`. Sign-in flows rely on NextAuth, so configure an OAuth provider (Google or email magic links) before testing gated routes.

### Database & Knowledge Base

```bash
pnpm prisma:migrate         # create or update schema
pnpm prisma:generate        # regenerate Prisma Client
pnpm prisma:studio          # inspect data locally
pnpm seed:rag               # seed the RAG corpus
pnpm seed:rag --fresh       # rebuild the corpus from scratch
```
## Project Layout

```
├── app/                    # App Router routes, layouts, actions, workflows, management UI
│   ├── api/                # Edge/server routes for chat tools, auth, telemetry
│   ├── chat/               # Main chat surface, streaming handlers, artifacts view
│   ├── dev/                # Internal developer utilities
│   ├── guidelines/         # In-product docs
│   ├── login/              # Auth + MFA flows
│   ├── mgmt/               # Broadcasts, moderation, rate limit dashboards
│   ├── workflows/          # Task-specific views and automation entries
│   └── layout.tsx ...      # Global layout + metadata
├── components/             # UI primitives, chat widgets, artifacts, dialogs, monitors
├── contexts/               # React context providers (memory, MFA, PDF dock, etc.)
├── hooks/                  # Client + server hooks (telemetry, auth, streaming helpers)
├── lib/                    # Tool callers, data clients, org logic, rate limiting helpers
├── prisma/                 # `schema.prisma`, migrations, seed helpers
├── providers/              # App-level providers (session, theme, PostHog, AI SDK)
├── public/                 # Static assets, onboarding artwork, placements data
├── services/               # Companion services + bots (proxy, deep-search, wa-bot, discord, papers, ffcs-extension)
├── scripts/                # RAG + performance scripts, utility CLIs
├── docs/                   # Living documentation and operational playbooks
├── types/, styles/, test/  # Shared types, Tailwind config, automated tests
└── ai-chatbot-main/        # Template scaffolding for spin-off assistants
```

## Companion Services & Channels

- `services/proxy-service` – Authenticated proxy/MCP server for VTOP and protected university endpoints.
- `services/deep-search` – Reddit + knowledge base enrichment worker powering `app/paper-search` and research previews.
- `services/wa-bot` – WhatsApp bot entrypoint synced with the chat tool catalog.
- `services/discord` – Discord bot + slash-command orchestration.
- `services/ffcs-extension` – FFCS scheduling/draft planner (bundled web extension +  API shim).
- `services/papers` – scripts and endpoints for paper ingestion + embeddings.

Each service folder documents its own install/run steps; some rely on Heroku/Render/Workers, others run locally via `npm install && npm run dev`.

## Documentation

`docs/README.md` is the hub for product, architecture, tools, multi-channel services, and operations. Start there whenever you add a feature so cross-links stay fresh. The `hub-capabilities.json` file mirrors the capabilities exposed to the assistant UI.

## Deployment

- **Vercel** – Deploy the Next.js app directly; see `vercel.json` and `vercel-template.json`.
- **Companion bots** – WhatsApp/Discord services ship their own env requirements; keep secrets per channel.

## Contributing

1. Fork the repository and create a branch (`feat/my-awesome-thing`).
2. Keep docs (`docs/`, `hub-capabilities.json`) in sync with code changes.
3. Open a pull request against `stable` with screenshots or Looms for UI changes.

## Issues

If you encounter any issues or have suggestions for improvements, please open an issue on the GitHub repository.
