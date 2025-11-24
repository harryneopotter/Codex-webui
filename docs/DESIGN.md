# Design Philosophy

## Overview

Codex WebUI is designed as a minimal, dependency-free wrapper around the OpenAI Codex CLI that prioritizes simplicity, transparency, and user control. The design philosophy centers on providing a clean, browser-based interface while maintaining the power and flexibility of the underlying CLI tool.

## Core Design Principles

### 1. Zero Dependencies

**Philosophy**: Keep the tool lightweight and maintainable by avoiding external dependencies.

**Implementation**:
- Single-file Node.js server (`server.js`) using only standard library modules
- Single-page HTML/CSS/JavaScript client with vanilla JS (no frameworks)
- No `node_modules` bloat or dependency management overhead
- Built-in TOML parser/writer for configuration
- Native HTTP server and SSE (Server-Sent Events) implementation

**Benefits**:
- Fast startup and minimal resource footprint
- No dependency security vulnerabilities
- Easy to audit and understand the entire codebase
- No build steps or compilation required
- Simple deployment: just copy and run

### 2. Local-First Architecture

**Philosophy**: All data stays on the user's machine; no external services or telemetry.

**Implementation**:
- Spawns local `codex` CLI binary as a child process
- Default binding to `127.0.0.1` (localhost only)
- All session data stored locally in `~/.codex/sessions/`
- Memory persistence in local `.codex/memory.md`
- Optional token authentication for security

**Benefits**:
- Complete user privacy and data ownership
- Works entirely offline (after Codex CLI setup)
- No vendor lock-in or external service dependencies
- Full control over code execution and file access
- Compliance with data residency requirements

### 3. Streaming-First Communication

**Philosophy**: Provide real-time feedback for long-running AI operations.

**Implementation**:
- Server-Sent Events (SSE) for server-to-client streaming
- Event-driven architecture with typed messages
- Real-time delta updates as Codex generates responses
- Connection status indicators
- Persistent SSE connections with keepalive pings

**Benefits**:
- Immediate visual feedback during AI reasoning
- Reduced perceived latency
- Better understanding of Codex's thinking process
- Graceful handling of long operations
- Natural chat-like experience

### 4. Session Continuity

**Philosophy**: Enable seamless context preservation across sessions.

**Implementation**:
- Automatic resume from latest rollout file on startup
- Manual session selection and resume capability
- Session history tracking with workdir context
- Message history parsing from JSONL format
- Project grouping by working directory

**Benefits**:
- Maintain conversation context across restarts
- Switch between different projects easily
- Never lose work due to interruptions
- Clear audit trail of all interactions
- Easy debugging with session replay

### 5. Persistent Memory System

**Philosophy**: Enable Codex to learn and retain facts across sessions.

**Implementation**:
- Memory facts stored in `.codex/memory.md` as markdown bullets
- Automatic memory extraction from agent responses (via `SAVE_MEMORY:` directive)
- Memory injection into every user message
- Simple viewer and delete interface
- Deduplication of repeated facts

**Benefits**:
- Improved contextual awareness over time
- Reduced need for repetitive instructions
- Project-specific knowledge retention
- Human-readable memory format
- Easy manual editing when needed

### 6. Configuration Simplicity

**Philosophy**: Provide sensible defaults while allowing customization.

**Implementation**:
- Environment variables for deployment settings (`.env`)
- Runtime TOML configuration for Codex parameters
- Web UI for changing settings without file editing
- Whitelisted configuration keys for security
- Default values that work out of the box

**Benefits**:
- Quick setup for new users
- Advanced control for power users
- Security through configuration whitelisting
- No complicated initialization steps
- Runtime reconfiguration without restarts

### 7. Clean Separation of Concerns

**Philosophy**: Maintain clear boundaries between server, client, and Codex CLI.

**Implementation**:
- Server handles process management and state
- Client focuses on presentation and user interaction
- Codex CLI remains an independent black box
- SSE as the contract between server and client
- RESTful HTTP endpoints for operations

**Benefits**:
- Easy to reason about system behavior
- Simple to extend or modify components
- Clean upgrade path for Codex CLI updates
- Testing isolation
- Clear error boundaries

## Design Decisions

### Why Server-Sent Events Instead of WebSockets?

**Chosen**: Server-Sent Events (SSE)

**Rationale**:
- Simpler protocol: one-way streaming fits the use case
- Native browser support via `EventSource` API
- Easier to debug and monitor
- Works better with HTTP proxies and load balancers
- No need for bidirectional communication
- Automatic reconnection handling
- Lower overhead than WebSockets

**Trade-offs**:
- Cannot push from client (uses regular HTTP POST instead)
- Text-based only (sufficient for JSON events)

### Why Single-File Client?

**Chosen**: Single `public/index.html` with embedded CSS and JavaScript

**Rationale**:
- Matches zero-dependency philosophy
- Eliminates build step complexity
- Easier to understand the entire client at once
- No module bundling or transpilation needed
- Faster initial page load (no additional HTTP requests)
- Simpler deployment and development

