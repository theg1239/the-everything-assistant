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

## Isolation (read-only, no built-in tools, no secrets)

A `read-only` Codex sandbox still lets the model run read-only shell commands without approval, so
the proxy does not rely on it alone:

- every thread starts with `sandbox: "read-only"`, `approvalPolicy: "never"`, `environments: []` and
  a `config` map that disables Codex's built-in tools (`features.shell_tool`, `unified_exec`,
  `view_image`, `multi_agent`, `goals`, `apps`, `plugins`, browser/computer use, ...;
  `web_search = "disabled"`; `shell_environment_policy.inherit = "none"`). The same keys are passed
  to `codex app-server` as `-c key=value` overrides. Only the app's dynamic tools reach the model.
  See `src/security.ts` (`CODEX_LOCKDOWN_CONFIG`).
- `codex app-server` gets an allow-listed environment only (`PATH`, `LANG`/`LC_*`, `TZ`, TLS/proxy
  vars, `RUST_LOG`) with `HOME` and `CODEX_HOME` set to the user's own home. Server secrets
  (including `CODEX_PROXY_AUTH_TOKEN`) are never inherited.
- per-user homes live under `CODEX_APP_SERVER_HOME_ROOT/<userId>` (ids outside `[A-Za-z0-9_-]` are
  hashed), are created/tightened to `0700`, must not be symlinks, and must resolve directly under the
  root. Each thread's `cwd` is the user's empty `<home>/workspace`; request-body `cwd` and the old
  `CODEX_APP_SERVER_CWD` are ignored.
- command/file approvals are always denied.
- unsafe flags from `CODEX_FLAGS`/`CODEX_APP_SERVER_FLAGS` are stripped
  (`--dangerously-bypass-approvals-and-sandbox`, `--yolo`, `--full-auto`, `--sandbox`,
  `--ask-for-approval`, `--enable`, and `-c` overrides of `features.*`, `web_search`, `tools.*`,
  `sandbox*`, `approval_policy`, `shell_environment_policy.*`, `mcp_servers.*`).

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

## Auth and binding

`CODEX_PROXY_AUTH_TOKEN` is required; the proxy refuses to start without it. Send it as:

- `Authorization: Bearer <token>`
- or `x-codex-proxy-token: <token>`

Tokens are compared in constant time. Every endpoint except `GET /health` requires it.

Request bodies carry a `userId`, which the proxy trusts: only the main app holds the token and it
always sends the signed-in user's id. The token is therefore what authorises acting on behalf of
any user — treat it like a database password and rotate it if leaked.

- `CODEX_PROXY_HOST` (or `HOST`) — bind address, default `127.0.0.1`. VM deployments reached by the
  app over the network set `CODEX_PROXY_HOST=0.0.0.0` and should sit behind TLS.
- `CODEX_PROXY_PORT` — default `8788`.
- `CODEX_PROXY_INSECURE_DEV=1` — local development only: allows starting without a token
  (ignored when `NODE_ENV=production`).

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

When `CODEX_PROXY_URL` is present, `lib/codex/app-server.ts` will call this service instead of spawning local `codex`. In production it refuses to call the proxy without `CODEX_PROXY_AUTH_TOKEN`.
