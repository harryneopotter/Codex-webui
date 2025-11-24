# Development Guide

## Overview

This guide helps contributors understand how to develop, test, and contribute to Codex WebUI. Whether you're fixing a bug, adding a feature, or just exploring the codebase, this document will help you get started.

## Prerequisites

### Required

- **Node.js 18+**: The project uses ES modules and built-in test runner
- **Git**: For version control
- **OpenAI Codex CLI**: For testing integrations (optional for pure server dev)

### Recommended

- **Modern Browser**: Chrome, Firefox, or Edge for UI testing
- **Code Editor**: VS Code, Vim, or your preferred editor
- **Terminal**: Bash, zsh, or equivalent

## Getting Started

### Initial Setup

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Codex-webui.git
   cd Codex-webui
   ```

2. **Create Environment File:**
   ```bash
   cp .env.example .env
   # Edit .env if needed (optional for development)
   ```

3. **Verify Node Version:**
   ```bash
   node --version  # Should be 18.x or higher
   ```

4. **Run Tests:**
   ```bash
   npm test
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```

6. **Open Browser:**
   ```
   http://127.0.0.1:5055
   ```

### Development Workflow

**Typical Iteration Cycle:**

1. Make code changes
2. Server auto-restarts (via `--watch`)
3. Refresh browser to test
4. Run tests: `npm test`
5. Commit changes

**No build step required** - the project is dependency-free and runs directly.

## Project Structure

```
Codex-webui/
├── server.js              # Main server implementation
├── public/
│   └── index.html         # Single-page client
├── tests/
│   └── basic.test.js      # Test suite
├── docs/                  # Documentation
│   ├── DESIGN.md
│   ├── ARCHITECTURE.md
│   ├── COMPARISON.md
│   ├── API.md
│   └── DEVELOPMENT.md (this file)
├── assets/                # Screenshots
├── package.json           # Node.js configuration
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
├── README.md             # Main documentation
├── WARP.md               # WARP.dev guidance
├── LICENSE               # MIT license
└── start-windows.bat     # Windows launcher
```

### File Responsibilities

| File | Purpose | Size | Complexity |
|------|---------|------|------------|
| `server.js` | HTTP server, Codex manager, API | ~800 lines | Medium |
| `public/index.html` | Client UI, SSE handler, rendering | ~500 lines | Medium |
| `tests/basic.test.js` | Automated test suite | ~150 lines | Low |
| `docs/*.md` | Project documentation | Various | Low |

## Understanding the Code

### Server Architecture (`server.js`)

**Module-level State:**
```javascript
let codexProc = null              // Codex child process
let sessionConfigured = false     // Session ready flag
let currentRequestId = null       // Current message ID
let sseClients = new Set()        // Connected SSE clients
let messageBuffer = ''            // Streaming buffer
let LAST_RESUME_PATH = null       // Current session path
```

**Key Functions:**

| Function | Purpose | Lines |
|----------|---------|-------|
| `startCodexIfNeeded()` | Spawn Codex process | ~150 |
| `sendUserInput()` | Send message to Codex | ~20 |
| `broadcast()` | Send SSE to all clients | ~10 |
| `scanSessions()` | Find rollout files | ~30 |
| `parseToml()` / `dumpToml()` | Config management | ~40 |
| `readMemoryFacts()` | Parse memory.md | ~20 |
| `saveMemoryFactsFromText()` | Extract SAVE_MEMORY | ~30 |

**Request Handler Pattern:**
```javascript
if (req.method === 'POST' && req.url === '/endpoint') {
  if (!requireAuth(req)) { /* 401 */ }
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      // Process request
      setCORS(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      setCORS(res); res.writeHead(400); res.end('Bad JSON');
    }
  });
  return;
}
```

### Client Architecture (`public/index.html`)

**Structure:**
```html
<style>/* ~200 lines of CSS */</style>
<body>/* ~100 lines of HTML */</body>
<script>/* ~180 lines of JavaScript */</script>
```

**JavaScript Organization:**

1. **State Variables** (~20 lines)
2. **SSE Setup** (~30 lines)
3. **Event Handlers** (~40 lines)
4. **Rendering Functions** (~50 lines)
5. **Utility Functions** (~20 lines)
6. **Initialization** (~20 lines)

**Key Patterns:**

**SSE Event Listener:**
```javascript
eventSource.addEventListener('event_type', (e) => {
  const data = JSON.parse(e.data);
  // Update state
  // Render UI
});
```

**API Call:**
```javascript
async function apiCall(endpoint, method, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return response.json();
}
```

**Rendering:**
```javascript
function renderSomething() {
  const container = document.getElementById('container');
  container.innerHTML = items.map(item => `
    <div class="item">
      <span>${escapeHtml(item.text)}</span>
    </div>
  `).join('');
}
```

## Development Tasks

### Adding a New API Endpoint

**Example: Add GET /version**

1. **Add route handler in server.js:**
   ```javascript
   if (req.method === 'GET' && req.url === '/version') {
     setCORS(res);
     res.writeHead(200, { 'Content-Type': 'application/json' });
     return res.end(JSON.stringify({ 
       version: '1.0.0',
       node: process.version
     }));
   }
   ```

2. **Add to API documentation (docs/API.md):**
   ```markdown
   #### `GET /version`
   
   Returns server version information.
   
   **Response:**
   ```json
   {
     "version": "1.0.0",
     "node": "v18.0.0"
   }
   ```

