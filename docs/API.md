# API Reference

## Overview

Codex WebUI exposes a RESTful HTTP API and Server-Sent Events (SSE) for real-time communication. This document provides complete API specifications for all endpoints.

## Base Configuration

### Server Configuration

**Default Values:**
```bash
HOST=127.0.0.1
PORT=5055
WEBUI_TOKEN=         # Optional bearer token
ALLOW_ORIGIN=http://localhost:5055
```

**Base URL:** `http://127.0.0.1:5055`

### Authentication

**Read Endpoints:** No authentication required

**Write Endpoints:** Require authentication when `WEBUI_TOKEN` is set

**Authentication Header:**
```http
Authorization: Bearer <WEBUI_TOKEN>
```

**Responses:**
- `401 Unauthorized` - Invalid or missing token (when token is configured)
- `200 OK` - Authentication successful

### CORS

All endpoints include CORS headers:
```http
Access-Control-Allow-Origin: <ALLOW_ORIGIN>
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

**OPTIONS Requests:** All endpoints support preflight OPTIONS requests.

## Endpoints

### Static Files

#### `GET /`

Serves the main UI (index.html).

**Response:**
- `Content-Type: text/html`
- Status: `200 OK`
- Body: HTML content

**Example:**
```bash
curl http://127.0.0.1:5055/
```

---

### Health Check

#### `GET /health`

Health check endpoint for monitoring.

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Server is running

**Example:**
```bash
curl http://127.0.0.1:5055/health
```

---

### Server-Sent Events

#### `GET /events`

Establishes an SSE connection for real-time server updates.

**Headers:**
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format:**
```
event: <event_type>
data: <json_data>

```

**Initial Event:**
Upon connection, immediately sends current status:
```
event: status
data: {"resumed":true,"resume_path":"...","memory":[...],"config":{...}}
```

**Keepalive:**
- Sent every 15 seconds: `: ping\n\n`
- Prevents proxy timeouts
- No action required from client

**Event Types:** See [SSE Events](#sse-events) section below.

**Example (JavaScript):**
```javascript
const eventSource = new EventSource('http://127.0.0.1:5055/events');

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  console.log('Status:', data);
});

eventSource.addEventListener('delta', (e) => {
  const data = JSON.parse(e.data);
  process.stdout.write(data.text);
});
```

**Example (curl):**
```bash
curl -N http://127.0.0.1:5055/events
```

---

### Messaging

#### `POST /message`

Send a user message to Codex.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "text": "User message text"
}
```

