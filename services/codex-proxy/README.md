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

## ChatGPT Login Mode

Default mode is `device` login, which works in VM/serverless deployments without localhost callback rewriting.

- `CODEX_PROXY_CHATGPT_LOGIN_MODE=device` (default): opens `https://auth.openai.com/codex/device`, user enters one-time code, proxy completes token exchange.
- `CODEX_PROXY_CHATGPT_LOGIN_MODE=browser`: uses Codex-managed localhost callback flow (`redirect_uri=http://localhost:...`). Only use this when browser and Codex app-server are on the same machine (or you intentionally tunnel localhost).

Optional OpenAI auth overrides:

- `CODEX_OPENAI_ISSUER` (default `https://auth.openai.com`)
- `CODEX_CHATGPT_CLIENT_ID` (default Codex client id)
- `CODEX_PROXY_OPENAI_REQUEST_TIMEOUT_MS`
- `CODEX_PROXY_DEVICE_AUTH_TIMEOUT_MS`
- `CODEX_PROXY_EXTERNAL_REFRESH_LEEWAY_MS`

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