3. **Add test (tests/basic.test.js):**
   ```javascript
   test('GET /version returns version info', async () => {
     const res = await fetch(`${BASE}/version`);
     assert.strictEqual(res.status, 200);
     const data = await res.json();
     assert.ok(data.version);
   });
   ```

4. **Test manually:**
   ```bash
   curl http://127.0.0.1:5055/version
   ```

### Adding a New SSE Event Type

**Example: Add 'progress' event**

1. **Emit from server (server.js):**
   ```javascript
   // In relevant function
   broadcast('progress', { 
     step: 'building',
     percent: 50 
   });
   ```

2. **Handle in client (public/index.html):**
   ```javascript
   eventSource.addEventListener('progress', (e) => {
     const { step, percent } = JSON.parse(e.data);
     updateProgressBar(step, percent);
   });
   ```

3. **Document in API.md:**
   ```markdown
   ### Event: `progress`
   
   Task progress updates.
   
   **Data:**
   ```json
   {
     "step": "building",
     "percent": 50
   }
   ```

### Adding a UI Feature

**Example: Add search box to sessions**

1. **Add HTML (public/index.html):**
   ```html
   <div class="section">
     <input type="text" id="sessionSearch" 
            placeholder="Search sessions...">
     <div id="sessions" class="list"></div>
   </div>
   ```

2. **Add event handler:**
   ```javascript
   document.getElementById('sessionSearch')
     .addEventListener('input', (e) => {
       searchTerm = e.target.value.toLowerCase();
       renderSessions();
     });
   ```

3. **Update render function:**
   ```javascript
   function renderSessions() {
     const filtered = sessions.filter(s =>
       s.name.toLowerCase().includes(searchTerm)
     );
     // Render filtered sessions
   }
   ```

4. **Add CSS styling:**
   ```css
   #sessionSearch {
     width: 100%;
     padding: 6px 8px;
     background: var(--bg);
     border: 1px solid var(--btnb);
     border-radius: 6px;
     color: var(--text);
     margin-bottom: 8px;
   }
   ```

### Modifying Configuration Options

**Example: Add new config key 'max_tokens'**

1. **Add to defaultConfig() in server.js:**
   ```javascript
   function defaultConfig() {
     return {
       model: 'gpt-5',
       max_tokens: 4096,  // New option
       // ... other options
     };
   }
   ```

2. **Add to whitelist in PUT /config:**
   ```javascript
   const allowed = [
     'model',
     'max_tokens',  // New option
     // ... other keys
   ];
   ```

3. **Use in startCodexIfNeeded():**
   ```javascript
   if (cfg['max_tokens']) {
     args.push('-c', `max_tokens=${cfg['max_tokens']}`);
   }
   ```

4. **Add UI control in public/index.html:**
   ```html
   <label>
     Max Tokens:
     <input type="number" id="cfgMaxTokens" 
            value="4096" min="1" max="32000">
   </label>
   ```

5. **Update docs/API.md** with new config field.

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test tests/basic.test.js

# Run with Node inspector
node --inspect --test tests/basic.test.js
```

### Test Structure

```javascript
import { test } from 'node:test';
import assert from 'node:assert';

test('description of test', async () => {
  // Arrange
  const input = 'test';
  
  // Act
  const result = someFunction(input);
  
  // Assert
  assert.strictEqual(result, expected);
});
```

### Writing New Tests

**Unit-style test example:**
```javascript
test('parseToml extracts key-value pairs', () => {
  const toml = 'key = "value"\nnum = 42';
  const result = parseToml(toml, {});
  
  assert.strictEqual(result.key, 'value');
  assert.strictEqual(result.num, 42);
});
```

