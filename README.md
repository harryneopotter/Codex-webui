# Codex WebUI

> **Website:** [https://codex-webui.hnpart.xyz/](https://codex-webui.hnpart.xyz/)

> **Looking for the TypeScript version?**  
> See [`Codex-webui-ts`](https://github.com/harryneopotter/Codex-webui/tree/Codex-webui-ts) for the modern, modular TypeScript implementation.

A tiny, dependency-free Web UI that wraps your local **OpenAI Codex CLI**. It streams output via **SSE** like a smooth conversation, auto-resumes from your latest `rollout-*.jsonl` file, and lets you wrangle sessions and memory—all without the terminal turning into a chaotic scribble fest.

> Not affiliated with OpenAI. Runs entirely on your machine—no clouds, no drama.

> 📖 **Want to know how this came to be?** Read the [Origin Story](ORIGIN_STORY.md) — a tale of terminal terror, internet disconnections, and a 7-hour coding marathon fueled by caffeine and desperation.

## Why This Exists
We've all been there: Codex CLI is brilliant, but terminals? Not so much. Overwriting lines, mangled scrollback, and outputs that look like abstract art gone wrong. This UI swaps the mess for a clean browser experience with real-time streaming, easy resumes, and handy tools to keep your coding sessions flowing. Because life's too short for squinting at corrupted text.

## Screenshots

### Dark Theme
![Codex WebUI - Dark Theme](assets/webui-dark.jpg)

### Light Theme
![Codex WebUI - Light Theme](assets/webui-light.jpg)

## Features
- 🔌 **Local only**: Spawns your `codex` binary right on your machine—no remote shenanigans.
- 📡 **SSE streaming** with live connection status, so you see every delta as it happens.
- ♻️ **Auto-resume** from the latest rollout or pick any session file like a pro.
- 🧠 **Memory management**: View, edit, or delete facts stored in `.codex/memory.md`.
- ⚙️ **Config tweaks**: UI for switching models, approval modes, sandboxes, and extras.
- 🛡️ **Optional security**: Bearer token for those mutating routes if you're feeling exposed.
- 🎨 **Themes**: Light and dark modes because eye strain is the real villain.

## Installation

### Prerequisites
- Node.js 18+ (because we're not living in the stone age).
- OpenAI Codex CLI installed and ready to roll.

### Setup
1. **Clone the repo:**
   ```bash
   git clone https://github.com/harryneopotter/Codex-webui.git
   cd Codex-webui
   ```

2. **Install dev dependencies (optional—this baby's dependency-free):**
   ```bash
   npm install  # Just for scripts and linting fun
   ```

3. **Set up your env (optional but recommended):**
   ```bash
   cp .env.example .env
   # Tweak .env to your heart's content—ports, tokens, origins, oh my!
   ```

## Quick Start

### Option 1: npm Magic
```bash
npm start  # Fires up the server
# Or for dev mode with auto-reload (because who has time for manual restarts?):
npm run dev
```

### Option 2: Straight Node Vibes
```bash
# Run the server (defaults to localhost for safety)
HOST=127.0.0.1 PORT=5055 node server.js

# Pop open the UI in your browser
open http://127.0.0.1:5055   # macOS squad
start http://127.0.0.1:5055  # Windows warriors
xdg-open http://127.0.0.1:5055  # Linux legends
```

> Pro Tip: Exposing this externally? Set `ALLOW_ORIGIN` and `WEBUI_TOKEN` in your .env, or tunnel via SSH/Tailscale. Safety first—don't let randos mess with your Codex.

## Environment Variables
Check out `.env.example` for the full lineup. Customize ports, tokens, origins, and more to fit your setup.

## API Overview
Here's a quick hit list of endpoints to get you hacking:
- `GET /` — Serves up the static UI.
- `GET /events` — SSE stream for status, deltas, tools, and stderr.
- `POST /message` — Send user text (`{ text }`).
- `GET /sessions` — List all session files.
- `POST /resume` — Resume from a specific rollout (`{ path }`).
- `GET /session-messages` — Grab the last 100 messages from the current session.
- `GET /projects` — Session history grouped by workdir.
- `GET /memory` / `DELETE /memory` — Peek or purge memory facts.
- `GET /config` / `PUT /config` — Read/update whitelisted config keys.
- `POST /restart` — Restart Codex with the current resume.
- `POST /shutdown` — Politely tell Codex to call it a day.

📚 **[Full API Docs →](docs/API.md)** for the nitty-gritty details, params, and examples.

## Security Notes
- Binds to `127.0.0.1` by default—keeps things local and cozy.
- CORS locked to `http://localhost:PORT` out of the box.
- Going public? Flip on `WEBUI_TOKEN` for bearer auth on writes. Better safe than sorry!

## Documentation
We've got you covered with deeper dives in the `docs/` folder:
- **[Design Philosophy](docs/DESIGN.md)** - Why we built it this way (spoiler: simplicity wins).
- **[Technical Architecture](docs/ARCHITECTURE.md)** - Data flows, system guts, and how it all clicks.
- **[Comparison Guide](docs/COMPARISON.md)** - Vs. native CLI and other tools—spoiler: we win on usability.
- **[API Reference](docs/API.md)** - Every endpoint, event, and edge case.
- **[Development Guide](docs/DEVELOPMENT.md)** - Hacking, testing, and contributing tips.

## Contributing
Love it? Hate it? Got ideas? We're all ears! Check the [Development Guide](docs/DEVELOPMENT.md) for:
- Dev setup and code style.
- Testing rituals.
- PR etiquette.
Fork, tweak, and pull request away—let's make this even better together.

## License
MIT—free as in speech and beer. See `LICENSE` for the deets.
