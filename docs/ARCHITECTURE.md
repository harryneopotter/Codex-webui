# Technical Architecture

## System Overview

Codex WebUI is a three-tier architecture consisting of a Node.js HTTP server, a browser-based client, and the Codex CLI as a child process. The components communicate via HTTP/SSE and stdin/stdout pipes.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  public/index.html (HTML + CSS + JavaScript)          │ │
│  │  - EventSource (SSE) connection to /events            │ │
│  │  - HTTP POST to /message, /resume, /config, etc.     │ │
│  │  - Dark/Light theme, sidebar, chat interface         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/SSE
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      Node.js Server                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  server.js (HTTP server + Codex manager)             │ │
│  │  - HTTP routes for API                                │ │
│  │  - SSE broadcast to all clients                       │ │
│  │  - Spawns and manages Codex process                   │ │
│  │  - Session/memory/config management                   │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │ spawn + stdin/stdout
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                       Codex CLI                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  codex proto                                          │ │
│  │  - Receives user_input via stdin (JSON)              │ │
│  │  - Emits events via stdout (JSONL)                   │ │
│  │  - Executes tools (bash, apply_patch, etc.)          │ │
│  │  - Reads/writes project files                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    File System                               │
│  - ~/.codex/sessions/rollout-*.jsonl  (session history)    │
│  - $WORKDIR/.codex/memory.md          (persistent facts)   │
│  - ./config.toml                      (runtime config)      │
│  - ./history.json                     (resume tracking)     │
│  - $WORKDIR/**/*                      (project files)       │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Server (`server.js`)

#### Core Responsibilities
- HTTP server for static files and API endpoints
- Codex CLI process lifecycle management
- Server-Sent Events broadcasting
- Session file scanning and parsing
- Memory fact extraction and persistence
- Configuration management (TOML)
- Resume history tracking

#### Key Modules (within single file)

##### HTTP Server
```javascript
http.createServer((req, res) => { /* route handling */ })
```
- Serves static files from `public/`
- Routes API requests to handlers
- Implements CORS headers
- Optional bearer token authentication

##### SSE Manager
```javascript
let sseClients = new Set()
function broadcast(event, data) { /* send to all clients */ }
```
- Maintains set of connected clients
- Broadcasts typed events (status, delta, tool, etc.)
- Keepalive pings every 15 seconds
- Automatic cleanup on disconnect

##### Codex Process Manager
```javascript
let codexProc = spawn(CODEX_CMD, args, { /* options */ })
```
- Spawns Codex CLI with configured arguments
- Manages stdin/stdout/stderr streams
- Parses JSONL events from stdout
- Injects memory context into user messages
- Handles process exit and cleanup

##### Session Scanner
```javascript
function scanSessions() { /* recursive directory walk */ }
```
- Recursively scans `~/.codex/sessions/`
- Finds all `rollout-*.jsonl` files
- Returns sorted by modification time
- Path validation for security

##### Configuration System
```javascript
function parseToml(src) { /* simple TOML parser */ }
function dumpToml(obj) { /* TOML serializer */ }
```
- Reads/writes `config.toml`
- Whitelist of allowed keys
- Default values for all options
- Runtime config updates

##### Memory Manager
```javascript
function saveMemoryFactsFromText(text) { /* extract SAVE_MEMORY */ }
function readMemoryFacts() { /* parse memory.md */ }
```
- Extracts facts from agent messages
- Deduplicates against existing facts
- Appends to `.codex/memory.md`
- Injects into user messages as XML block

#### Data Flow

**User Message Flow**:
```
Client POST /message
  → startCodexIfNeeded()
  → sendUserInput(text)
  → inject memory facts
  → write JSON to codexProc.stdin
  → Codex processes
  → emit events to stdout
  → parse and broadcast to clients
```

**Session Resume Flow**:
```
Client POST /resume
  → stopCodex()
  → startCodexWithResume(path)
  → spawn with -c experimental_resume=<path>
  → session_configured event
  → override approval policy
  → broadcast status
```

**Status Broadcast Flow**:
```
SSE client connects to /events
  → add to sseClients set
  → send initial status event
  → on state changes: broadcastStatus()
  → all clients receive status event
```

### 2. Client (`public/index.html`)

#### Component Structure

The single-page client is organized into logical sections:

##### HTML Structure
```html
<body>
  <div class="wrap">
    <header>...</header>
    <div class="layout">
      <aside id="sidebar">
        <div class="nav-icons">...</div>
        <div class="sbody">
          <section id="sessions">...</section>
          <section id="projects">...</section>
          <section id="memory">...</section>
          <section id="settings">...</section>
        </div>
      </aside>
      <main class="content">
        <div class="toolbar">...</div>
        <div id="log">...</div>
        <div class="input">
          <textarea id="textIn">...</textarea>
          <button id="sendBtn">Send</button>
        </div>
      </main>
    </div>
  </div>
</body>
```

