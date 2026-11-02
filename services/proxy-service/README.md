# VTOP Proxy Service

Authenticated HTTP + MCP service that runs [cli-top](https://cli-top.acmvit.in) (v2.12.1, Linux
build committed as `./binary`) on behalf of the Everything Assistant app, the WhatsApp/Discord
bots (via MCP) and MCP clients.

It talks to cli-top **only through its machine-facing proxy protocol**
(`cli-top proxy <username> <password> <command> [flags]`, see `cmd/proxy_command.go` in the
cli-top source). There is no text-prompt scraping and no stdin automation.

```bash
npm install
cp .env.example .env    # set PROXY_API_KEY, PROXY_TOKEN_SECRET, MCP_OAUTH_CONSENT_SECRET
npm start               # or: npm run dev
npm test                # node:test suite against a fake cli-top (no VTOP access needed)
npm run bench           # latency benchmark against the fake cli-top
npm run check           # node --check every JS file
```

For local development on macOS/Windows point `BINARY_PATH` at your own cli-top build (or at
`test/fixtures/fake-cli-top.js`).

---

## Architecture

```
HTTP (/vtop, /vtop/continue, /sync, legacy /vtop-interactive*)      MCP (/mcp, one tool per command)
        │  shared-secret auth                                          │  OAuth 2.0 + PKCE
        └──────────────────────────────┬───────────────────────────────┘
                                 VtopService (src/service.js)
   validation (catalog) → result cache → single-flight → scheduler → CliRunner → envelope → result
                 │                                                        │
        workflow engine: selection / input / confirmation steps,   per-run isolated HOME/cwd,
        hint matching, encrypted continuation tokens                allow-listed env, downloads
                                                                    → FileStore (signed URLs)
```