**Integration test example:**
```javascript
test('POST /message sends to Codex', async (t) => {
  const port = 5066;
  const server = startTestServer(port);
  
  t.after(() => server.close());
  
  const res = await fetch(`http://127.0.0.1:${port}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello' })
  });
  
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.ok);
});
```

### Test Best Practices

1. **Use unique ports**: Each test server should use different port
2. **Clean up**: Use `t.after()` to close servers/connections
3. **Mock Codex**: Don't spawn real Codex in tests (too slow)
4. **Test error paths**: Not just happy path
5. **Keep tests fast**: Target <100ms per test
6. **Independent tests**: Each test should be runnable alone
7. **Clear assertions**: Use descriptive assert messages

### Manual Testing Checklist

After making changes, verify:

- [ ] Server starts without errors
- [ ] UI loads correctly
- [ ] Dark/light theme toggle works
- [ ] Sidebar collapse/expand works
- [ ] Sessions list populates
- [ ] Memory facts display
- [ ] Config UI reflects current settings
- [ ] Messages can be sent
- [ ] SSE connection shows "connected"
- [ ] Browser console shows no errors

## Debugging

### Server Debugging

**Console Logging:**
```javascript
console.log('Debug:', variable);
console.error('Error:', error);
```

**Node Inspector:**
```bash
node --inspect server.js
# Open chrome://inspect in Chrome
```

**Debug Codex Communication:**
```javascript
// Add in codexProc.stdout.on('data'):
console.log('Codex stdout:', chunk);

// Add in sendUserInput():
console.log('Sending to Codex:', JSON.stringify(payload));
```

### Client Debugging

**Browser Console:**
```javascript
console.log('SSE data:', e.data);
console.log('State:', { sessions, memory, config });
```

**Network Tab:**
- Check SSE connection status
- Inspect API request/response
- Monitor payload sizes

**Sources Tab:**
- Set breakpoints in inline JavaScript
- Step through event handlers
- Inspect variables

### Common Issues

**Issue: Port already in use**
```bash
# Find process using port
lsof -i :5055
# Kill process
kill -9 <PID>
# Or use different port
PORT=5056 node server.js
```

**Issue: Codex not found**
```bash
# Check Codex is installed
which codex
# Set full path
CODEX_CMD=/usr/local/bin/codex node server.js
```

**Issue: Sessions not loading**
```bash
# Check sessions directory exists
ls ~/.codex/sessions/
# Check permissions
ls -la ~/.codex/sessions/
```

**Issue: Memory not persisting**
```bash
# Check workdir
echo $CODEX_WORKDIR
# Check memory file
cat .codex/memory.md
# Check permissions
ls -la .codex/
```

## Code Style

### JavaScript Style

**General:**
- 2-space indentation
- Single quotes for strings
- Semicolons required
- camelCase for variables/functions
- UPPER_CASE for constants

**Examples:**
```javascript
// Good
const userName = 'John';
function getUserName() { return userName; }

// Avoid
const user_name = "John"
function get_user_name() { return user_name }
```

**Async/Await:**
```javascript
// Preferred
async function fetchData() {
  const res = await fetch(url);
  return res.json();
}

// Acceptable for callbacks
req.on('end', () => {
  // Handle end
});
```

### HTML/CSS Style

**HTML:**
- 2-space indentation
- Semantic elements
- Lowercase attributes
- Double quotes for attributes

**CSS:**
- CSS variables for theming
- Kebab-case for classes
- Logical property grouping
- Mobile-first responsive

**Example:**
```css
.my-component {
  /* Layout */
  display: flex;
  flex-direction: column;
  
  /* Spacing */
  padding: 12px;
  margin: 8px 0;
  
  /* Visual */
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  
  /* Text */
  color: var(--text);
  font-size: 14px;
}
```

### Comments

**When to comment:**
- Complex algorithms
- Non-obvious business logic
- Workarounds for bugs
- Public API documentation

**When not to comment:**
- Obvious code
- Self-explanatory function names
- Temporary debugging (remove instead)

**Examples:**
```javascript
// Good: Explains why
// Use dumb terminal to prevent TTY detection issues
const spawnEnv = { ...process.env, TERM: 'dumb' };

// Good: Documents complex logic
// Recursively scan ~/.codex/sessions/ for rollout-*.jsonl files,
// returning sorted by modification time (newest first)
function scanSessions() { /* ... */ }

// Bad: States the obvious
// Increment counter
counter++;

// Bad: Commented-out code (delete instead)
// const oldFunction = () => { /* ... */ };
```

## Git Workflow

### Branch Strategy

**Main Branches:**
- `main` - Stable releases
- `develop` - Development branch (if using)

**Feature Branches:**
```bash
git checkout -b feature/add-search
git checkout -b fix/session-loading
git checkout -b docs/update-readme
```

### Commit Messages

**Format:**
```
<type>: <short description>

<detailed description if needed>

<breaking changes if any>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (no logic change)
- `refactor`: Code refactoring
- `test`: Add/update tests
- `chore`: Maintenance tasks

**Examples:**
```bash
git commit -m "feat: add session search functionality"
git commit -m "fix: resolve SSE reconnection issue"
git commit -m "docs: update API documentation for /config endpoint"
git commit -m "refactor: extract config parsing into separate function"
```

