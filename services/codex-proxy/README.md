# codex-proxy

Bun-native proxy service that runs `codex app-server` on a VM and exposes low-latency HTTP endpoints.

## Why

Your Next.js/API layer can run serverless while Codex stays on a stateful VM with:

- `codex` binary installed
- persistent `CODEX_HOME`
- long-lived per-user app-server sessions

## Endpoints

- `GET /health`
- `POST /v1/chatgpt/status` `{ userId }`
- `POST /v1/chatgpt/start` `{ userId }`
- `GET /v1/chatgpt/login/callback` (public OAuth callback bridge)
- `POST /v1/chatgpt/cancel` `{ userId, loginId }`
- `POST /v1/chatgpt/disconnect` `{ userId }`
- `POST /v1/chatgpt/turn/start` `{ userId, options }`
- `POST /v1/chatgpt/turn/next` `{ userId, runId, timeoutMs? }`
- `POST /v1/chatgpt/turn/tool-result` `{ userId, runId, requestId, result }`
- `POST /v1/chatgpt/turn/close` `{ userId, runId }`
- `POST /v1/chatgpt/turn` `{ userId, options }` (legacy single-call path)
- `POST /v1/chatgpt/dispose` `{ userId }`

`turn/start + turn/next + turn/tool-result` is the fast tool passthrough path used by the app so AI SDK tools execute in the app runtime while Codex runs on the VM.
This path also forwards Codex reasoning traces and summary-style events back to the app stream.

## Read-only Enforcement

The proxy hard-enforces read-only execution for Codex turns:

- `turn/start` always sends `sandbox: "read-only"` and `approvalPolicy: "never"`.
- command/file approvals are always denied.
- unsafe flags from env args are stripped (`--dangerously-bypass-approvals-and-sandbox`, `--yolo`, `--full-auto`, `--sandbox`, `--ask-for-approval`).
- if `CODEX_APP_SERVER_CWD` is set, it is always used as the working directory (per-request cwd is ignored).

## OAuth Callback Bridge

Codex login URLs use a localhost callback by default. In VM deployments, set:

- `CODEX_PROXY_PUBLIC_BASE_URL=https://your-proxy-domain`

When set, `/v1/chatgpt/start` rewrites the auth callback to the proxy's public callback endpoint and forwards it internally to the VM-local Codex login server.

## Auth

Set `CODEX_PROXY_AUTH_TOKEN` and send it as:

- `Authorization: Bearer <token>`
- or `x-codex-proxy-token: <token>`

## Run

```bash
cd services/codex-proxy
cp .env.example .env
bun run dev
# or
bun run start
```

## App Integration Env

Set these in your main app deployment:

- `CODEX_PROXY_URL=https://your-vm-host:8788`
- `CODEX_PROXY_AUTH_TOKEN=...`
- `CODEX_PROXY_TIMEOUT_MS=120000`

When `CODEX_PROXY_URL` is present, `lib/codex/app-server.ts` will call this service instead of spawning local `codex`.
