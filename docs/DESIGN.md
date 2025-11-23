# Codex WebUI Design Document

## 1. Design Philosophy

The core philosophy of Codex WebUI is **"Zero-Dependency, Local-First Simplicity"**.

### 1.1 Zero Runtime Dependencies
The project aims to run on a standard Node.js installation without requiring a complex `node_modules` tree for production.
*   **Rationale**: Reduces security surface area (supply chain attacks), simplifies auditing, and ensures the application is lightweight and easy to archive or run in air-gapped environments.
*   **Trade-off**: We re-implement basic functionality like TOML parsing and MIME type handling instead of using libraries like `express` or `toml`.

### 1.2 Local-First & Privacy
All data stays on the user's machine.
*   **Sessions**: Stored as JSONL files in `~/.codex/sessions/`.
*   **Memory**: Stored as Markdown in `.codex/memory.md`.
*   **Execution**: The Codex CLI runs locally as a child process.

## 2. User Experience (UX) Design

### 2.1 Single-Page Application (SPA)
The client is a single HTML file (`public/index.html`) containing all CSS and JavaScript.
*   **Benefit**: Extremely fast load times, no build step for the frontend, easy to modify for end-users.
*   **Theme**: Auto-detects system preference (Dark/Light) with a manual toggle.

### 2.2 Streaming Interactions
Interaction with AI coding agents requires real-time feedback.
*   **Solution**: Server-Sent Events (SSE).
*   **Why not WebSockets?**: SSE is simpler to implement with native Node.js `http` module and firewall-friendly (standard HTTP). It perfectly matches the one-way stream of text from the agent to the user.

### 2.3 Session Management
Users need to switch between different "rollouts" (conversations) easily.
*   **Resume Capability**: The server tracks the last active session and can restart the Codex process pointing to a specific history file.
*   **Visual History**: The UI groups sessions by project directory, allowing users to jump back to previous contexts.

## 3. Technical Decisions

### 3.1 TypeScript Migration
Originally written in a single JavaScript file, the project was migrated to TypeScript to improve maintainability as features grew.
*   **Strict Mode**: Enabled to catch null pointer exceptions and type mismatches early.
*   **Modular Architecture**: Separation of concerns (Services vs. Routes vs. Utils) makes the codebase navigable.

### 3.2 File-Based Persistence
*   **JSONL (JSON Lines)**: Used for session logs.
    *   *Why*: Append-only writes are atomic and corruption-resistant. It allows reading the file line-by-line without loading the whole history into memory.
*   **TOML**: Used for configuration.
    *   *Why*: More human-readable than JSON for configuration files that users might edit manually.

### 3.3 Security Model
*   **Localhost Binding**: By default, the server listens only on `127.0.0.1`.
*   **Token Authentication**: If exposed to a network, a `WEBUI_TOKEN` environment variable enforces Bearer auth on all mutating endpoints.
*   **Rate Limiting**: In-memory rate limiting prevents abuse if the port is accidentally exposed.
*   **Sandbox Mode**: The UI exposes the `sandbox_mode` configuration to control what the Codex agent is allowed to do (e.g., `danger-full-access` vs restricted).
