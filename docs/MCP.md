# CUE MCP server

CUE exposes conference program operations to AI agents using MCP Streamable HTTP over JSON-RPC 2.0, implemented at:

- Hosted endpoint: `https://cue-program-ops.headley-max.workers.dev/api/mcp`
- Local endpoint: `http://localhost:8787/api/mcp`
- Transport: `streamable-http`
- Discovery: `GET /.well-known/mcp.json`
- Authentication: `Authorization: Bearer <token>`

The endpoint accepts plain JSON `POST` requests. It supports `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`. Tool results are MCP text content containing JSON.

## Authentication

Create a named API token from an authenticated organizer session. The plaintext is returned once; CUE stores only its SHA-256 hash.

```sh
curl -X POST https://cue-program-ops.headley-max.workers.dev/api/auth/tokens \
  -H 'Content-Type: application/json' \
  -H 'Cookie: cue_session=YOUR_SESSION_COOKIE' \
  -d '{"name":"Claude Code"}'

curl https://cue-program-ops.headley-max.workers.dev/api/auth/tokens \
  -H 'Cookie: cue_session=YOUR_SESSION_COOKIE'

curl -X DELETE https://cue-program-ops.headley-max.workers.dev/api/auth/tokens/TOKEN_ID \
  -H 'Cookie: cue_session=YOUR_SESSION_COOKIE'
```

For an explicitly configured demo, set `DEMO_MCP_TOKEN=cue-demo` on the server and use `cue-demo` as the bearer token. This value is **not built in** and is rejected unless that environment variable is set. API token state has the same process-memory/whole-snapshot durability limitations documented for CUE auth; it is not a production secrets or tenant-isolation system.

## Connect a client

### Claude Code

Claude Code versions with remote HTTP MCP support can register the URL and bearer header directly:

```sh
claude mcp add --transport http cue https://cue-program-ops.headley-max.workers.dev/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

CLI flags vary by Claude Code release. If your version does not accept `--header`, use its JSON MCP configuration and provide the same URL, transport, and header shown in the generic example below.

### Claude Desktop

Use a Claude Desktop release that supports remote Streamable HTTP servers. Add a custom MCP server with:

```json
{
  "mcpServers": {
    "cue": {
      "type": "http",
      "url": "https://cue-program-ops.headley-max.workers.dev/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

Configuration keys can differ between Desktop releases; the required connection facts are Streamable HTTP, the `/api/mcp` URL, and the bearer header. Do not put a production token in a shared configuration file.

### Generic MCP / JSON-RPC client

```sh
curl -X POST https://cue-program-ops.headley-max.workers.dev/api/mcp \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"1"}}}'
```

Then send `notifications/initialized`, followed by `tools/list` or `tools/call`, to the same endpoint and bearer identity.

## Tools

| Tool | Parameters | Behavior |
|---|---|---|
| `list_events` | none | Lists registered event summaries and public program paths |
| `list_submissions` | optional `status`: `draft`, `submitted`, `under_review`, `accepted`, `waitlisted`, `rejected`, `withdrawn` | Lists canonical lifecycle submissions |
| `get_submission` | required `id` | Returns one submission and review-history summary |
| `list_speakers` | none | Returns profiles, tasks, and derived readiness |
| `get_schedule` | none | Returns canonical sessions, rooms/times, and warnings from the schedule conflict engine |
| `list_review_progress` | none | Returns assignment/review progress per submission |
| `send_task_reminder` | required `speakerId`, `taskId` | Uses the existing reminder template, communication record, and configured mailer path |
| `complete_speaker_task` | required `speakerId`, `taskId` | Uses canonical task ownership/file prerequisite rules and persists completion |

Only the last two tools write data. Tool/domain failures are returned as MCP results with `isError: true`; protocol/parameter errors use JSON-RPC error objects.
