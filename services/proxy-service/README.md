# VIT Proxy Service

A microservice that proxies requests to the VTOP CLI tool.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the service:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### MCP OAuth (new)

All MCP transports (`/mcp` + `/mcp/messages`) now require OAuth 2.0 with PKCE. The proxy exposes an authorization server under `/oauth` so MCP-native clients can discover metadata, register dynamically, and run the standard `authorization_code` + `refresh_token` grants.

- **Discovery**: `https://<host>/.well-known/oauth-authorization-server` and `https://<host>/.well-known/oauth-protected-resource/mcp` advertise issuer + resource metadata.
- **Authorization endpoint**: `https://<host>/oauth/authorize` hosts the consent/login UI. The page encrypts the VTOP password per session key and stores only the cipher alongside the token context.
- **Token endpoint**: `https://<host>/oauth/token` exchanges the code (with PKCE) for access + refresh tokens.
- **Consent handler**: the login form posts to `/oauth/consent`. You usually hit it indirectly via the authorize page, but it is helpful to know when debugging.

Because the OAuth token now carries the encrypted VTOP credential blob, MCP clients should **not** send `password`/`encryptedPassword` inside tool arguments anymore—only the command + flags are required. The proxy injects the linked credentials from the bearer token before invoking the CLI workflow.

> 🔧 **Local debugging**: set `MCP_OAUTH_ENABLED=false` in `.env` to fall back to the legacy “inline credentials” behavior. Keep OAuth enabled everywhere else so credentials never appear in tool payloads.

### POST /vtop

Execute a VTOP CLI command.

**Request Body:**

```json
{
  "command": "grades",
  "username": "your_username",
  "password": "your_password",
  "flags": {
    "semester": 1,
    "debug": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "command": "grades",
  "data": {...}
}
```

### GET /commands

List all available commands.

### POST /vtop-interactive

Start (or advance) the course-page interactive workflow. Provide the same credential payload as `/vtop` along with `command`, `step`, optional `flags`, and an optional `sessionData` blob that was returned from a previous step.

### POST /vtop-interactive-continue

Submit the user’s selection for an existing workflow session. Send `{ sessionData, selection, step }` plus credentials (plain or encrypted) to advance to the next step.

### POST /mcp

Streamable MCP endpoint that exposes every capability (including the interactive tools) to MCP clients. Include `Authorization: Bearer <ACCESS_TOKEN>` on every request (see the OAuth section above). Each MCP request envelope should include a `toolCall` describing which capability to run, for example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "course-page-interactive",
    "arguments": {
      "step": "semester",
      "flags": { "semesterQuery": "current" }
    }
  }
}
```

When a valid OAuth token is present you can omit `username`/`password` entirely—the proxy injects the linked credentials before executing the CLI. The response mirrors the HTTP payload (structured JSON + session metadata) so the MCP client can render prompts or continue workflows.

#### Quick MCP sanity check

1. `npm run dev` (or `npm start`) in this folder.
2. Register a client (most IDEs do this automatically) and complete the PKCE flow by visiting `http://localhost:3001/oauth/authorize?...` in a browser. Exchange the returned authorization code against `POST http://localhost:3001/oauth/token` to obtain an `access_token`.
3. Call `/mcp` with that bearer token:

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
          "name": "course-page-interactive",
          "arguments": {
            "step": "semester"
          }
        }
      }'
```

4. Paste the returned `sessionData` + `options` into your client UI. To advance from step `semester` with choice `2`, call `course-page-interactive-continue` and pass `{ sessionData, selection: "2", step: "semester" }` using the **same** bearer token.

Or run the helper script:

```bash
VTOP_USERNAME=... VTOP_PASSWORD=... npm run demo:mcp
```

It will issue the first MCP request, print the options, and automatically continue with the first selection so you can see the entire JSON envelope. (The demo bypasses OAuth—use it only for local smoke tests.)

### MCP transports (Streamable HTTP + SSE fallback)

- Modern clients should prefer **Streamable HTTP**: POST to `/mcp` with `Accept: application/json, text/event-stream`, then reuse the `Mcp-Session-Id` header (and GET `/mcp` for server-to-client messages).
- Legacy **HTTP+SSE** clients are also supported: open `GET /mcp` with `Accept: text/event-stream` to receive an `endpoint` event pointing at `/mcp/messages?sessionId=...`, then POST JSON-RPC bodies there. This keeps the proxy compatible with older MCP tooling.

To peek at every tool from a UI, use the bundled Inspector config:

```bash
cd services/proxy-service
npx @modelcontextprotocol/inspector@latest \
  --config ./mcp-inspector.config.json \
  --server local-proxy
```

The config preloads `http://localhost:3001/mcp` and negotiates the required headers, so you only need to enter your VTOP credentials in the Inspector forms.

### Shared hub manifest

The proxy reads `hub-capabilities.json` from the repo root (or any ancestor directory) so it always mirrors the Everything Assistant UI. If you keep a different manifest copy somewhere else, set `HUB_CAPABILITIES_PATH=/full/path/to/hub-capabilities.json` before starting the service.

## Supported Commands

- `profile` - Student profile information
- `marks` - Marks for a semester
- `grades` - Grades for a semester
- `attendance` - Attendance details
- `timetable` - Class timetable
- `receipts` - Fee receipts
- `hostel` - Hostel information
- `cgpa` - CGPA details
- `exams` - Exam schedule
- `library-dues` - Library dues
- `calendar` - Academic calendar
- `nightslip` - Nightslip status
- `leave` - Leave status
- `msg` - Class messages
- `da` - Digital assignments
- `facility` - Facility registration
- `syllabus` - Course syllabus

Interactive wrappers are also exposed as MPC/HTTP tools:

- `course-page-interactive` – enter the workflow with optional smart flags
- `course-page-interactive-continue` – submit the user’s choice and move to the next step

## Command Flags

Different commands support different flags:

- `semester` (number) - Semester number
- `course` (number) - Course selection
- `faculty` (string) - Faculty name
- `class-group` (number) - Class group
- `fuzzy-index` (number) - Fuzzy search index
- `debug` (boolean) - Enable debug mode