##### JavaScript Architecture

**State Management**:
```javascript
let currentResumed = null
let memoryFacts = []
let sessions = []
let projects = {}
let config = {}
```

**Event Handlers**:
- SSE event listeners for server broadcasts
- Button click handlers for user actions
- Form submissions for messages
- Theme toggle and sidebar collapse

**Rendering Functions**:
- `renderSessions()`: Update session list
- `renderProjects()`: Update project groups
- `renderMemory()`: Update memory facts
- `renderSettings()`: Update config form
- `appendLog()`: Add message to chat log

**SSE Event Processing**:
```javascript
eventSource.addEventListener('delta', e => {
  // Append text delta to current message
})
eventSource.addEventListener('status', e => {
  // Update connection state, memory, config
})
eventSource.addEventListener('tool', e => {
  // Show tool execution indicator
})
```

#### Styling System

**CSS Variables for Theming**:
```css
:root {
  --bg: #0b0b0c;
  --panel: #0f1014;
  --text: #eaeaea;
  /* ... */
}
body.light {
  --bg: #f6f8fb;
  --panel: #ffffff;
  /* ... */
}
```

**Layout Strategy**:
- Flexbox for main layout
- Sidebar with expand/collapse
- Responsive design principles
- Smooth transitions for theme/sidebar

### 3. Codex CLI Integration

#### Process Spawning

```javascript
const codexProc = spawn(CODEX_CMD, [
  '--cd', WORKDIR,
  'proto',
  '-c', 'include_apply_patch_tool=true',
  '-c', 'include_plan_tool=true',
  '-c', 'tools.web_search_request=false',
  '-c', 'use_experimental_streamable_shell_tool=true',
  '-c', 'sandbox_mode=danger-full-access',
  '-c', 'instructions=...',
  '-c', 'model=gpt-5',
  '-c', 'experimental_resume=/path/to/rollout.jsonl'
], {
  cwd: WORKDIR,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, TERM: 'dumb' }
})
```

#### Communication Protocol

**Input (stdin) - JSON Messages**:
```json
{
  "id": "msg_<timestamp>",
  "op": {
    "type": "user_input",
    "items": [
      { "type": "text", "text": "User message + memory context" }
    ]
  }
}
```

**Control Messages**:
```json
{
  "id": "ctl_<timestamp>",
  "op": {
    "type": "override_turn_context",
    "approval_policy": "never",
    "sandbox_policy": { "mode": "danger-full-access" }
  }
}
```

**Output (stdout) - JSONL Events**:

Each line is a JSON object:
```json
{ "msg": { "type": "session_configured" } }
{ "msg": { "type": "agent_message_delta", "delta": "text chunk" } }
{ "msg": { "type": "agent_message", "message": "full message" } }
{ "msg": { "type": "exec_command_begin", "command": ["ls", "-la"] } }
{ "msg": { "type": "patch_apply_begin" } }
{ "msg": { "type": "task_complete" } }
{ "msg": { "type": "error", "message": "error details" } }
```

**stderr**: Raw text, broadcast as-is to clients

#### Event Types Handled

| Event Type | Server Action |
|------------|---------------|
| `session_configured` | Set approval policy, mark session ready |
| `agent_message_delta` | Buffer and broadcast text chunk |
| `agent_message` | Extract memory facts, broadcast complete message |
| `exec_command_begin` | Broadcast tool execution notification |
| `patch_apply_begin` | Broadcast file edit notification |
| `task_complete` | Broadcast completion status |
| `error` | Broadcast error message |

## Data Persistence

### Session Files (`~/.codex/sessions/rollout-*.jsonl`)

Format: JSONL (one JSON object per line)

**Sample Entry**:
```json
{"type": "message", "role": "user", "content": [{"type": "text", "text": "..."}]}
{"type": "message", "role": "assistant", "content": [{"type": "text", "text": "..."}]}
```

**Usage**:
- Created automatically by Codex CLI
- Read by server for message history
- Used for session resume
- Scanned for session list

### Memory File (`.codex/memory.md`)

Format: Markdown with bullet points

**Sample Content**:
```markdown
# Codex Persistent Memory

- Uses JWT for authentication
- Follow PEP 257 docstring conventions
- Tests located in tests/ directory
- Use npm run test to execute test suite
```

**Workflow**:
1. Agent emits `SAVE_MEMORY: <fact>` in response
2. Server extracts fact from message text
3. Server appends to memory.md (deduplicated)
4. Server injects memory into next user message
5. Agent receives context across sessions

### Configuration File (`config.toml`)

Format: TOML (key-value pairs)

