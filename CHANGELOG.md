# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Docker support (`Dockerfile` and `.dockerignore`).
- CI/CD workflow via GitHub Actions (`.github/workflows/ci.yml`).
- `CONTRIBUTING.md` guide.
- Rate limiting middleware to `server.js`.
- Architecture diagram in `README.md`.

## [1.0.0] - 2023-10-27
### Added
- Initial release of Codex WebUI.
- Single-file Node.js server (`server.js`).
- Single-file vanilla JS client (`public/index.html`).
- SSE streaming support.
- Session management and resume capability.
- Memory persistence system.
