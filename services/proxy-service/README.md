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

Streamable MCP endpoint that exposes every capability (including the interactive tools) to MCP clients. Each MCP request envelope should include a `toolCall` describing which capability to run, for example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "course-page-interactive",
    "arguments": {
      "username": "24BCE1234",
      "password": "p@ssw0rd",
      "step": "semester",
      "flags": { "semesterQuery": "current" }
    }
  }
}
```

The response mirrors the HTTP payload (structured JSON + session metadata) so the MCP client can render prompts or continue workflows.

#### Quick MCP sanity check

1. `npm run dev` (or `npm start`) in this folder.
2. In a separate shell:

```bash
curl -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -d '{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
          "name": "course-page-interactive",
          "arguments": {
            "username": "VTOP_ID",
            "password": "VTOP_PASS",
            "step": "semester"
          }
        }
      }'
```

3. Paste the returned `sessionData` + `options` into your client UI. To advance from step `semester` with choice `2`, call `course-page-interactive-continue` and pass `{ sessionData, selection: "2", step: "semester" }`.

Or run the helper script:

```bash
VTOP_USERNAME=... VTOP_PASSWORD=... npm run demo:mcp
```

It will issue the first MCP request, print the options, and automatically continue with the first selection so you can see the entire JSON envelope.

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
