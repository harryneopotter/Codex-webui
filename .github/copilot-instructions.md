# Codex WebUI - AI Agent Instructions

## Architecture Overview

This is a **zero-dependency** Node.js 18+ web application that provides a browser UI for the OpenAI Codex CLI. The entire server logic lives in a single 779-line `server.js` file that:
- Spawns and manages the Codex CLI child process via `spawn()`
- Streams real-time output to browser clients using Server-Sent Events (SSE)
- Manages session files (`~/.codex/sessions/rollout-*.jsonl`)
- Persists memory facts to `.codex/memory.md` in the working directory

**Client**: Single-file SPA (`public/index.html`) with vanilla JS, no build tools or frameworks.

## Critical Patterns

### Codex CLI Integration
The server spawns Codex with specific flags and parses JSON-line stdout events:
```javascript
codexProc = spawn(CODEX_CMD, args, { 
  cwd: WORKDIR, 
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, TERM: 'dumb' }  // Required to avoid TTY errors
});
```

**Key events parsed**: `session_configured`, `agent_message_delta`, `agent_message`, `exec_command_begin`, `patch_apply_begin`, `task_complete`, `error`

### Memory System
Agent responses are scanned for `SAVE_MEMORY:` lines and appended to `.codex/memory.md`:
```javascript
// Pattern: "SAVE_MEMORY: fact text here"
// Facts are injected into user messages within <memory> tags
```

**Important**: Never store secrets in memory facts (<=140 chars per fact).

### SSE Broadcasting Pattern
All real-time updates use the `broadcast(event, data)` function to push to connected clients:
```javascript
broadcast('delta', { text: chunk });  // Streaming text
broadcast('tool', { name: 'Bash', detail: cmd });  // Tool invocations
broadcast('status', { resumed: true, memory: [...] });  // State updates
```

### Configuration Layers
1. **Environment (`.env`)**: Static startup config (Port, Host, Auth Token, Codex Binary Path).
2. **Runtime (`config.toml`)**: Dynamic user preferences (Model, Approval Policy, Tools).
   - Uses minimal hand-rolled TOML parser (`parseToml`/`dumpToml`).
   - **Whitelisted keys only**: `model`, `approval_policy`, `sandbox_mode`, `tools.web_search_request`, `use_streamable_shell`, `instructions_extra`.

## Development Workflows

### Platform Specifics (Windows)
- Use `start-windows.bat` for launching.
- **Path Handling**: Always use `path.join()` and `path.resolve()`. Avoid hardcoded forward slashes.
- **Process Spawning**: The `TERM: 'dumb'` env var is critical for Windows compatibility.

### Running & Testing
```bash
npm run dev          # Auto-reload during development
npm test             # Node.js built-in test runner (tests/basic.test.js)
node server.js       # Direct execution
```

Tests use ports 5065-5068 to avoid conflicts. Each test starts its own server instance.

### Adding HTTP Endpoints
Pattern used throughout `server.js`:
```javascript
if (req.method === 'GET' && req.url === '/your-route') {
  setCORS(res);  // Always set CORS headers first
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ data }));
}
```

**Auth check for mutating routes**: `if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }`

### Client-Side Conventions
The `public/index.html` uses:
- CSS custom properties for theming (`:root` for dark, `body.light` for light)
- `EventSource('/events')` for SSE connection
- Modal pattern with `.modal.open` class toggle
- localStorage for theme and sidebar state persistence

## Key Files & Their Roles

| File | Purpose | When to Edit |
|------|---------|--------------|
| `server.js` | Entire backend logic | Adding endpoints, changing Codex integration |
| `public/index.html` | Complete client app | UI changes, new client features |
| `tests/basic.test.js` | Node test runner tests | Adding endpoint tests |
| `config.toml` | Runtime config (auto-generated) | Don't edit manually |
| `.env.example` | Environment template | Adding new env vars |

## Common Tasks

### Adding a New Config Option
1. Update `defaultConfig()` with default value
2. Add key to whitelist in `PUT /config` handler (line ~615)
3. Use in Codex spawn args (around line 170)
4. Add UI field in settings modal (public/index.html ~line 600)

### Handling New Codex Event Types
Add parsing in `codexProc.stdout.on('data')` handler (line ~340):
```javascript
if (type === 'your_new_event') {
  broadcast('custom', { data: msg.your_field });
}
```

### Session Management Operations
- **List**: `scanSessions()` recursively walks `~/.codex/sessions/`
- **Resume**: `startCodexWithResume(path)` kills current process and spawns new one
- **Delete**: Validates path with `isWithinSessions()` before `fs.unlinkSync()`

## Security & Deployment

**Default**: Binds to `127.0.0.1` with no auth required (localhost only).

**When exposing externally**:
1. Set `WEBUI_TOKEN` env var
2. Configure `ALLOW_ORIGIN` for CORS
3. Use SSH tunnel or Tailscale (recommended over public exposure)

Session file deletion validates paths are within `~/.codex/sessions/` to prevent directory traversal.

## Testing Strategy

Current tests validate:
- Server startup and health endpoint
- Config GET/PUT roundtrip
- Sessions endpoint structure

**Not currently tested** (opportunities):
- SSE event streaming
- Memory fact parsing/deletion
- Session resume functionality
- Codex CLI integration (would need mocking)

## Roadmap & Implementation Status
Derived from `server.js` comments. These features are high-priority candidates for implementation:

- [ ] **Session Search/Filters**: Extend `GET /sessions` with `?q=`, `?since=`.
- [ ] **Export Transcript**: `GET /export?path=...` returning Markdown/HTML.
- [ ] **Log Tail**: `GET /logs` for recent stderr/stdout buffering.
- [ ] **Config Profiles**: Support multiple profiles in `config.toml`.
- [ ] **Session Import**: `POST /import` for uploading `.jsonl` sessions.

## Known Limitations

- **Missing Infrastructure**: No automated CI/CD pipeline, Docker containerization, or health monitoring.
- **Testing**: Tests are minimal (5 basic HTTP tests).
- **Architecture**: Single-file `server.js` (779 lines) with limited inline comments.
- **Type Safety**: No TypeScript.
- **Security**: No rate limiting on endpoints.
- **Documentation**: Missing `CONTRIBUTING.md`, `CHANGELOG.md`, and architecture diagrams.

### Refactoring Strategy
When `server.js` exceeds ~1000 lines, refactor into:
- `src/routes/`: HTTP endpoint handlers
- `src/codex/`: Child process management & event parsing
- `src/utils/`: Config, TOML, and file system helpers