**Trade-offs**:
- Harder to navigate for very large applications
- No hot module replacement during development
- Limited code organization options
- Current size (~485 lines) is still manageable

### Why TOML for Configuration?

**Chosen**: TOML format via custom parser

**Rationale**:
- Human-readable and easy to edit manually
- Matches Codex CLI's configuration format
- Simple structure suitable for key-value configs
- Custom parser avoids dependency
- Better than JSON for human-edited configs

**Trade-offs**:
- Custom parser is limited (basic key=value support)
- No support for complex TOML features
- Could be more fragile than a proper parser
- Current implementation is sufficient for needs

### Why JSONL for Session Storage?

**Chosen**: Use Codex CLI's native JSONL rollout format

**Rationale**:
- Direct compatibility with Codex CLI
- One event per line, easy to stream and parse
- Human-readable for debugging
- Append-only format, good for logging
- Standard format used by Codex ecosystem

**Trade-offs**:
- Slightly verbose compared to binary formats
- Requires line-by-line parsing
- File can grow large for long sessions
- Parsing complexity for nested structures

## User Experience Design

### Visual Design Goals

1. **Dark/Light Theme Support**: Accommodate user preferences
2. **Minimal Chrome**: Focus on content, not UI elements
3. **Clear Status Indicators**: Connection and system state always visible
4. **Collapsible Sidebar**: Maximize content area when needed
5. **Responsive Layout**: Work on various screen sizes
6. **Accessible Colors**: Good contrast ratios for readability

### Interaction Patterns

1. **Direct Input**: Type and send, like a chat interface
2. **Visual Streaming**: See responses build in real-time
3. **One-Click Actions**: Resume, delete, configure without modal fatigue
4. **Keyboard Shortcuts**: Future support for power users
5. **Progressive Disclosure**: Hide complexity until needed

### Error Handling Philosophy

1. **Fail Gracefully**: Show errors clearly but don't crash
2. **Contextual Feedback**: Indicate what failed and why
3. **Recovery Suggestions**: Provide actionable next steps
4. **Silent Tolerance**: Ignore non-critical issues
5. **Audit Trail**: Keep stderr and system messages visible

## Security Design

### Threat Model

**Trusted**: 
- Local machine and file system
- User running the application
- Codex CLI binary

**Untrusted**:
- Network connections (when exposed beyond localhost)
- User-provided configuration values
- Session file paths from client

### Security Measures

1. **Localhost Default**: Bind to 127.0.0.1 by default
2. **Optional Token Auth**: Bearer token for write operations
3. **CORS Restrictions**: Limit cross-origin access
4. **Path Validation**: Prevent directory traversal attacks
5. **Config Whitelisting**: Only allow known configuration keys
6. **Sandboxing**: Pass through Codex CLI sandbox settings
7. **No Credential Storage**: Never store API keys or tokens
8. **Session Path Validation**: Restrict access to `.codex/sessions/`

### Privacy Considerations

- No analytics or telemetry
- No outbound connections except Codex CLI's own
- No logs sent to external services
- User data never leaves local machine
- Memory stored in project directory under user control

## Scalability Considerations

### Current Limitations

- **Single User**: Designed for one user on one machine
- **Single Session**: One active Codex process at a time
- **Local Only**: No distributed operation support
- **Memory Growth**: Session files can grow indefinitely
- **No Pagination**: Large session lists loaded entirely

### Intentional Non-Goals

These are explicitly **not** goals of this design:

1. **Multi-tenancy**: Supporting multiple simultaneous users
2. **Cloud Deployment**: Running as a shared service
3. **Team Collaboration**: Real-time multi-user editing
4. **Mobile Apps**: Native mobile applications
5. **Enterprise SSO**: Integration with identity providers
6. **Metrics/Analytics**: Usage tracking and reporting
7. **Plugin System**: Third-party extensions

## Future Design Directions

While maintaining core principles, these enhancements align with the design philosophy:

### Near-Term Possibilities

1. **Session Search**: Filter sessions by content or date
2. **Export Transcripts**: Generate reports from sessions
3. **Config Profiles**: Multiple saved configuration sets
4. **Keyboard Shortcuts**: Power-user efficiency
5. **Session Import**: Load external rollout files

### Long-Term Possibilities

1. **Multiple Workspaces**: Switch between projects
2. **Diff Viewer**: Visual file change comparisons
3. **Tool Output Formatting**: Better display of command results
4. **Custom Instructions Profiles**: Saved instruction templates
5. **Session Branching**: Fork conversations at any point

All future additions must pass the filter:
- ✅ Does it maintain zero dependencies?
- ✅ Does it keep data local?
- ✅ Does it add clear value?
- ✅ Is it simple to understand?
- ✅ Does it respect user control?

## Conclusion

Codex WebUI's design prioritizes simplicity, transparency, and user empowerment over feature richness and complexity. By maintaining a small, focused codebase with zero dependencies, it provides a reliable and maintainable tool that users can understand, trust, and modify to their needs.

The design intentionally trades some potential features for clarity and maintainability, making it an ideal tool for developers who value understanding their tools as much as using them.
