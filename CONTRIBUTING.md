# Contributing to Codex WebUI

Thank you for your interest in contributing! This project is a zero-dependency Node.js Web UI for the OpenAI Codex CLI.

## Development Setup

1.  **Prerequisites**: Node.js 18+ and the Codex CLI installed.
2.  **Clone**: `git clone https://github.com/harryneopotter/Codex-webui.git`
3.  **Run**: `npm run dev` (starts server with auto-reload).
4.  **Test**: `npm test` (runs built-in Node.js tests).

## Project Structure

*   `src/`: Contains the backend logic in TypeScript.
    *   `server.ts`: Main entry point.
    *   `services/`: Core services (Codex, Memory).
    *   `utils/`: Utilities (Config, FS, Rate Limit).
*   `public/index.html`: Contains the **entire** frontend. It is a vanilla JS SPA.
*   `tests/`: Contains Node.js test runner files.

## Guidelines

*   **TypeScript**: We use TypeScript for the backend. Run `npm run build` to compile.
*   **Zero Runtime Dependencies**: We aim to keep `package.json` free of production dependencies. `typescript` is a dev dependency.
*   **Code Style**: Keep it simple and readable.
*   **Testing**: Please add tests for any new HTTP endpoints in `tests/basic.test.js`.

## Pull Request Process

1.  Fork the repo and create your branch from `master`.
2.  If you've added code that should be tested, add tests.
3.  Ensure the test suite passes (`npm test`).
4.  Update documentation if you've changed APIs or features.
