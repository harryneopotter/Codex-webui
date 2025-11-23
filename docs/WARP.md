# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Codex WebUI is a dependency-free Web UI that wraps the local OpenAI Codex CLI. It provides a clean browser interface for interacting with Codex, featuring streaming output via Server-Sent Events (SSE), session management, and memory persistence.

**Key Characteristics:**
- Node.js 18+ ES module-based application
- Modular TypeScript server implementation (`src/server.ts`)
- Serves static HTML/CSS/JS client from `public/index.html`
- Integrates with local OpenAI Codex CLI binary
- Uses JSONL session files for persistence

## Architecture

### Core Components

**Server (`src/server.ts`):**
- HTTP server with SSE streaming for real-time communication
- Spawns and manages Codex CLI child processes
- Handles session resume from `~/.codex/sessions/*.jsonl` files
- Manages persistent memory in `.codex/memory.md`
- TOML configuration system with whitelisted keys
- CORS and optional bearer token authentication

**Client (`public/index.html`):**
- Single-page application with vanilla JavaScript
- Dark/light theme switching
- Collapsible sidebar with sessions, projects, memory, and settings
- Real-time message streaming via EventSource
- Session management and memory viewer

**Key Data Flows:**
1. Client connects via SSE to `/events`
2. User messages sent to `/message` → forwarded to Codex CLI
3. Codex CLI stdout parsed for JSON events → broadcast to clients
4. Memory facts extracted from agent responses and saved to `memory.md`
5. Session files auto-resumed on startup unless disabled

### Directory Structure

```
/
├── src/                # TypeScript source code
│   ├── server.ts       # Main server application
│   ├── services/       # Business logic services
│   └── utils/          # Helper utilities
├── dist/               # Compiled JavaScript
├── package.json        # Node.js project config
├── public/index.html   # Single-file client application
├── start-windows.bat   # Windows batch launcher
├── tests/basic.test.js # Node.js built-in test suite
├── .env.example       # Environment configuration template
└── config.toml        # Runtime configuration (auto-generated)
```

### Configuration

**Environment Variables (.env):**
- `HOST` / `PORT`: Server binding (default: 127.0.0.1:5055)
- `WEBUI_TOKEN`: Optional bearer token for write operations
- `CODEX_CMD`: Codex binary path (default: "codex")
- `CODEX_WORKDIR`: Working directory override
- `CODEX_RESUME`: Auto-resume latest rollout (default: 1)

**Runtime Config (config.toml):**
- `model`: Codex model selection (default: gpt-5)
- `approval_policy`: Auto-approval setting (default: never)
- `sandbox_mode`: Execution safety (default: danger-full-access)
- `use_streamable_shell`: Enable streaming shell commands
- `instructions_extra`: Additional agent instructions

## Common Development Commands

### Running the Application

```bash
# Start server (development mode with auto-reload)
npm run dev

# Start server (production mode)
npm start

# Windows batch launcher
start-windows.bat

# Manual start with environment variables
HOST=127.0.0.1 PORT=5055 node dist/server.js
```

### Testing

```bash
# Run all tests using Node.js built-in test runner
npm test

# Run tests manually
node --test tests/*.test.js

# Run specific test file
node --test tests/basic.test.js
```

### Development Workflow

**Starting Development:**
1. Ensure Node.js 18+ is installed
2. Ensure OpenAI Codex CLI is installed and configured
3. Copy `.env.example` to `.env` and customize if needed
4. Run `npm run dev` for auto-reload during development

**Testing Changes:**
- Server tests validate HTTP endpoints, config management, and session listing
- Tests use different ports (5065-5068) to avoid conflicts
- Manual testing via browser at `http://127.0.0.1:5055`

**Key Development Areas:**
- Server-side: Add new HTTP endpoints in `src/server.ts`
- Client-side: Modify the single `public/index.html` file
- Configuration: Update TOML parsing/writing functions in `src/utils/config.ts`
- Session management: Extend `scanSessions()` in `src/utils/fs-helpers.ts`

## Integration Points

### Codex CLI Integration
- Spawns Codex with specific arguments including workdir, tools, and model config
- Parses JSON-line stdout for events: `session_configured`, `agent_message_delta`, `exec_command_begin`, etc.
- Manages session resume via `experimental_resume` flag
- Auto-applies approval policies and sandbox settings

### File System Integration
- **Sessions**: `~/.codex/sessions/rollout-*.jsonl` files
- **Memory**: `.codex/memory.md` in working directory
- **History**: Local `history.json` for tracking recent sessions
- **Config**: Local `config.toml` for runtime settings

### Security Considerations
- Default binding to localhost only
- Optional bearer token authentication for write operations
- CORS restrictions to prevent unauthorized cross-origin requests
- Sandbox mode configuration for Codex execution safety

## Windows-Specific Notes

- Uses `start-windows.bat` for easy Windows launching
- PowerShell environment variable syntax supported
- File path handling accounts for Windows path separators
- Process spawning compatible with Windows Codex binary locations