**Sample Content**:
```toml
# Codex WebUI configuration
model = "gpt-5"
tools.web_search_request = false
use_streamable_shell = true
sandbox_mode = "danger-full-access"
approval_policy = "never"
instructions_extra = ""
```

**Management**:
- Read on startup and config requests
- Written on config updates
- Whitelisted keys only
- Merged with defaults

### History File (`history.json`)

Format: JSON array of resume entries

**Sample Content**:
```json
{
  "entries": [
    {
      "resume_path": "/home/user/.codex/sessions/rollout-abc123.jsonl",
      "workdir": "/home/user/project",
      "last_used": 1700000000000
    }
  ]
}
```

**Usage**:
- Track recently used sessions
- Group by workdir for project view
- Deduplicate by path + workdir
- Sorted by last_used timestamp

## API Endpoints

### Read Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve static UI (index.html) |
| GET | `/events` | SSE stream for real-time updates |
| GET | `/health` | Health check (returns `{ok: true}`) |
| GET | `/memory` | List memory facts |
| GET | `/config` | Get current configuration |
| GET | `/sessions` | List all session files |
| GET | `/session-messages` | Get messages from current session |
| GET | `/projects` | Get history grouped by workdir |

### Write Endpoints (require auth if WEBUI_TOKEN set)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/message` | `{text}` | Send user message to Codex |
| POST | `/resume` | `{path}` | Resume from specific session |
| POST | `/restart` | - | Restart Codex with current resume |
| POST | `/shutdown` | - | Shutdown Codex process |
| PUT | `/config` | `{...}` | Update configuration |
| DELETE | `/memory` | `{fact}` | Remove memory fact |
| DELETE | `/session` | `{path}` | Delete session file |
| DELETE | `/project-history` | `{resume_path}` | Remove from history |

### SSE Event Types

Sent from server to clients via `/events`:

| Event | Data | Description |
|-------|------|-------------|
| `status` | `{resumed, resume_path, memory, config}` | System state |
| `delta` | `{text}` | Incremental message text |
| `message` | `{text}` | Complete message |
| `tool` | `{name, detail}` | Tool execution |
| `system` | `{text}` | System notification |
| `stderr` | `{text}` | Codex stderr output |
| `error` | `{text}` | Error message |

## Security Architecture

### Authentication

**Token-Based**:
```javascript
function requireAuth(req) {
  if (!TOKEN) return true // localhost default: open
  return req.headers.authorization === `Bearer ${TOKEN}`
}
```

- Optional via `WEBUI_TOKEN` environment variable
- Applied only to mutating operations
- Checked before processing write requests
- Returns 401 Unauthorized if invalid

### Path Validation

**Session Path Security**:
```javascript
function isWithinSessions(p) {
  return p && path.resolve(p).startsWith(path.resolve(SESS_ROOT))
}
```

- All session operations validate paths
- Prevent directory traversal attacks
- Restrict to `~/.codex/sessions/` only
- Filename pattern validation (`rollout-*.jsonl`)

### CORS Policy

```javascript
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
```

- Default: `http://localhost:PORT`
- Configurable via `ALLOW_ORIGIN`
- Preflight OPTIONS handling
- Protects against unauthorized cross-origin requests

### Configuration Whitelist

```javascript
const allowed = [
  'model',
  'approval_policy',
  'tools.web_search_request',
  'use_streamable_shell',
  'sandbox_mode',
  'instructions_extra'
]
```

- Only whitelisted keys accepted
- Prevents arbitrary config injection
- Additional validation per key type
- Unknown keys ignored

### Environment Isolation

**Process Spawning**:
- Explicit stdio configuration
- Working directory control
- Environment variable passing
- Sandboxing via Codex CLI options

## Performance Considerations

### Server Performance

**Concurrency**:
- Single-threaded Node.js event loop
- Non-blocking I/O for file operations
- Streaming for large responses
- SSE multiplexing to multiple clients

**Memory**:
- Constant memory per SSE connection
- Message buffering only during streaming
- Session list cached until refresh
- No in-memory session storage

**CPU**:
- Minimal processing (mostly I/O bound)
- Simple JSONL parsing
- Text search for memory extraction
- TOML parsing overhead negligible

### Client Performance

**Rendering**:
- Incremental DOM updates for streaming text
- Virtual scrolling not needed (reasonable message counts)
- CSS transitions for smooth UX
- Lazy loading of session lists

**Network**:
- Single SSE connection (persistent)
- Minimal HTTP requests (API calls only)
- No polling needed
- Efficient text streaming

### Codex CLI Performance

**Startup**:
- ~2-5 seconds for initial session
- Resume adds ~1-2 seconds
- Model loading time variable
- Network latency for API calls

**Runtime**:
- Streaming responses reduce perceived latency
- Tool execution time varies
- File I/O dependent on project size
- Session file growth over time

