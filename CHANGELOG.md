# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **TypeScript Migration**: Complete rewrite of the backend from `server.js` to modular TypeScript (`src/`).
- **Infrastructure**: Docker support (`Dockerfile`) and CI/CD workflow (`.github/workflows/ci.yml`).
- **Code Quality**: Added ESLint and Prettier for linting and formatting.
- **Documentation**: Added `CONTRIBUTING.md`, `docs/DESIGN.md`, and `docs/ARCHITECTURE.md`.
- **Features**: Rate limiting middleware and Health Check endpoint.

### Changed
- **Architecture**: Split monolithic `server.js` into `src/server.ts`, `src/services/`, and `src/utils/`.
- **Build**: Now requires a build step (`npm run build`) to generate `dist/`.

## [1.0.0] - 2023-10-27
### Added
- Initial release of Codex WebUI.
- Single-file Node.js server (`server.js`).
- Single-file vanilla JS client (`public/index.html`).
- SSE streaming support.
- Session management and resume capability.
- Memory persistence system.