### Pull Request Process

1. **Create feature branch**
2. **Make changes and commit**
3. **Write/update tests**
4. **Update documentation**
5. **Run full test suite**
6. **Push branch**
7. **Open PR with description:**
   - What changed
   - Why it changed
   - How to test
   - Screenshots (for UI changes)
8. **Address review feedback**
9. **Squash commits if requested**
10. **Merge after approval**

### PR Template

```markdown
## Description
Brief description of changes

## Motivation
Why this change is needed

## Changes
- Added X
- Modified Y
- Fixed Z

## Testing
How to test these changes

## Screenshots (if applicable)
Before/After images

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Code follows style guide
- [ ] No breaking changes (or documented)
```

## Performance Considerations

### Server Performance

**Optimize:**
- Use streaming for large data
- Avoid synchronous file I/O in hot paths
- Cache frequently accessed data
- Limit session list size for large directories

**Profile:**
```bash
node --prof server.js
# Generate logs
node --prof-process isolate-*.log > profile.txt
```

### Client Performance

**Optimize:**
- Batch DOM updates
- Use CSS transitions instead of JS animations
- Debounce search inputs
- Lazy load session details

**Measure:**
```javascript
console.time('render');
renderSessions();
console.timeEnd('render');
```

## Security Guidelines

### Input Validation

**Always validate:**
- User text length
- File paths
- Configuration values
- JSON structure

**Example:**
```javascript
if (typeof text !== 'string' || !text.trim()) {
  return res.writeHead(400).end('Invalid text');
}

if (!isWithinSessions(path.resolve(filePath))) {
  return res.writeHead(403).end('Forbidden');
}
```

### XSS Prevention

**Escape HTML:**
```javascript
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

**Use textContent:**
```javascript
// Good
element.textContent = userInput;

// Dangerous
element.innerHTML = userInput;
```

### Path Traversal Prevention

```javascript
function isWithinSessions(p) {
  const sessRoot = path.join(os.homedir(), '.codex', 'sessions');
  return p && path.resolve(p).startsWith(path.resolve(sessRoot));
}
```

### Token Security

**Don't:**
- Commit tokens to git
- Log tokens
- Send tokens in URLs
- Store tokens in localStorage (use sessionStorage)

**Do:**
- Use environment variables
- Rotate tokens regularly
- Use HTTPS in production
- Implement rate limiting

## Documentation

### When to Update Docs

**Always update docs for:**
- New API endpoints
- Changed behavior
- New configuration options
- Breaking changes
- New features

**Documentation checklist:**
- [ ] README.md (if user-facing)
- [ ] API.md (if API change)
- [ ] ARCHITECTURE.md (if design change)
- [ ] DEVELOPMENT.md (if dev process change)
- [ ] Code comments (if complex)

### Documentation Style

**Be:**
- Clear and concise
- Example-driven
- Technically accurate
- User-focused

**Include:**
- Purpose/motivation
- Examples
- Common pitfalls
- Related links

## Release Process

### Version Numbering

**Semantic Versioning:** `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Checklist

1. **Update version in package.json**
2. **Update CHANGELOG.md**
3. **Run full test suite**
4. **Manual testing**
5. **Update documentation**
6. **Commit:** `chore: bump version to X.Y.Z`
7. **Tag:** `git tag vX.Y.Z`
8. **Push:** `git push && git push --tags`
9. **Create GitHub release**
10. **Announce changes**

## Getting Help

### Resources

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **README.md**: Quick start and basic usage
- **API.md**: Complete API reference
- **ARCHITECTURE.md**: Technical deep-dive

### Asking Questions

**Good question format:**
```markdown
**Environment:**
- OS: macOS 13.0
- Node: v18.12.0
- Codex WebUI: v1.0.0

**What I'm trying to do:**
Add a new configuration option

**What I've tried:**
1. Added to defaultConfig()
2. Added to whitelist

**Error/Issue:**
Configuration not being saved

**Code snippet:**
```javascript
// My code here
```
```

### Contributing

**We welcome:**
- Bug reports
- Feature requests
- Documentation improvements
- Code contributions
- Examples and tutorials

**Before contributing:**
1. Check existing issues
2. Read CONTRIBUTING.md (if exists)
3. Discuss major changes first
4. Follow code style
5. Add tests
6. Update docs

## Conclusion

You now have a comprehensive understanding of how to develop Codex WebUI. Key takeaways:

1. **Simple architecture** - Single-file server and client
2. **Zero dependencies** - Easy to understand and modify
3. **Test-driven** - Write tests for changes
4. **Well-documented** - Keep docs in sync with code
5. **Community-focused** - Help others learn and contribute

Happy coding! 🚀
