Codex WebUI

Overview
- A minimal, dependency‑free Web UI to chat with the Codex CLI. It serves one static page, streams output via SSE, and can resume prior sessions from rollout JSONL files.

No external dependencies
- This project intentionally has no third‑party runtime dependencies. The server uses only Node’s core modules, and the client is a single static HTML file with vanilla JS.
- There’s no build step; just start the server with Node. A small package.json is included only to expose start/test scripts and declare the Node engine.

Prerequisites
- Codex CLI installed and available on PATH (binary name: `codex`). The WebUI orchestrates the CLI but does not include it.
- For resuming sessions, rollout files must exist under `~/.codex/sessions/**/rollout-*.jsonl` (created by Codex CLI during prior runs). The WebUI can still start a fresh Codex session without existing rollouts.
- Memory does not require prior setup; the WebUI auto‑creates `<repo>/.codex/memory.md` unless `CODEX_MEMORY_FILE` is provided.

Screenshots
- Dark mode

  ![Dark mode](./assets/webui-dark.jpg)

- Light mode

  ![Light mode](./assets/webui-light.jpg)

Quick Start
- cd codex-webui
- PORT=5055 node server.js
- Open http://localhost:5055 (or http://<tailscale-ip>:5055 for remote access)
- Open http://localhost:5055

Alternate start (via npm)
- cd codex-webui
- npm run start (optionally set PORT=5055)

Requirements
- Node.js >= 18 (native fetch, node:test, EventSource-friendly defaults)

Architecture
- Server (server.js)
  - HTTP server that:
    - Serves public/index.html.
    - Streams events on GET /events (SSE).
    - Spawns a single Codex CLI process on demand (resume/messages).
    - Auto‑resumes the latest rollout in ~/.codex/sessions unless disabled.
    - Tracks a lightweight history in codex-webui/history.json.
- Client (public/index.html)
  - Sidebar: Sessions, Projects, Memories. Collapsible icon rail.
  - Status/toolbar, chat log with streaming, text input.
  - Memory modal to browse/delete facts.
  - Light/Dark theme (sun/moon) with transitions; persisted in localStorage.

Features
- Sessions: timestamped list; click to resume; right‑click to delete.
- Projects: one active session per workdir; click to resume.
- Transcript loader: renders last ~100 messages from the resumed rollout.
- Memory management: modal shows facts from .codex/memory.md; right‑click to delete.
- Subtle transitions for page and modals; compact status header.

Endpoints
- GET /events — SSE stream: status, system, stderr, tool, delta, message.
- POST /message — { text } to send a message to Codex.
- POST /resume — { path } to start Codex with experimental_resume.
- GET /sessions — finds ~/.codex/sessions/**/rollout-*.jsonl.
- GET /session-messages — parsed recent messages from current rollout.
- GET /projects — groups history entries by workdir.
- GET /memory — { facts } read from .codex/memory.md.
- DELETE /memory — { fact } to remove.
- DELETE /session — { path } to delete a rollout (guarded to sessions root).
- DELETE /project-history — { resume_path } to prune history.
- GET /config — returns config.toml.
- PUT /config — updates config.toml.
- POST /restart — restarts Codex with the current resume path.
- GET /health — { ok: true }.

Configuration
- Env vars
  - PORT — HTTP port (default 5055)
  - CODEX_CMD — Codex CLI executable (default codex)
  - CODEX_MEMORY_FILE — override memory file path (default: <repo>/.codex/memory.md)
  - CODEX_WORKDIR — working directory passed to Codex (default: repo root)
  - CODEX_RESUME — set 0/false to disable auto‑resume on server start
- Config file (GET/PUT /config): codex-webui/config.toml
  - model, approval_policy, tools.web_search_request, use_streamable_shell, sandbox_mode, instructions_extra

Memory
- Stored in .codex/memory.md. The WebUI appends facts when agent messages include lines starting with:
  SAVE_MEMORY: <your fact>

Security & CORS
- CORS is enabled (Access‑Control‑Allow‑Origin: *). If exposing publicly, front with authentication and/or restrict origins.
- Destructive routes enforce the sessions root path.

Developing & Extending
- Add endpoints: edit server.js inside the http.createServer handler; return JSON and set CORS headers.
- Extend themes: adjust CSS variables in public/index.html; add new presets (e.g., body.solarized) and wire a toggle.
- Sidebar icons: inline SVGs; copy an existing button block and update the path(s).
- Transcript parsing: extend parseSessionMessages for new JSONL formats.

Minimal Tests
- Requirements: Node.js >= 18 (uses node:test and fetch).
- Run tests:
  - node --test codex-webui/tests/*.test.js
  - Tests start the server on ports 5065–5068.

Troubleshooting
- Sessions list empty: ensure rollout-*.jsonl files exist under ~/.codex/sessions/YYYY/MM/DD/…
- Resume not working: check server stdout for spawn errors (missing codex binary) and verify the path you’re sending is correct.
- SSE disconnects: verify the server is running and that your browser/network allows EventSource.

Roadmap (teaser)
- Session search and filters — search by name/date; quick filters (Today, Last 7 days).
- Pin and rename sessions — pin important rollouts and add friendly labels.
- Compact transcript pagination — load earlier/later chunks on demand; jump to first/last.
- Export/share transcript — export to Markdown/HTML; copy a permalink to the rollout path.
- Quick actions menu — Restart, Fresh session (resume off), Clear chat view.
- Theme presets and system theme — add 2–3 presets (dim, solarized) + “match system”.
- Health indicators and logs — inline banner for spawn errors; quick stderr tail.
- Keyboard shortcuts — send, close, toggle sidebar/memory via keystrokes.
- Memory editing inline — edit facts inline; bulk delete.
- Config profile presets — save and swap named profiles in Settings.
- Session import — drag-and-drop a rollout-*.jsonl to add + resume.
