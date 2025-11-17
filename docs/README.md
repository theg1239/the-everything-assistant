# Everything Assistant Documentation Hub

_Last reviewed: 17 November 2025 (repo commit state at `main`)._

The Everything Assistant is a Next.js + Prisma stack that powers a VIT-centric agentic assistant with a web chat UI, personal hub, RAG search, exam tooling, and companion services (WhatsApp, Discord, proxy microservices, Reddit knowledge base, etc.).  
This folder collects living documentation so you can find capabilities quickly without spelunking through the entire tree.

## How to Use These Docs

- **Start with the product view** to understand the chat UX, hub, and admin panel.
- **Dive into the platform architecture** for API contracts, database entities, auth, rate limiting, and workflows.
- **Browse the tools & integrations** reference to see every automated capability exposed to the models.
- **Check the multi-channel + services guide** when working on companion bots, proxy servers, or Chrome extensions.
- **Use the operations & data playbook** for knowledge-base upkeep, scripts, seeding, and monitoring.

Each document links back to the relevant source files (paths are repo-relative, e.g. `components/chat-interface.tsx`). When referencing code in conversations or PRs, cite the same paths with line numbers per our contributing guide.

## Table of Contents

1. [`01-product-experience.md`](./01-product-experience.md) – chat UX, hub, onboarding, admin UI.
2. [`02-platform-architecture.md`](./02-platform-architecture.md) – routing, APIs, auth/MFA, database, rate limiting, workflows.
3. [`03-tools-and-integrations.md`](./03-tools-and-integrations.md) – `lib/tools`, hub capabilities, scrapers, RAG assets, placements/mess/course data.
4. [`04-multi-channel-and-services.md`](./04-multi-channel-and-services.md) – WhatsApp + Discord bots, VTOP proxy, Reddit deep-search, papers portal, FFCS extension, template apps.
5. [`05-operations-and-data.md`](./05-operations-and-data.md) – context data, scripts, seeding, broadcasts, telemetry, environment + known gaps.

## Keeping This Folder Fresh

- Update the relevant markdown file whenever you add a new feature, API, script, or service.
- Cross-link new sections so discoverability stays high (e.g. add to both the TOC above and any affected doc).
- When adding tooling or data assets, mention prerequisites (env vars, queues, DB schemas) in **02** or **05** as appropriate.
- If you spot stale facts (dates, semester info, CLI flags), fix them immediately; parts of the assistant surface that copy verbatim to users.

_Questions or suggestions?_ Drop a note in `docs/README.md` with a TODO, or open an issue tagged `docs`. Keeping this directory accurate is the easiest way to make the assistant feel “omniscient” without re-reading 1,000+ files each time.