| Module                     | Responsibility                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/catalog.js`           | Loads `hub-capabilities.json`, per-command flag allow-list, value validation, argv construction.  |
| `src/cli/runner.js`        | Spawns cli-top in a private run directory with a minimal environment; timeouts; download discovery. |
| `src/cli/envelope.js`      | zod schema for the proxy envelope; finds the JSON line after login text.                          |
| `src/cli/errors.js`        | Error taxonomy → HTTP status / retryability / user message.                                       |
| `src/cli/output.js`        | Re-renders captured tables as text, extracts web links, builds options.                           |
| `src/cli/latest-json.js`   | Caches cli-top's kill-switch document and serves it to children over loopback.                   |
| `src/service.js`           | Cache, single-flight, retries, the multi-step workflow engine, `sync`.                            |
| `src/scheduler.js`         | FIFO queue with global and per-user concurrency caps.                                             |
| `src/workflow/token.js`    | AES-256-GCM continuation tokens.                                                                   |
| `src/workflow/match.js`    | Natural-language hint matching ("CSE1001", "dsa", "anuj", "module 2", "previous semester").      |
| `src/files/store.js`       | Download store, signed URLs, streaming, ZIP bundles, TTL cleanup.                                 |
| `src/workflows/course-page.js` | Legacy `/vtop-interactive` adapter over the generic engine.                                    |
| `src/mcp/server.js`        | MCP tools.                                                                                          |
| `src/oauth/*`              | MCP OAuth authorization server.                                                                     |

### What cli-top's proxy protocol provides (from the source, c3d14de)

- **Envelope**: one JSON line `{ success, command, version, requested_at, completed_at, duration_ms, reg_no, flags, output, structured_data: { tables, selection_requests, messages }, error: { kind, message } }`. Tables are *not* printed in proxy mode (`PrintTable` only captures a snapshot), so `output` only holds the non-table lines; the proxy re-renders tables in cli-top's box format so older text parsers keep working.
- **Error kinds**: `auth_failed`, `selection_required`, `execution_error`, `partial_failure` (sync), `invalid_flags`, `encoding_error`. Login failures print human text (`Invalid LoginId/Password…`, `Number Of Maximum Fail Attempts…`, `Captcha could not be solved…`) to stdout *before* the envelope; the proxy uses it to tell wrong passwords from lockouts, captcha failures and VTOP outages.
- **Selections**: `TableSelector`/`TableSelectorFuzzy` emit `selection_requests` (`subject`, `query`, `message`, `table`) and stop instead of prompting. Indices are 1-based rows. Numeric flags select directly; fuzzy text that matches several rows returns a *re-numbered* filtered table, so the proxy re-runs without the text to get stable indices and matches the hint itself.
- **Semesters** default to the latest in proxy mode; passing an out-of-range index makes cli-top return the full semester table (used for "previous semester"-style hints).
- **Write flows**: `leave`/`nightslip` take `--apply` plus fields and fail with `missing --x; available <field> values: A (Label), …` before submitting when a field is missing; `facility` requires `--confirm`. These become `needs_input` / `needs_confirmation` steps.
- **events**: proxy mode is view-only (registration is interactive-terminal-only in cli-top).
- **Downloads** are written to `$HOME/Downloads/CLI-TOP Downloads/...`; the envelope carries no paths (except lines like `File saved to: …`). The proxy gives each run its own `HOME`, collects regular files afterwards (symlinks ignored), moves them to the file store and scrubs server paths from output.
- **Session reuse is not possible** with v2.12.1: the `proxy` subcommand always performs a fresh login + captcha. `JSESSIONID`/`SERVERID`/`CSRF` are only read by the *interactive* commands from the cli-top config file, and those commands print no machine-readable output in proxy mode. The proxy therefore optimises around logins (cache, de-duplication, `sync` batching) instead.
- **Credentials** are read only from argv in proxy mode (`args[0]`, `args[1]`); `VTOP_USERNAME`/`PASSWORD`/`KEY` are only used by the interactive commands' encrypted config file. See *Security*.
- Every cli-top start blocks on `GET https://cli-top.acmvit.in/latest.json` (kill switch, 5 s timeout) unless `CLI_TOP_LATEST_JSON_URL` is set; the proxy points it at its own cached copy.

---

## HTTP API

All endpoints except `/health`, `/commands` and signed `/files/...` links require
`Authorization: Bearer <PROXY_API_KEY>` (or `X-Proxy-Key`). Without a configured key they answer
**503** (fail closed); `PROXY_AUTH_DISABLED=true` disables auth outside production only.

Credentials: send `{ "username": "21BCE0001", "password": "…" }`. The legacy
`encryptedPassword` + `sessionKey` (or `cipher:::key`) form is still accepted for one release and
is **deprecated**.

### `POST /vtop`

```json
{
  "command": "course-page",
  "username": "21BCE0001",
  "password": "…",
  "flags": { "semester": 2 },
  "select": { "course": "CSE1001", "faculty": "anuj kumar", "materials": "module 2" },
  "confirm": false,
  "fresh": false
}
```

- `flags`: exact values, allow-listed per command (`GET /commands`). Values are type-checked
  (indices, the `--materials` grammar `1,3-5`/`0`/`all`, dates, times, ids) and may not start with
  `-`. Unknown flags are rejected with 400.
- `select`: natural-language hints resolved against VTOP's option lists. Legacy
  `semesterQuery`/`courseQuery`/`facultyQuery`/`materialQuery` flags map here.
- `confirm`: explicit user confirmation for writes (`leave`/`nightslip` with `apply`, `facility`).
- `fresh`: bypass the result cache (also `Cache-Control: no-cache`).

Response (every endpoint uses this shape):

```jsonc
{
  "success": true,
  "status": "completed | needs_selection | needs_input | needs_confirmation | cancelled | error",
  "command": "course-page",
  "message": "Downloaded 2 files from VTOP.",
  "data": "…text incl. tables…",          // == output, kept for older clients
  "structured_data": { "tables": [], "messages": [] },
  "tables": [{ "headers": [], "rows": [], "hasIndex": false }],
  "messages": ["…"],
  "links": [{ "label": "Control flow slides", "url": "https://vtop.vit.ac.in/…" }],
  "files": [{ "id": "…", "name": "Module-2_x.pdf", "path": "Course Page/…", "size": 1234,
              "contentType": "application/pdf", "url": "https://proxy/files/…?exp=…&sig=…",
              "expiresAt": "…" }],
  "bundle": { "name": "course-page-2025-11-02.zip", "count": 2, "url": "…" },
  "step": {                                // when status is needs_*
    "id": "faculty", "kind": "select|input|confirm", "label": "Faculty",
    "prompt": "Choose a faculty.", "multiple": false,
    "options": [{ "id": "1", "index": 1, "label": "Anuj Kumar", "description": "…", "values": {} }]
  },
  "continuation": "v1.…",                  // opaque; pass to /vtop/continue
  "progress": [{ "step": "course", "label": "Course", "choice": "CSE1001 — …", "auto": true }],
  "meta": { "version": "2.12.1", "regNo": "…", "cached": false, "queuedMs": 0, "runs": 3,
            "attempts": 1, "autoSelected": [], "flags": {} },
  // on errors:
  "error": "VTOP rejected the username or password.", "errorKind": "invalid_credentials",
  "retryable": false, "requiresCredentials": true
}
```

| errorKind                                | HTTP | Meaning                                                                    |
| ---------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `invalid_credentials` / `login_failed`   | 401  | VTOP rejected the login (`requiresCredentials: true`). Never auto-retried. |
| `missing_credentials`                    | 400  | No / undecryptable password.                                               |
| `account_locked`                         | 423  | VTOP "Maximum Fail Attempts".                                              |
| `captcha_failed`, `vtop_unavailable`     | 503  | Transient; retried once automatically for reads.                           |
| `busy`                                   | 503  | Queue full / wait timeout; retry later.                                    |
| `timeout`                                | 504  | cli-top exceeded `CLI_TIMEOUT` / `CLI_DOWNLOAD_TIMEOUT`.                   |
| `invalid_input`                          | 400  | Proxy or cli-top validation (`field` names the flag).                      |
| `conflict`                               | 409  | Already pending / registered / full.                                       |
| `not_found`                              | 404  | e.g. "no material uploaded".                                               |
| `rate_limited`                           | 429  | Per-user spawn budget (`VTOP_USER_LIMIT`).                                 |
| `token_invalid`                          | 400  | Continuation expired, tampered or for another account.                     |
| `cli_unavailable`, `cli_crashed`, `protocol_error` | 503/502 | Binary missing / kill-switched, crash, unreadable output. |
| `unauthorized` / `auth_not_configured`   | 401 / 503 | Proxy API key missing/wrong / not configured.                         |

### Multi-step workflows: `POST /vtop/continue`

```json
{ "continuation": "v1.…", "choice": "2", "password": "…" }
```

`choice` may be an option id, several ids for multi-select (`"1,3-5"`, `["1","3"]`, `"all"`),
free text matched against the options (`"CSE1001"`, `"anuj"`, `"module 2"`), a value for
`needs_input`, or `"confirm"`/`"cancel"`. Continuations are AES-256-GCM sealed (confidential,
tamper-proof), expire after `WORKFLOW_TOKEN_TTL_SECONDS` (15 min), are bound to the VTOP account
and never contain the password; the client re-sends the password with each call. Continuing
re-runs cli-top with the accumulated flags, so it works after restarts and across instances
sharing `PROXY_TOKEN_SECRET`.

| Command                         | Steps                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `course-page`, `course-page-archive` | semester (only when hinted) → course → faculty → materials (multi)  |
| `da`                            | subject → assignment (downloads the question paper)                       |
| `syllabus`                      | course (downloads the PDF)                                                |
| `course-allocation`             | category → course                                                         |
| `calendar`                      | class group                                                               |
| `facility`                      | facility → confirmation                                                   |
| `leave` / `nightslip` + `apply` | confirmation → missing fields (with VTOP's own option lists)             |
| semester-aware reads            | semester list when a non-latest semester is hinted                       |

### `POST /sync` (alias `/vtop-sync`)

`{ username, password, commands?: string[], flags?: { semester }, fresh? }` — runs every uncached
command in **one** cli-top `sync` invocation (one login). Cached commands are answered without
spawning. Response: `{ success, startedAt, durationMs, results: [{ command, success, cached,
result, output, structured_data, error, errorKind }] }`. With `?stream=1` (or
`Accept: application/x-ndjson`) entries stream as NDJSON lines (`{type:"entry",…}` cached first,
then `{type:"done"}`). Default commands: profile, timetable, attendance, marks, cgpa, exams, da.

### Downloads

`files[].url` / `bundle.url` are absolute (`PROXY_PUBLIC_URL`, else the request host), signed
with HMAC-SHA256 and expire with the file (`FILE_TTL_SECONDS`, default 1 h). Responses stream
from disk with the right `Content-Type`, `Content-Length`, RFC 5987 `Content-Disposition`,
`nosniff` and a sandbox CSP; append `&inline=1` to view PDFs inline. Files are deleted on expiry
and the store is wiped at startup; total size is capped by `FILE_STORE_MAX_BYTES`.

### Legacy endpoints

- `POST /vtop-interactive` / `POST /vtop-interactive-continue`: course-page only; same response
  shape as before (`step`, `options[{number, description, text}]`, `nextStep`, `sessionData`,
  `interactiveState`, `completed`, `downloadInfo.servedFiles[{name, downloadUrl, size, expiry}]`),
  now backed by the generic engine (`sessionData` is the continuation token).
- `GET /download/:fileId` answers 410 (old unsigned links).

### Other

- `GET /health` (public): binary present, auth configured, kill-switch status, queue.
- `GET /commands`: catalog (params with types, steps, kinds, cache TTLs).
- `GET /stats` (auth): spawn/cache/single-flight/queue/file-store counters.

---

## MCP (`/mcp`)

Tools: one per manifest command (input `{ flags?, select?, confirm?, fresh? }`), `vtop-continue`
(`{ continuation, choice, confirm? }`), `sync`, and the deprecated `course-page-interactive(-continue)`.
Results are `structuredContent` with the shape above (`isError: true` on failures; file URLs
absolute). With OAuth enabled (default) credentials come from the bearer token; with
`MCP_OAUTH_ENABLED=false` tools take `username`/`password` and `/mcp` requires the
`PROXY_API_KEY` instead.

### OAuth

- Discovery: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`.
- `/oauth/authorize` renders the consent page, which shows the **full redirect origin**
  prominently; `/oauth/consent` encrypts the VTOP password into the token context;
  `/oauth/token` exchanges codes (PKCE, expiry checked at exchange) and **rotates refresh tokens**
  (each refresh token is single-use).
- `MCP_OAUTH_CONSENT_SECRET` (≥ 16 chars) is **required**; the proxy refuses to start without it.
- Dynamic client registration (`/register`) rejects dangerous redirect URIs (`javascript:`,
  `data:`, non-loopback `http:`, credentials/fragments) and, if `MCP_OAUTH_REDIRECT_ALLOWLIST`
  is set, anything not on it.
- Auto-registering unknown `client_id`s during `/authorize` is **off by default**; enabling it
  (`MCP_OAUTH_AUTO_REGISTER=true`) also requires `MCP_OAUTH_REDIRECT_ALLOWLIST`
  (`host`, `*.suffix`, `scheme:`, `http://localhost`).
- `MCP_OAUTH_STATIC_CLIENTS`, `MCP_OAUTH_DEFAULT_CLIENT_ID`/`_REDIRECT_URI` pre-register clients.
- `npm run demo:mcp` walks the course-page workflow over MCP (OAuth disabled + `PROXY_API_KEY`).

---

## Performance

- **Result cache**: per user *and password* (HMAC key), per command + flags, TTL from
  `cacheTtlSeconds` in the manifest (profile 6 h … attendance 5 min, leave 1 min). Writes
  invalidate the user's entries. `sync` and `/vtop` share it.
- **Single-flight**: identical concurrent requests share one cli-top run.
- **Scheduler**: `CLI_MAX_CONCURRENCY` global, `CLI_PER_USER_CONCURRENCY` (default 1: one VTOP
  session per student), FIFO queue instead of failures.
- **Kill-switch cache**: saves the blocking `latest.json` HTTPS round trip per spawn.
- **Auto-advance**: hints resolve workflow steps server-side; `materials: "all"`/indices are
  passed up front (one fewer run).
- **No session reuse** (see above): each uncached run costs one VTOP login.

`npm run bench` (fake cli-top: 1.5 s simulated login, 150 ms simulated latest.json; same scenarios
before and after the rewrite):

| Scenario                                    | Before                     | After                       |
| ------------------------------------------- | -------------------------- | --------------------------- |
| Single cold read                            | 1693 ms                    | 1561 ms                     |
| 10 sequential identical reads, one user     | 16 952 ms (10 logins)      | 1 580 ms (1 login)          |
| 8 concurrent identical reads, one user      | 1 705 ms, **8 logins**     | 1 565 ms, 1 login           |
| 16 users concurrently                       | 1 747 ms                   | 1 710 ms                    |
| course-page "module 2 of CSE1001 by Anuj"   | not possible (broken)      | 1 HTTP call, 4 runs ≈ 6.5 s (3 runs for "all") |

---

## Security

- **API auth**: shared secret compared with `crypto.timingSafeEqual` over SHA-256 digests;
  fail-closed when unset.
- **Argv injection**: commands and flags are allow-listed per command, values type-checked and
  never allowed to start with `-`; usernames must match `VTOP_USERNAME_PATTERN` (VIT reg-no).
  Only canonical `--flag value` pairs are generated.
- **Password exposure**: cli-top v2.12.1 only accepts credentials as positional arguments in
  proxy mode, so the password is visible in `/proc/<pid>/cmdline` / `ps` to other processes of
  the same host for the life of the child (seconds). Mitigations: run the proxy alone in its
  container/VM under a dedicated user, mount `/proc` with `hidepid=2`. Proper fix requires a
  cli-top change (e.g. read `CLI_TOP_PROXY_PASSWORD` from env or the password from stdin in
  `runProxyCommand`).
- **Child isolation**: private run directory (cwd/HOME/XDG/TMPDIR, 0700, deleted after the run),
  stable UUID seeded in the run's config (no per-call analytics registrations), allow-listed
  environment (no proxy secrets or DB URLs), stdin closed, stdout capped.
- **Logs**: method/path/status/duration and masked usernames only — never credentials, argv or
  VTOP output.
- **Tokens/files**: see above. Cache keys include an HMAC of username + password, so a wrong
  password never reads another session's cache.

---

## Configuration

See `.env.example` for every variable. Key ones: `PROXY_API_KEY`, `PROXY_TOKEN_SECRET`,
`PROXY_PUBLIC_URL`, `BINARY_PATH`, `CLI_TIMEOUT`, `CLI_DOWNLOAD_TIMEOUT`, `CLI_MAX_CONCURRENCY`,
`CLI_PER_USER_CONCURRENCY`, `RESULT_CACHE_ENABLED`, `FILE_TTL_SECONDS`,
`CLI_TOP_LATEST_JSON_CACHE`, `VTOP_USER_LIMIT`, `MCP_OAUTH_*`.

## Testing

`npm test` runs `node --test test/`:

- `test/fixtures/fake-cli-top.js` re-implements the v2.12.1 proxy protocol (flag parsing,
  envelopes, selection requests, login-failure text, downloads under `$HOME`, kill switch, sync)
  with switches for failures (password `wrong`/`locked`/`captcha`/`down`/`crash`/`garbage`/`slow`/
  `pending`/`flaky-*`).
- `test/http.test.js`: auth, argv safety, error mapping, retries, cache/single-flight/queueing,
  env isolation, path scrubbing.
- `test/workflow.test.js`: every multi-step flow, tokens, downloads (signed URLs, zip, TTL),
  sync + streaming, legacy API, kill-switch cache.
- `test/mcp.test.js`, `test/oauth.test.js`, `test/unit.test.js`.

Not verifiable without real VTOP access: real table headers/row contents per feature (fixtures
follow the cli-top source), DA downloads in proxy mode (cli-top reads `CSRF` from env there,
which proxy mode never sets), and real login latencies.