**Constraints:**
- `text` must be a string
- `text` must not be empty after trimming
- Maximum length: 16,384 characters (16 KB)

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Message accepted and queued
- `400 Bad Request` - Invalid JSON or text constraints violated
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Starts Codex process if not running
2. Injects memory facts into message
3. Sends to Codex via stdin
4. Response streams via SSE (delta events)

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"text": "Create a hello world Python script"}'
```

---

### Session Management

#### `GET /sessions`

List all session files in `~/.codex/sessions/`.

**Response:**
```json
{
  "sessions": [
    {
      "path": "/home/user/.codex/sessions/rollout-abc123.jsonl",
      "name": "rollout-abc123.jsonl",
      "mtimeMs": 1700000000000,
      "size": 12345
    }
  ],
  "current": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Fields:**
- `sessions` - Array of session objects sorted by modification time (newest first)
  - `path` - Absolute file path
  - `name` - Filename
  - `mtimeMs` - Last modified timestamp (milliseconds since epoch)
  - `size` - File size in bytes
- `current` - Path of currently resumed session (null if none)

**Status Codes:**
- `200 OK` - Sessions listed successfully

**Example:**
```bash
curl http://127.0.0.1:5055/sessions
```

---

#### `GET /session-messages`

Get parsed messages from the current session.

**Response:**
```json
{
  "messages": [
    {
      "role": "user",
      "text": "Create a Python script"
    },
    {
      "role": "assistant", 
      "text": "I'll create a Python script for you..."
    }
  ]
}
```

**Fields:**
- `messages` - Array of message objects (last 100 messages)
  - `role` - Either "user" or "assistant"
  - `text` - Message content

**Status Codes:**
- `200 OK` - Messages retrieved (empty array if no current session)

**Example:**
```bash
curl http://127.0.0.1:5055/session-messages
```

---

#### `POST /resume`

Resume from a specific session file.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Alternative:**
```json
{
  "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Constraints:**
- Path must be within `~/.codex/sessions/`
- Filename must match pattern `rollout-*.jsonl`
- File must exist

**Response:**
```json
{
  "ok": true,
  "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Invalid resume path"
}
```

**Status Codes:**
- `200 OK` - Resume successful
- `400 Bad Request` - Invalid path or file not found
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Stops current Codex process
2. Starts new process with resume flag
3. Broadcasts status update via SSE

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/resume \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"path": "/home/user/.codex/sessions/rollout-abc123.jsonl"}'
```

---

#### `DELETE /session`

Delete a session file.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Session deleted successfully
- `400 Bad Request` - Invalid JSON or path
- `403 Forbidden` - Path outside sessions directory or invalid pattern
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Validates path is within `~/.codex/sessions/`
2. Validates filename matches `rollout-*.jsonl`
3. Deletes file
4. Removes from history.json
5. Clears current resume if deleted

**Example:**
```bash
curl -X DELETE http://127.0.0.1:5055/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"path": "/home/user/.codex/sessions/rollout-abc123.jsonl"}'
```

---

### Project History

#### `GET /projects`

Get session history grouped by working directory.

**Response:**
```json
{
  "groups": {
    "/home/user/project1": [
      {
        "resume_path": "/home/user/.codex/sessions/rollout-abc.jsonl",
        "workdir": "/home/user/project1",
        "last_used": 1700000000000
      }
    ],
    "/home/user/project2": [
      {
        "resume_path": "/home/user/.codex/sessions/rollout-def.jsonl",
        "workdir": "/home/user/project2",
        "last_used": 1699900000000
      }
    ]
  }
}
```

**Fields:**
- `groups` - Object keyed by workdir path
  - Each group contains array of history entries
  - Entries sorted by `last_used` (newest first)
  - Fields:
    - `resume_path` - Session file path
    - `workdir` - Working directory
    - `last_used` - Timestamp in milliseconds

**Status Codes:**
- `200 OK` - Projects retrieved

**Example:**
```bash
curl http://127.0.0.1:5055/projects
```

---

#### `DELETE /project-history`

Remove an entry from project history (doesn't delete session file).

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Entry removed
- `400 Bad Request` - Invalid JSON
- `401 Unauthorized` - Missing or invalid token

**Note:** This only removes the history entry, not the session file itself.

**Example:**
```bash
curl -X DELETE http://127.0.0.1:5055/project-history \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl"}'
```

---

### Memory Management

#### `GET /memory`

Retrieve all memory facts.

**Response:**
```json
{
  "facts": [
    "Uses JWT for authentication",
    "Follow PEP 257 docstring conventions",
    "Tests located in tests/ directory"
  ]
}
```

**Fields:**
- `facts` - Array of fact strings
- Extracted from `.codex/memory.md`
- Each fact is a markdown bullet point

**Status Codes:**
- `200 OK` - Facts retrieved (empty array if no memory file)

**Example:**
```bash
curl http://127.0.0.1:5055/memory
```

---

#### `DELETE /memory`

Remove a specific memory fact.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "fact": "Uses JWT for authentication"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Fact removed (or wasn't present)
- `400 Bad Request` - Invalid JSON or missing fact field
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Reads memory.md
2. Removes line matching `- <fact>`
3. Writes updated memory.md
4. Broadcasts status update

**Example:**
```bash
curl -X DELETE http://127.0.0.1:5055/memory \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"fact": "Uses JWT for authentication"}'
```

---

### Configuration

#### `GET /config`

Get current configuration.

**Response:**
```json
{
  "model": "gpt-5",
  "tools.web_search_request": false,
  "use_streamable_shell": true,
  "sandbox_mode": "danger-full-access",
  "approval_policy": "never",
  "instructions_extra": ""
}
```

**Fields:**
- `model` - AI model to use
- `tools.web_search_request` - Enable web search tool
- `use_streamable_shell` - Enable streaming shell output
- `sandbox_mode` - Execution sandbox level
- `approval_policy` - Auto-approval setting
- `instructions_extra` - Additional instructions for agent

**Status Codes:**
- `200 OK` - Configuration retrieved

**Example:**
```bash
curl http://127.0.0.1:5055/config
```

---

#### `PUT /config`

Update configuration.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Request Body:**
```json
{
  "model": "gpt-5",
  "approval_policy": "never",
  "sandbox_mode": "danger-full-access"
}
```

**Allowed Keys:**
- `model`
- `approval_policy`
- `tools.web_search_request`
- `use_streamable_shell`
- `sandbox_mode`
- `instructions_extra`

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200 OK` - Configuration updated
- `400 Bad Request` - Invalid JSON
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Filters request to whitelisted keys only
2. Merges with defaults
3. Writes to config.toml
4. Broadcasts status update
5. **Note:** Changes apply to next Codex restart

**Example:**
```bash
curl -X PUT http://127.0.0.1:5055/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"model": "gpt-5", "approval_policy": "auto"}'
```

---

### Process Control

#### `POST /restart`

Restart Codex process with current resume path.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Response:**
```json
{
  "ok": true,
  "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl"
}
```

**Status Codes:**
- `200 OK` - Restart initiated
- `401 Unauthorized` - Missing or invalid token

**Behavior:**
1. Stops current Codex process
2. Starts new process with same resume path
3. Applies current configuration

**Use Cases:**
- Apply configuration changes
- Recover from hung process
- Reset session state

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/restart \
  -H "Authorization: Bearer your-token"
```

---

#### `POST /shutdown`

Gracefully shutdown Codex process.

**Authentication:** Required if `WEBUI_TOKEN` is set.

**Response:**
```
OK
```

**Status Codes:**
- `200 OK` - Shutdown command sent

**Behavior:**
1. Sends shutdown control message to Codex stdin
2. Closes stdin stream
3. Process exits naturally
4. Server continues running (only Codex stops)

**Example:**
```bash
curl -X POST http://127.0.0.1:5055/shutdown \
  -H "Authorization: Bearer your-token"
```

---

## SSE Events

### Event: `status`

System state update.

**Data:**
```json
{
  "resumed": true,
  "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl",
  "resume_meta": {
    "name": "rollout-abc123.jsonl",
    "mtimeMs": 1700000000000,
    "size": 12345
  },
  "memory": [
    "Memory fact 1",
    "Memory fact 2"
  ],
  "config": {
    "model": "gpt-5",
    "approval_policy": "never"
  }
}
```

**Sent:**
- On initial connection
- After configuration changes
- After memory updates
- After resume operations

---

### Event: `delta`

Incremental message text from agent.

**Data:**
```json
{
  "text": "text chunk"
}
```

**Sent:**
- During agent response streaming
- Multiple deltas form complete message

**Usage:**
```javascript
let buffer = '';
eventSource.addEventListener('delta', (e) => {
  const data = JSON.parse(e.data);
  buffer += data.text;
  // Update UI incrementally
});
```

---

### Event: `message`

Complete agent message.

**Data:**
```json
{
  "text": "Complete agent response text"
}
```

**Sent:**
- After all deltas for a message
- Signals message completion

---

### Event: `tool`

Tool execution notification.

**Data:**
```json
{
  "name": "Bash",
  "detail": "ls -la"
}
```

or

```json
{
  "name": "Edit",
  "detail": "apply_patch"
}
```

**Sent:**
- When Codex begins tool execution
- Before tool output appears

**Tool Names:**
- `Bash` - Shell command execution
- `Edit` - File patch application

---

### Event: `system`

System-level notifications.

**Data:**
```json
{
  "text": "Codex session configured"
}
```

**Examples:**
- "Codex session configured"
- "Resuming from rollout: <path>"
- "Codex exited with code 0"
- "Task complete"

**Sent:**
- On process lifecycle events
- Session state changes
- Task completion

---

### Event: `stderr`

Raw stderr from Codex process.

**Data:**
```json
{
  "text": "stderr output text"
}
```

**Sent:**
- When Codex writes to stderr
- Useful for debugging

---

### Event: `error`

Error messages from Codex.

**Data:**
```json
{
  "text": "Error message"
}
```

**Sent:**
- When Codex reports errors
- On tool execution failures

---

## Error Responses

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Request successful |
| 204 | No Content | OPTIONS preflight, favicon |
| 400 | Bad Request | Invalid JSON, missing fields, constraint violations |
| 401 | Unauthorized | Missing/invalid token when required |
| 403 | Forbidden | Path validation failure |
| 404 | Not Found | Static file not found |

### Error Response Format

**4xx Errors:**
```json
{
  "ok": false,
  "error": "Error description"
}
```

or plain text:
```
Bad JSON
```

**Examples:**
```json
// Invalid resume path
{
  "ok": false,
  "error": "Invalid resume path"
}

// Missing field
"Missing text"

// Bad JSON
"Bad JSON"
```

## Rate Limiting

**None implemented.** 

Server is designed for single-user local usage. If exposed publicly, implement rate limiting at reverse proxy level.

## Pagination

**Not implemented.**

All list endpoints return complete results:
- `/sessions` - All session files
- `/session-messages` - Last 100 messages only
- `/projects` - All history entries
- `/memory` - All facts

For large datasets, consider implementing pagination in future versions.

## Versioning

**Current Version:** 1.0.0

**API Stability:** Stable

**Breaking Changes:** Will be announced via:
- GitHub releases
- README updates
- CHANGELOG entries

**Backward Compatibility:** Minor versions maintain compatibility.

## WebSocket Alternative

**Not supported.** Server uses Server-Sent Events (SSE) for streaming.

**Rationale:**
- Simpler protocol for one-way streaming
- Native browser support via EventSource
- Better proxy compatibility
- Sufficient for use case

For bidirectional communication needs, clients use HTTP POST for requests and SSE for responses.

## CORS Configuration

**Default:**
```
Access-Control-Allow-Origin: http://localhost:5055
```

**Configuration:**
Set `ALLOW_ORIGIN` environment variable:
```bash
ALLOW_ORIGIN=https://example.com node server.js
```

**Security Note:** Be cautious when setting ALLOW_ORIGIN for production deployments.

## Example Client Implementations

### JavaScript (Browser)

```javascript
// Connect to SSE
const eventSource = new EventSource('http://127.0.0.1:5055/events');

eventSource.addEventListener('status', (e) => {
  console.log('Status:', JSON.parse(e.data));
});

eventSource.addEventListener('delta', (e) => {
  const { text } = JSON.parse(e.data);
  document.getElementById('output').textContent += text;
});

// Send message
async function sendMessage(text) {
  const response = await fetch('http://127.0.0.1:5055/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-token'
    },
    body: JSON.stringify({ text })
  });
  return response.json();
}
```

### Python

```python
import requests
import json
from sseclient import SSEClient  # pip install sseclient-py

# Connect to SSE stream
def listen_events():
    url = 'http://127.0.0.1:5055/events'
    messages = SSEClient(url)
    
    for msg in messages:
        if msg.event == 'delta':
            data = json.loads(msg.data)
            print(data['text'], end='', flush=True)
        elif msg.event == 'status':
            data = json.loads(msg.data)
            print(f"\nStatus: {data['resumed']}")

# Send message
def send_message(text, token=None):
    url = 'http://127.0.0.1:5055/message'
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
    response = requests.post(url, 
        headers=headers,
        json={'text': text}
    )
    return response.json()
```

### Curl

```bash
# Send message
curl -X POST http://127.0.0.1:5055/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"text": "Hello Codex"}'

# Get sessions
curl http://127.0.0.1:5055/sessions | jq

# Listen to events
curl -N http://127.0.0.1:5055/events

# Get config
curl http://127.0.0.1:5055/config | jq

# Update config
curl -X PUT http://127.0.0.1:5055/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"model": "gpt-5"}'
```

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to server

**Solutions:**
1. Verify server is running: `curl http://127.0.0.1:5055/health`
2. Check port: `netstat -an | grep 5055`
3. Verify HOST/PORT environment variables
4. Check firewall settings

### SSE Disconnects

**Problem:** EventSource keeps disconnecting

**Solutions:**
1. Check proxy timeout settings (increase to 60s+)
2. Verify keepalive pings are received
3. Check browser console for errors
4. Try different browser

### Authentication Errors

**Problem:** 401 Unauthorized

**Solutions:**
1. Verify WEBUI_TOKEN is set correctly
2. Check Authorization header format
3. Ensure token matches on client and server
4. Test without token (unset WEBUI_TOKEN)

### Large Responses

**Problem:** Timeout or truncation

**Solutions:**
1. SSE streams indefinitely (no timeout)
2. HTTP requests have default timeouts
3. Increase client timeout settings
4. For very large sessions, consider pagination

## Best Practices

1. **Always handle SSE reconnection** - EventSource does this automatically
2. **Buffer delta events** - Don't render each character individually
3. **Implement backoff** - For failed HTTP requests
4. **Validate input** - Before sending to API
5. **Handle errors gracefully** - Display user-friendly messages
6. **Use HTTPS in production** - With reverse proxy
7. **Set strong tokens** - When exposing beyond localhost
8. **Monitor connection status** - Provide UI feedback
9. **Test error paths** - Don't just test happy path
10. **Keep tokens secret** - Never commit to version control

## Future API Additions

Potential future endpoints (not yet implemented):

- `GET /sessions?search=<query>` - Search sessions
- `GET /export?path=<rollout>` - Export transcript
- `GET /logs?lines=200` - Recent logs
- `POST /import` - Import session file
- `GET /profiles` - Configuration profiles
- `PUT /profiles/:name` - Update profile

See DESIGN.md for rationale on future directions.
