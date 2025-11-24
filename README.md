# Codex WebUI

> **Looking for the TypeScript version?**  
> See [`Codex-webui-ts`](https://github.com/harryneopotter/Codex-webui/tree/Codex-webui-ts) for the modern, modular TypeScript implementation.

A tiny, dependency‑free Web UI that wraps the local **OpenAI Codex CLI**. It streams output via **SSE**, resumes from your latest `rollout-*.jsonl`, and lets you manage sessions & memory — all from a single static page.

> Not affiliated with OpenAI. Runs entirely on your machine.

## Why
The Codex terminal can get messy (scrollback/overwrites). This provides a clean browser UI with streaming, resume, and small quality‑of‑life tools.

## Screenshots

### Dark Theme
![Codex WebUI - Dark Theme](assets/webui-dark.jpg)

### Light Theme
![Codex WebUI - Light Theme](assets/webui-light.jpg)

## Features
- 🔌 **Local only**: spawns your `codex` binary
- 📡 **SSE streaming** with connection status
- ♻️ **Resume** from latest rollout or pick any session file
- 🧠 **Memory** viewer & delete (writes to `.codex/memory.md`)
- ⚙️ Config UI for model / approval / sandbox / extras
- 🛡️ Optional bearer token for mutating routes

## Installation

### Prerequisites
- Node.js 18+ installed on your system
- OpenAI Codex CLI installed and configured

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/harryneopotter/Codex-webui.git
   cd Codex-webui
   ```

2. **Install dependencies (optional - this project is dependency-free):**
   ```bash
   npm install  # Only needed for development scripts
   ```

3. **Configure environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your preferences
   ```

## Quick Start

### Method 1: Using npm scripts
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### Method 2: Direct node execution
```bash
# 1) Run the server (default binds to loopback)
HOST=127.0.0.1 PORT=5055 node server.js

# 2) Open the UI
open http://127.0.0.1:5055   # macOS
# Windows:
start http://127.0.0.1:5055
# Linux:
xdg-open http://127.0.0.1:5055
```

> Tip: If you ever expose it behind a proxy, set `ALLOW_ORIGIN` and `WEBUI_TOKEN`, or tunnel with SSH/Tailscale.

## Environment
See `.env.example` for all supported variables.

## API Overview

Quick reference of key endpoints:
- `GET /` — static UI
- `GET /events` — SSE stream (status, deltas, tool, stderr)
- `POST /message` — send user text (`{ text }`)
- `GET /sessions` — list session files
- `POST /resume` — `{ path }` to a rollout file
- `GET /session-messages` — last 100 messages from current session
- `GET /projects` — history grouped by `workdir`
- `GET /memory` / `DELETE /memory` — view/remove facts
- `GET /config` / `PUT /config` — read/update config (whitelisted keys)
- `POST /restart` — restart Codex with current resume
- `POST /shutdown` — ask Codex to shut down

📚 **[Complete API Documentation →](docs/API.md)**

## Security
- Default bind: `127.0.0.1`
- Default CORS: `http://localhost:PORT`
- Optional bearer token: set `WEBUI_TOKEN` if exposing

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Design Philosophy](docs/DESIGN.md)** - Core principles, design decisions, and rationale
- **[Technical Architecture](docs/ARCHITECTURE.md)** - System design, data flow, and implementation details
- **[Comparison Guide](docs/COMPARISON.md)** - How Codex WebUI compares to native CLI and similar tools
- **[API Reference](docs/API.md)** - Complete endpoint and SSE event specifications
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing, testing, and extending the codebase

## Contributing

We welcome contributions! Please see the [Development Guide](docs/DEVELOPMENT.md) for:
- Setting up your development environment
- Code style guidelines
- Testing procedures
- Pull request process

## License
MIT — see `LICENSE`.
