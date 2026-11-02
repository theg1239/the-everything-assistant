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
        option-id validation, encrypted continuation tokens         allow-listed env, downloads
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
| `src/files/store.js`       | Download store, signed URLs, streaming, ZIP bundles, TTL cleanup.                                 |
| `src/workflows/course-page.js` | Legacy `/vtop-interactive` adapter over the generic engine.                                    |
| `src/mcp/server.js`        | MCP tools.                                                                                          |
| `src/oauth/*`              | MCP OAuth authorization server.                                                                     |

### What cli-top's proxy protocol provides (from the source, c3d14de)

- **Envelope**: one JSON line `{ success, command, version, requested_at, completed_at, duration_ms, reg_no, flags, output, structured_data: { tables, selection_requests, messages }, error: { kind, message } }`. Tables are *not* printed in proxy mode (`PrintTable` only captures a snapshot), so `output` only holds the non-table lines; the proxy re-renders tables in cli-top's box format so older text parsers keep working.
- **Error kinds**: `auth_failed`, `selection_required`, `execution_error`, `partial_failure` (sync), `invalid_flags`, `encoding_error`. Login failures print human text (`Invalid LoginId/Password…`, `Number Of Maximum Fail Attempts…`, `Captcha could not be solved…`) to stdout *before* the envelope; the proxy uses it to tell wrong passwords from lockouts, captcha failures and VTOP outages.
- **Selections**: `TableSelector`/`TableSelectorFuzzy` emit `selection_requests` (`subject`, `query`, `message`, `table`) and stop instead of prompting. Indices are 1-based rows. Numeric flags select directly. Some steps (`select: "fuzzy"` in the manifest) also run cli-top's *own* search on a text flag; when that search is ambiguous or misses, cli-top returns a *re-numbered* filtered table, so the proxy re-runs without the text to get the full table with stable indices. The proxy never matches text itself.
- **Semesters** default to the latest in proxy mode; passing an out-of-range index makes cli-top return the full semester table (this is what `flags.semester: "list"` sends).
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

### Design rule: the proxy never interprets natural language

The proxy exposes exact, typed parameters and VTOP's option lists; the calling model makes every
choice. There is no hint matching, no acronym/keyword scoring, no relative-semester parsing and no
"yes"/"cancel" word lists anywhere in the service. What remains is validation of machine formats
(flag types, the `1,3-5` range grammar, dates, times, reg-no format) and parsing of cli-top's own
protocol output (selection tables, `missing --x; available … values:` errors). The only automatic
step is structural: when cli-top offers exactly **one** option, the proxy takes it and records it
with `auto: true` in `progress` (except for a command's first step when that table *is* the data,
i.e. `da` subjects and the `facility` list).

### `POST /vtop`

```json
{
  "command": "course-page",
  "username": "21BCE0001",
  "password": "…",
  "flags": { "course": 1 },
  "confirm": false,
  "fresh": false
}
```

- `flags`: exact values, allow-listed per command (`GET /commands` lists each param with `type`,
  `format`, `description`). Unknown flags → 400 `invalid_input` with `field`. Types:
  - `semester`: positive integer option index (1 = oldest), or `"list"` to get every semester back
    as a `needs_selection` step; omit for the latest semester.
  - `classGroup`, `course`, `faculty`, `assignment`, `facility`, `category`: positive integer option
    index. On steps where cli-top runs its own search (`select: "fuzzy"`: faculty, `da`
    course/assignment, `syllabus` course, `facility`, `course-allocation`) a string is also accepted
    and passed **verbatim** to cli-top; if cli-top's search is not a unique hit the full option list
    comes back (`step.cliQuery` echoes the string). Elsewhere a string is rejected.
  - `materials`: `"1,3-5"`, `[1,3,4]`, `"0"` or `"all"`.
  - `apply`, `confirm`: boolean (or `"true"`/`"false"`).
  - dates `YYYY-MM-DD` (also `DD-MM-YYYY`), times `HH:MM` / `hh:MM AM`, ids/text as listed.
  - Values may never start with `-`.
- `select` was removed: sending it returns 400 `invalid_input`, `field: "select"`. The legacy
  `semesterQuery`/`courseQuery`/`facultyQuery`/`materialQuery` flags are unknown flags (400).
- `confirm`: explicit user confirmation for writes (`leave`/`nightslip` with `apply`, `facility`).
- `fresh`: bypass the result cache (also `Cache-Control: no-cache`).

