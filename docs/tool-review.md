# Codex WebUI Review

## Overview
Codex WebUI is a zero-runtime-dependency Node.js/TypeScript service that wraps the local OpenAI Codex CLI in a browser-based dashboard. It keeps Codex running as a child process, streams stdout via Server-Sent Events (SSE), and augments the bare CLI with history, memory, and settings management.

## Components & Architecture
- **Server (`src/server.ts`)**: Custom Node `http` server with manual routing, CORS handling, and per-IP rate limiting. Provides SSE broadcasting plus JSON endpoints for sessions, memory, config, and Codex control. Serves static assets from `public/`.
- **Codex Service (`src/services/codex.ts`)**: EventEmitter wrapper over the `codex proto` CLI. Injects auto-instructions, applies config-driven flags, handles resume detection, and translates CLI events (`agent_message_delta`, tool invocations, errors) into SSE payloads.
- **Memory Service (`src/services/memory.ts`)**: Manages `.codex/memory.md`, extracting `SAVE_MEMORY:` facts, appending deduplicated entries, and supporting deletions.
- **File Helpers (`src/utils/fs-helpers.ts`)**: Recursively scans `~/.codex/sessions`, parses rollout JSONL transcripts, validates session paths, and tracks project history in `history.json`.
- **Config Loader (`src/utils/config.ts`)**: Minimal TOML reader/writer with defaults for model selection, sandbox policy, and experimental tools.
- **Client SPA (`public/index.html`)**: Vanilla HTML/CSS/JS interface with collapsible navigation, dark/light themes, token/context counter, session/project lists, memory modal, and a streaming transcript pane powered by `EventSource`.
- **Tests (`tests/basic.test.js`)**: Node test runner exercises health, config, sessions, and rate limiting (needs fix where `rate limiting works` test is cut off).

## Application State & Flows
- **Runtime State**: Codex child process handle, last resume path, SSE client set, per-IP rate limit map.
- **Persistent Files**: `.codex/memory.md`, `history.json`, `config.toml`, and `~/.codex/sessions/rollout-*.jsonl`.
- **Client State**: DOM logs, current streaming bubble, localStorage-backed theme/sidebar preferences, modal action callbacks.
- **Data Flow**: Browser sends `/message` → server injects memory & forwards to Codex → stdout events → SSE → UI log; history + sessions endpoints allow resume/deletion loops; memory endpoints surface long-term facts.

## Feature & UX Inventory
- **Real-time streaming** with incremental agent deltas and tool call annotations.
- **Session dashboard** showing timestamps, sizes, quick resume, and deletion flows.
- **Project history** groups rollouts by working directory automatically.
- **Persistent memory viewer/editor** for `.codex/memory.md` facts.
- **Theme toggle + layout persistence**, token/context estimator, modal confirmations.
- **HTTP controls**: restart, shutdown, config PUT, auth token support, rate limiting, Dockerfile for deployment.

## CLI Comparison
| Capability | Vanilla Codex CLI | Codex WebUI |
| --- | --- | --- |
| Streaming readability | Scrolls away in terminal | Structured log with live delta bubble |
| Session resume | Manual file hunting | Auto-detected latest, clickable history |
| Memory management | None | UI for viewing/deleting `.codex/memory.md` |
| Tool visibility | Raw JSON lines | Human-friendly tool banners |
| Remote access | Local terminal only | HTTP server with optional auth + Docker |
| Rate limiting / auth | None | Built-in throttling & Bearer token |

The WebUI’s added TypeScript/HTML footprint (~1.5k LOC) directly powers features the CLI lacks, so the trade-off is justified for iterative agent work.

## Ratings (1–5 scale)
| Dimension | Score | Rationale |
| --- | --- | --- |
| **Usability** | **4.0** | Clean SPA with theme toggle, context counter, resume shortcuts, though error handling is minimal and some tests need finishing. |
| **Market Need** | **3.5** | Valuable for developers frequently using Codex locally; niche audience but strong fit for agent-focused workflows. |
| **Feature Depth** | **4.2** | Covers streaming, memory, history, config, and safety (auth/rate limit) without external deps; remaining gaps include richer analytics and hardened test coverage. |

Overall, Codex WebUI provides a meaningful productivity layer above the CLI while staying lightweight and self-hosted. Further investment should target polish (completion of tests, better failure surfacing) and marketing assets to broaden adoption.