## Error Handling

### Server Error Strategy

**Levels**:
1. **Critical**: Process exits, requires restart (e.g., port in use)
2. **Recoverable**: Log and continue (e.g., file read error)
3. **User Error**: Return 4xx status (e.g., bad JSON)
4. **Transient**: Retry or ignore (e.g., SSE write failure)

**Patterns**:
```javascript
try {
  // operation
} catch (e) {
  // log or broadcast error
  // return safe fallback
}
```

### Client Error Strategy

**Network Errors**:
- SSE auto-reconnect via EventSource
- Display connection status
- Retry failed requests manually
- Graceful degradation

**Display Errors**:
- Show stderr from Codex
- Render error events
- Visual indicators for failures
- No silent failures

### Codex Process Failures

**Exit Handling**:
```javascript
codexProc.on('exit', (code) => {
  broadcast('system', { text: `Codex exited with code ${code}` })
  codexProc = null
  sessionConfigured = false
})
```

**Recovery**:
- Process automatically respawned on next message
- Session resume preserved
- No automatic restart (wait for user action)

## Testing Strategy

### Current Test Coverage

Located in `tests/basic.test.js`:

1. **Server Startup**: Verifies server starts and responds
2. **Config Management**: Tests GET/PUT /config roundtrip
3. **Session Listing**: Validates /sessions endpoint structure
4. **Health Check**: Ensures /health responds correctly

**Test Framework**: Node.js built-in test runner (`node --test`)

### Testing Approach

**Unit-like Tests**:
- HTTP endpoint validation
- Config parsing/serialization
- Session scanning logic

**Integration Tests**:
- Full server lifecycle
- Multiple endpoints in sequence
- Port isolation (5065-5068 range)

**Manual Tests**:
- Browser UI interaction
- Codex CLI integration
- Session resume flows
- Memory persistence

### Test Limitations

**Not Tested**:
- Codex CLI interaction (requires real binary)
- SSE streaming (complex to test)
- UI rendering (no browser automation)
- Long-running scenarios

## Deployment Architecture

### Development Setup

```bash
npm run dev  # node --watch server.js
```
- Auto-reload on file changes
- Localhost binding
- No authentication
- Quick iteration

### Production Deployment

```bash
HOST=127.0.0.1 PORT=5055 WEBUI_TOKEN=secret node server.js
```

**Recommended Setup**:
1. Run behind reverse proxy (nginx/Caddy)
2. Use HTTPS termination at proxy
3. Set strong WEBUI_TOKEN
4. Configure ALLOW_ORIGIN for proxy domain
5. Firewall to restrict access
6. Run as non-root user
7. Use process manager (systemd/pm2)

**Not Recommended**:
- Exposing directly to internet
- Running without authentication
- Multi-user scenarios
- Shared hosting environments

## Extension Points

### Adding New API Endpoints

1. Add route handler in `server.js` createServer callback
2. Implement authentication check if needed
3. Add CORS headers
4. Return JSON response
5. Update API documentation

### Adding New SSE Events

1. Define event type and data structure
2. Call `broadcast(eventType, data)` in server
3. Add `eventSource.addEventListener()` in client
4. Handle event data and update UI
5. Document event type

### Extending Configuration

1. Add key to `defaultConfig()` function
2. Add to `allowed` array in PUT /config handler
3. Use value in `startCodexIfNeeded()` args
4. Add UI control in settings section
5. Update documentation

### Custom Memory Extraction

1. Modify `saveMemoryFactsFromText()` function
2. Change extraction pattern (currently `SAVE_MEMORY:`)
3. Add validation logic
4. Adjust deduplication strategy
5. Update agent instructions

## Monitoring and Debugging

### Logging

**Server Logs**:
- Stdout: Startup message, port binding
- Stderr: Not currently used
- Console: Debug info (none by default)

**Client Logs**:
- Browser console for errors
- Network tab for API calls
- EventSource events visible

### Debugging Techniques

**Server**:
```bash
node --inspect server.js  # Chrome DevTools
```

**Codex Communication**:
- Check stderr broadcasts in UI
- Inspect session JSONL files
- Validate JSON messages manually

**Configuration**:
- Read config.toml directly
- Check environment variables
- Verify path resolutions

### Common Issues

1. **Port Already in Use**: Change PORT environment variable
2. **Codex Not Found**: Set CODEX_CMD to full path
3. **Session Won't Resume**: Check file path and permissions
4. **Memory Not Persisting**: Verify WORKDIR and file permissions
5. **SSE Disconnects**: Check proxy timeout settings

## Conclusion

Codex WebUI's architecture prioritizes simplicity and transparency. The single-file server, straightforward client, and clean separation of concerns make it easy to understand, modify, and extend while maintaining reliability and security.
