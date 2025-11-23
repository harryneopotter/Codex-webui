# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2025-11-23

### Added
- **TypeScript Migration**: Complete rewrite of the backend from `server.js` to modular TypeScript (`src/`).
- **Infrastructure**: Docker support (`Dockerfile`) and CI/CD workflow (`.github/workflows/ci.yml`).
- **Code Quality**: Added ESLint and Prettier for linting and formatting.
- **Documentation**: Added `CONTRIBUTING.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/progress.md`, and `docs/migration-article-outline.md`.
- **Features**: Rate limiting middleware, Health Check endpoint, and token counter/context size monitor in WebUI.
- **Testing**: Added basic test for `/memory` endpoint.
- **CI/CD**: Updated GitHub Actions to include lint and build steps, supporting both `master` and `Codex-webui-ts` branches.
- **Branding**: Added project status badges, Shields.io badges, "Why I Built This" section, and CLI vs WebUI comparison table to README.
- **Visual Assets**: Added placeholders for demo GIF and screenshots in README.
- **Metadata**: Added GitHub topics (typescript, nodejs, ai, real-time, sse) to `package.json`.

### Changed
- **Architecture**: Split monolithic `server.js` into `src/server.ts`, `src/services/`, and `src/utils/`.
- **Build**: Now requires a build step (`npm run build`) to generate `dist/`.
- **Documentation**: Moved additional markdown files to `docs/` folder for better organization.

### Removed
- **Legacy Code**: Deleted original `server.js` (replaced by TypeScript modules).

## [1.0.0] - 2025-10-27
### Added
- Initial release of Codex WebUI.
- Single-file Node.js server (`server.js`).
- Single-file vanilla JS client (`public/index.html`).
- SSE streaming support.
- Session management and resume capability.
- Memory persistence system.