The intended flow: call **without** selection flags, read `step.options`, continue with the chosen
id(s). Pass flags directly only when you already hold indices from an earlier result.

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
  "step": { … },                           // when status is needs_* (see below)
  "continuation": "v1.…",                  // opaque; pass to /vtop/continue
  "progress": [{ "step": "faculty", "label": "Faculty", "choice": "Meera Iyer", "value": ["1"], "auto": true }],
  "meta": { "version": "2.12.1", "regNo": "…", "cached": false, "queuedMs": 0, "runs": 2,
            "attempts": 1, "autoSelected": [{ "step": "faculty", "choice": "Meera Iyer", "value": "1" }],
            "flags": {} },
  // on errors:
  "error": "VTOP rejected the username or password.", "errorKind": "invalid_credentials",
  "retryable": false, "requiresCredentials": true,
  "field": "choice", "validIds": ["1", "2", "3"]   // on invalid_input where applicable
}
```

`needs_selection` example (`POST /vtop { "command": "course-page", … , "flags": { "course": 1 } }`):

```json
{
  "success": true,
  "status": "needs_selection",
  "command": "course-page",
  "message": "Choose one faculty: continue with its option id.",
  "step": {
    "id": "faculty",
    "kind": "select",
    "label": "Faculty",
    "prompt": "Choose one faculty: continue with its option id.",
    "multiple": false,
    "options": [
      { "id": "1", "index": 1, "label": "Anuj Kumar", "values": { "FACULTY": "Anuj Kumar" } },
      { "id": "2", "index": 2, "label": "Anjali Sharma", "values": { "FACULTY": "Anjali Sharma" } },
      { "id": "3", "index": 3, "label": "Ravi Shankar", "values": { "FACULTY": "Ravi Shankar" } }
    ]
  },
  "continuation": "v1.…",
  "progress": [],
  "meta": { "runs": 1, "autoSelected": [], "flags": { "course": 1 } }
}
```

Step shapes (`id` is the flag the step fills; `options` is always present and never truncated):

| kind      | status               | extra fields                                                         | `choice` on continue |
| --------- | -------------------- | -------------------------------------------------------------------- | -------------------- |
| `select`  | `needs_selection`    | `multiple`, `cliQuery?` (cli-top search that was not a unique hit)   | option id(s)         |
| `input`   | `needs_input`        | `inputType` (`date`/`time`/`text`/`id`/`option`), `format`, `description` | raw value; one of `options[].id` when `inputType: "option"` |
| `confirm` | `needs_confirmation` | `summary` (leave/nightslip apply), `options: []`                     | `true` / `false`     |

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

`choice` must be exactly one of:

- **select** steps: an option id (`"2"`; an integer `2` is accepted too), or an array with one id.
  When `step.multiple`: an array of ids (`["1","3"]`), the range grammar over ids (`"1,3-5"`), or
  `"all"`.
- **input** steps: the raw value, validated against `step.inputType` / `step.format`; when
  `step.options` is non-empty (VTOP's own value list, e.g. leave codes `HT1`), one of
  `options[].id` exactly.
- **confirm** steps: a boolean. `false` returns `status: "cancelled"` without running cli-top.

Anything else (e.g. free text like `"anuj"`, an id that was not offered, `"yes"`) is rejected
without running cli-top:

```json
{
  "success": false,
  "status": "error",
  "error": "\"anuj\" is not a valid choice for Faculty; expected exactly one option id. Valid ids: 1, 2, 3",
  "errorKind": "invalid_input",
  "field": "choice",
  "validIds": ["1", "2", "3"],
  "retryable": false
}
```

(HTTP 400; for multi-select `validIds` also contains `"all"`.) The continuation stays valid, so the
client can retry with a correct id. There is no cancel keyword for select/input steps: just stop
continuing (tokens expire).

Continuations are AES-256-GCM sealed (confidential, tamper-proof), carry the offered option ids,
expire after `WORKFLOW_TOKEN_TTL_SECONDS` (15 min), are bound to the VTOP account and never contain
the password; the client re-sends the password with each call (`username` is optional). Continuing
re-runs cli-top with the accumulated flags, so it works after restarts and across instances
sharing `PROXY_TOKEN_SECRET`.

| Command                         | Steps                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `course-page`, `course-page-archive` | semester (archive, or `semester: "list"`) → course → faculty → materials (multi) |
| `da`                            | subject → assignment (downloads the question paper)                       |
| `syllabus`                      | course (downloads the PDF)                                                |
| `course-allocation`             | category → course                                                         |
| `calendar`                      | class group                                                               |
| `facility`                      | facility → confirmation                                                   |
| `leave` / `nightslip` + `apply` | confirmation → missing fields (`needs_input`, with VTOP's own option lists) |
| semester-aware reads            | semester list when `semester: "list"` is passed                           |

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
  shape as before (`step`, `options[{number, id, description, text, values}]`, `nextStep`,
  `sessionData`, `interactiveState`, `completed`, `downloadInfo.servedFiles[{name, downloadUrl,
  size, expiry}]`), backed by the generic engine. They take **exact selections only**:
  `flags` are course-page flags (option indices; `materialSelection` = `materials`), `sessionData`
  must be the continuation token from the previous response, and `selection` must be option id(s)
  as for `/vtop/continue` (`"0"` still means all materials). `semesterQuery`/`courseQuery`/
  `facultyQuery`/`materialQuery`, free-text selections and pre-token JSON `sessionData` are
  rejected with 400 `invalid_input` / `token_invalid`.
- `GET /download/:fileId` answers 410 (old unsigned links).

### Other

- `GET /health` (public): binary present, auth configured, kill-switch status, queue.
- `GET /commands`: catalog (params with types, steps, kinds, cache TTLs).
- `GET /stats` (auth): spawn/cache/single-flight/queue/file-store counters.

---

## MCP (`/mcp`)

Tools (all results are `structuredContent` with the shape above, `isError: true` on failures, file
URLs absolute):

| Tool | Input | Notes |
| ---- | ----- | ----- |
| one per manifest command (`profile`, `marks`, `course-page`, `da`, `leave`, …) | `{ flags?, confirm?, fresh? }` | `flags` is a typed object with exactly the command's params (integers for indices, `semester: int \| "list"`, `materials: string \| int[]`, booleans, strings for dates/ids). No hint parameter; `select` is rejected. |
| `vtop-continue` | `{ continuation, choice }` | `choice`: option id / array of ids / `"1,3-5"` / `"all"` / input value / boolean, as for `/vtop/continue`. |
| `sync` | `{ commands?, flags?: { semester }, fresh? }` | |
| `course-page-interactive`, `course-page-interactive-continue` | legacy | Deprecated; exact selections only. |

Tool descriptions tell the model to call **without** selection flags first, pick from
`step.options` itself, and continue with option ids only. With OAuth enabled (default)
credentials come from the bearer token; with `MCP_OAUTH_ENABLED=false` every tool also takes
`username`/`password` and `/mcp` requires the `PROXY_API_KEY` instead.

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
- **Auto-advance (structural only)**: a step for which cli-top offers exactly one option is taken
  without a round trip (`progress[].auto: true`). Callers that already hold indices can pass them
  as flags and skip steps entirely.
- **No session reuse** (see above): each uncached run costs one VTOP login.

`npm run bench` (fake cli-top: 1.5 s simulated login, 150 ms simulated latest.json; same scenarios
before and after the rewrite):

| Scenario                                    | Before                     | After                       |
| ------------------------------------------- | -------------------------- | --------------------------- |
| Single cold read                            | 1693 ms                    | 1561 ms                     |
| 10 sequential identical reads, one user     | 16 952 ms (10 logins)      | 1 580 ms (1 login)          |
| 8 concurrent identical reads, one user      | 1 705 ms, **8 logins**     | 1 565 ms, 1 login           |
| 16 users concurrently                       | 1 747 ms                   | 1 710 ms                    |
| course-page module download, ids picked per step | not possible (broken)  | 4 HTTP calls, 4 runs ≈ 6.3 s |
| course-page with exact flags (indices known) | not possible (broken)     | 1 HTTP call, 1 run ≈ 1.6 s  |

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
- `test/workflow.test.js`: every multi-step flow driven by option ids only (course-page, syllabus,
  da, calendar, semester list, facility confirm, leave/nightslip apply with inputs), rejection of
  `select`/free-text choices with `validIds`, single-option auto-advance, tokens, downloads
  (signed URLs, zip, TTL), sync + streaming, legacy API, kill-switch cache.
- `test/mcp.test.js`, `test/oauth.test.js`, `test/unit.test.js`.

Not verifiable without real VTOP access: real table headers/row contents per feature (fixtures
follow the cli-top source), DA downloads in proxy mode (cli-top reads `CSRF` from env there,
which proxy mode never sets), and real login latencies.
