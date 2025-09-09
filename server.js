#!/usr/bin/env node

// Minimal dependency-free Web UI to chat with Codex CLI (proto)
// - Serves a static chat page
// - Uses SSE to stream Codex output
// - Launches/keeps a single Codex session, supports multiple messages

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ROADMAP (server-side) — implementation notes
// - Session search/filters: extend GET /sessions to accept query params like
//   ?q=<needle>&since=<ms>&days=7 and filter the scanSessions() result array.
// - Export transcript: add GET /export?path=<rollout> (or current), reuse
//   parseSessionMessages() to build Markdown/HTML, return as attachment.
// - Health/log tail: add GET /logs?lines=200 to stream recent stderr/stdout
//   buffered text from the Codex child process (keep a ring buffer).
// - Config profiles: store profiles in config.toml (e.g., [profiles.<name>]) and
//   add GET/PUT /profiles and a field to switch active profile.
// - Keyboard shortcuts map: optional GET /shortcuts to expose current bindings.
// - Session import: add POST /import expecting a file upload path or content,
//   validate rollout schema, and write it under ~/.codex/sessions (optional).

const PORT = process.env.PORT ? Number(process.env.PORT) : 5055;
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.WEBUI_TOKEN || '';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || `http://localhost:${PORT}`;

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function requireAuth(req) {
  if (!TOKEN) return true; // localhost default: open
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

const CODEX_CMD = process.env.CODEX_CMD || 'codex';
// Anchor workdir to the project root (parent of codex-webui) unless overridden
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKDIR = process.env.CODEX_WORKDIR ? path.resolve(process.env.CODEX_WORKDIR) : ROOT_DIR;
// Read memory from the project-level .codex by default so it stays consistent
const MEMORY_FILE = process.env.CODEX_MEMORY_FILE || path.join(WORKDIR, '.codex', 'memory.md');
const CONFIG_FILE = path.join(__dirname, 'config.toml');

let codexProc = null;
let sessionConfigured = false;
let currentRequestId = null;
let sseClients = new Set();
let messageBuffer = '';
let LAST_RESUME_PATH = null;
const HISTORY_FILE = path.join(__dirname, 'history.json');

const SESS_ROOT = path.join(os.homedir(), '.codex', 'sessions');
const isWithinSessions = (p) => p && path.resolve(p).startsWith(path.resolve(SESS_ROOT));

function ensureMemoryFile() {
  const dir = path.dirname(MEMORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, '# Codex Persistent Memory\n\n', 'utf8');
  }
}

function readMemoryFacts() {
  try {
    ensureMemoryFile();
    const txt = fs.readFileSync(MEMORY_FILE, 'utf8');
    const facts = (txt.split('\n') || []).filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\-\s*/, '').trim());
    return facts;
  } catch {
    return [];
  }
}

function saveMemoryFactsFromText(text) {
  if (!text) return;
  ensureMemoryFile();
  const lines = text.split('\n');
  let factsToAdd = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.toUpperCase().startsWith('SAVE_MEMORY:')) {
      const fact = line.split(':', 1).length ? line.slice(line.indexOf(':') + 1).trim() : '';
      if (fact) factsToAdd.push(fact);
    }
  }
  if (!factsToAdd.length) return;
  const existing = new Set(readMemoryFacts());
  const fh = fs.openSync(MEMORY_FILE, 'a');
  for (const f of factsToAdd) {
    if (existing.has(f)) continue;
    fs.writeSync(fh, `- ${f}\n`);
  }
  fs.closeSync(fh);
}

function broadcast(event, data) {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { /* ignore */ }
  }
}

// Keep SSE alive through proxies
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); } catch {}
  }
}, 15000);

function getResumeMeta() {
  try {
    if (!LAST_RESUME_PATH) return null;
    const stat = fs.statSync(LAST_RESUME_PATH);
    const name = path.basename(LAST_RESUME_PATH);
    return { name, mtimeMs: stat.mtimeMs, size: stat.size };
  } catch { return null; }
}

function broadcastStatus() {
  const facts = readMemoryFacts();
  const meta = getResumeMeta();
  broadcast('status', {
    resumed: !!LAST_RESUME_PATH,
    resume_path: LAST_RESUME_PATH,
    resume_meta: meta,
    memory: facts,
    config: getConfigSafe()
  });
}

// ---- Config (TOML) helpers (module scope) ----
function defaultConfig() {
  return {
    model: 'gpt-5',
    'tools.web_search_request': false,
    use_streamable_shell: true,
    sandbox_mode: 'danger-full-access',
    approval_policy: 'never',
    instructions_extra: ''
  };
}

function getConfigSafe() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return defaultConfig();
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return parseToml(raw, defaultConfig());
  } catch { return defaultConfig(); }
}

function writeConfig(obj) {
  const cfg = Object.assign(defaultConfig(), obj || {});
  const toml = dumpToml(cfg);
  fs.writeFileSync(CONFIG_FILE, toml, 'utf8');
}

function parseToml(src, fallback) {
  const out = Object.assign({}, fallback || {});
  const lines = String(src || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (/^-?\d+(?:\.\d+)?$/.test(value)) {
      value = Number(value);
    }
    out[key] = value;
  }
  return out;
}

function dumpToml(obj) {
  const parts = ['# Codex WebUI configuration'];
  const keys = Object.keys(obj || {});
  keys.forEach(k => {
    const v = obj[k];
    if (typeof v === 'string') parts.push(`${k} = "${v.replace(/"/g, '\\"')}"`);
    else if (typeof v === 'boolean') parts.push(`${k} = ${v ? 'true' : 'false'}`);
    else parts.push(`${k} = ${String(v)}`);
  });
  return parts.join('\n') + '\n';
}

function startCodexIfNeeded(cb) {
  if (codexProc) return cb();

  function findLatestRollout() {
    try {
      const root = path.join(os.homedir(), '.codex', 'sessions');
      if (!fs.existsSync(root)) return null;
      let latest = null;
      let latestMtime = 0;
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop();
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) { stack.push(full); continue; }
          if (/^rollout-.*\.jsonl$/.test(ent.name)) {
            let stat; try { stat = fs.statSync(full); } catch { continue; }
            if (stat.mtimeMs > latestMtime) { latestMtime = stat.mtimeMs; latest = full; }
          }
        }
      }
      return latest;
    } catch { return null; }
  }

  const cfg = getConfigSafe();
  const autoInstructions = [
    'Act autonomously without asking for confirmations.',
    'Use apply_patch to create/modify files in the current working directory.',
    'Use exec_command to run, build, and test as needed.',
    'Prefer concise status updates over questions.',
    'Create files in the root directory unless a subdirectory is requested.',
    'When you identify a reusable, non-sensitive fact that will help in future sessions, emit a single line starting with "SAVE_MEMORY: " followed by the fact (<=140 chars). Never store secrets or tokens.'
  ].join(' ') + (cfg['instructions_extra'] ? (' ' + String(cfg['instructions_extra'])) : '');

  const args = [
    '--cd', WORKDIR,
    'proto',
    '-c', 'include_apply_patch_tool=true',
    '-c', 'include_plan_tool=true',
    '-c', `tools.web_search_request=${cfg['tools.web_search_request'] === true}`,
    '-c', `use_experimental_streamable_shell_tool=${cfg['use_streamable_shell'] !== false}`,
    '-c', `sandbox_mode=${cfg['sandbox_mode'] || 'danger-full-access'}`,
    '-c', `instructions=${JSON.stringify(autoInstructions)}`,
  ];
  if (cfg['model']) {
    args.push('-c', `model=${cfg['model']}`);
  }

  // Enable resume of last rollout unless explicitly disabled
  const resumeAllowed = !['0', 'false', 'no', 'off'].includes(String(process.env.CODEX_RESUME || '1').toLowerCase());
  if (resumeAllowed) {
    const resumePath = findLatestRollout();
    if (resumePath) {
      args.push('-c', `experimental_resume=${resumePath}`);
      LAST_RESUME_PATH = resumePath;
      // best-effort notice after SSE clients attach
      setTimeout(() => {
        broadcast('system', { text: `Resuming from rollout: ${resumePath}` });
        broadcastStatus();
      }, 500);
      recordResume(resumePath);
    }
  }

  codexProc = spawn(CODEX_CMD, args, { cwd: WORKDIR });

  codexProc.stdout.setEncoding('utf8');
  codexProc.stderr.setEncoding('utf8');

  codexProc.stderr.on('data', (d) => {
    broadcast('stderr', { text: d.toString() });
  });

  codexProc.on('exit', (code) => {
    broadcast('system', { text: `Codex exited with code ${code}` });
    codexProc = null;
    sessionConfigured = false;
  });

  codexProc.stdout.on('data', (chunk) => {
    const lines = chunk.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const msg = (event && event.msg) || {};
      const type = msg.type;

      if (type === 'session_configured') {
        sessionConfigured = true;
        // Set auto-approve policy
        const cfg2 = getConfigSafe();
        const ctl = { id: `ctl_${Date.now()}`, op: { type: 'override_turn_context', approval_policy: cfg2['approval_policy'] || 'never', sandbox_policy: { mode: cfg2['sandbox_mode'] || 'danger-full-access' } } };
        try { codexProc.stdin.write(JSON.stringify(ctl) + '\n'); } catch {}
        broadcast('system', { text: 'Codex session configured' });
        if (LAST_RESUME_PATH) recordResume(LAST_RESUME_PATH);
      }

      if (type === 'agent_message_delta') {
        const delta = msg.delta || '';
        messageBuffer += delta;
        broadcast('delta', { text: delta });
      }

      if (type === 'agent_message') {
        // Flush any buffer (or direct message)
        if (!messageBuffer) {
          const m = msg.message;
          if (m) messageBuffer = m;
        }
        if (messageBuffer) {
          saveMemoryFactsFromText(messageBuffer);
          broadcastStatus();
          broadcast('message', { text: messageBuffer });
          messageBuffer = '';
        }
      }

      if (type === 'exec_command_begin') {
        broadcast('tool', { name: 'Bash', detail: (msg.command || []).join(' ') });
      }
      if (type === 'patch_apply_begin') {
        broadcast('tool', { name: 'Edit', detail: 'apply_patch' });
      }
      if (type === 'task_complete') {
        broadcast('system', { text: 'Task complete' });
      }
      if (type === 'error') {
        broadcast('error', { text: msg.message || 'Error' });
      }
    }
  });

  cb();
}

function stopCodex(cb) {
  if (!codexProc) return cb();
  try {
    codexProc.stdin.write(JSON.stringify({ id: 'shutdown', op: { type: 'shutdown' } }) + '\n');
  } catch {}
  const proc = codexProc;
  codexProc = null;
  setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
    cb();
  }, 500);
}

function startCodexWithResume(resumePath, cb) {
  stopCodex(() => {
    LAST_RESUME_PATH = resumePath || null;
    // Force start with specific resume
    const cfg = getConfigSafe();
    const autoInstructions = [
      'Act autonomously without asking for confirmations.',
      'Use apply_patch to create/modify files in the current working directory.',
      'Use exec_command to run, build, and test as needed.',
      'Prefer concise status updates over questions.',
      'Create files in the root directory unless a subdirectory is requested.',
      'When you identify a reusable, non-sensitive fact that will help in future sessions, emit a single line starting with "SAVE_MEMORY: " followed by the fact (<=140 chars). Never store secrets or tokens.'
    ].join(' ') + (cfg['instructions_extra'] ? (' ' + String(cfg['instructions_extra'])) : '');
    const args = [
      '--cd', WORKDIR,
      'proto',
      '-c', 'include_apply_patch_tool=true',
      '-c', 'include_plan_tool=true',
      '-c', `tools.web_search_request=${cfg['tools.web_search_request'] === true}`,
      '-c', `use_experimental_streamable_shell_tool=${cfg['use_streamable_shell'] !== false}`,
      '-c', `sandbox_mode=${cfg['sandbox_mode'] || 'danger-full-access'}`,
      '-c', `instructions=${JSON.stringify(autoInstructions)}`,
    ];
    if (cfg['model']) { args.push('-c', `model=${cfg['model']}`); }
    if (resumePath) {
      args.push('-c', `experimental_resume=${resumePath}`);
    }
    codexProc = spawn(CODEX_CMD, args, { cwd: WORKDIR });
    codexProc.stdout.setEncoding('utf8');
    codexProc.stderr.setEncoding('utf8');
    codexProc.stderr.on('data', (d) => broadcast('stderr', { text: d.toString() }));
    codexProc.on('exit', (code) => {
      broadcast('system', { text: `Codex exited with code ${code}` });
      codexProc = null;
      sessionConfigured = false;
    });
    codexProc.stdout.on('data', (chunk) => {
      const lines = chunk.split('\n');
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        let event; try { event = JSON.parse(line); } catch { continue; }
        const msg = event.msg || {}; const type = msg.type;
        if (type === 'session_configured') {
          // set approvals
          const cfg2 = getConfigSafe();
          const ctl = { id: `ctl_${Date.now()}`, op: { type: 'override_turn_context', approval_policy: cfg2['approval_policy'] || 'never', sandbox_policy: { mode: cfg2['sandbox_mode'] || 'danger-full-access' } } };
          try { codexProc.stdin.write(JSON.stringify(ctl) + '\n'); } catch {}
          broadcast('system', { text: 'Codex session configured' });
          if (LAST_RESUME_PATH) recordResume(LAST_RESUME_PATH);
          broadcastStatus();
        }
        if (type === 'agent_message_delta') {
          const delta = msg.delta || '';
          messageBuffer += delta;
          broadcast('delta', { text: delta });
        }
        if (type === 'agent_message') {
          if (!messageBuffer) { const m = msg.message; if (m) messageBuffer = m; }
          if (messageBuffer) {
            saveMemoryFactsFromText(messageBuffer);
            broadcastStatus();
            broadcast('message', { text: messageBuffer });
            messageBuffer = '';
          }
        }
        if (type === 'exec_command_begin') broadcast('tool', { name: 'Bash', detail: (msg.command || []).join(' ') });
        if (type === 'patch_apply_begin') broadcast('tool', { name: 'Edit', detail: 'apply_patch' });
        if (type === 'task_complete') broadcast('system', { text: 'Task complete' });
        if (type === 'error') broadcast('error', { text: msg.message || 'Error' });
      }
    });
    cb();
  });
}

function scanSessions() {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { stack.push(full); continue; }
      if (/^rollout-.*\.jsonl$/.test(ent.name)) {
        let stat; try { stat = fs.statSync(full); } catch { continue; }
        out.push({ path: full, name: ent.name, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch { return { entries: [] }; }
}

function parseSessionMessages(filePath) {
  const out = [];
  try {
    if (!filePath || !fs.existsSync(filePath)) return out;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const s = line.trim(); if (!s) continue;
      let obj; try { obj = JSON.parse(s); } catch { continue; }
      if (obj.type === 'message' && obj.role && obj.content && Array.isArray(obj.content)) {
        const text = obj.content.map(c => c && c.text).filter(Boolean).join('\n');
        if (text) out.push({ role: obj.role, text });
      }
      // Fallback: proto event styles
      const msg = obj && obj.msg;
      if (msg && (msg.type === 'user_input' || msg.type === 'agent_message')) {
        if (msg.type === 'user_input' && msg.text) out.push({ role: 'user', text: String(msg.text) });
        if (msg.type === 'agent_message' && msg.message) out.push({ role: 'assistant', text: String(msg.message) });
      }
    }
  } catch {}
  // limit to last 100
  return out.slice(-100);
}

function writeHistory(h) {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2)); } catch {}
}

function recordResume(resumePath) {
  if (!resumePath) return;
  const h = readHistory();
  const ts = Date.now();
  h.entries = h.entries || [];
  // Deduplicate by resumePath + workdir
  h.entries = h.entries.filter(e => !(e.resume_path === resumePath && e.workdir === WORKDIR));
  h.entries.push({ resume_path: resumePath, workdir: WORKDIR, last_used: ts });
  writeHistory(h);
}

function sendUserInput(text) {
  if (!codexProc) return;
  const facts = readMemoryFacts();
  let memoryBlock = '';
  if (facts.length) {
    memoryBlock = '\n\n<memory>\n' + facts.map(f => `- ${f}`).join('\n') + '\n</memory>\n';
  }
  const finalText = text + memoryBlock;
  const items = [{ type: 'text', text: finalText }];
  const id = `msg_${Date.now().toString(16)}`;
  currentRequestId = id;
  const payload = { id, op: { type: 'user_input', items } };
  codexProc.stdin.write(JSON.stringify(payload) + '\n');
}

function serveStatic(req, res) {
  const url = req.url.split('?')[0];
  const root = path.join(__dirname, 'public');
  let filePath = root + (url === '/' ? '/index.html' : url);
  if (!filePath.startsWith(root)) { setCORS(res); res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { setCORS(res); res.writeHead(404); return res.end('Not Found'); }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
    setCORS(res);
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Basic CORS/preflight support so UI can be hosted elsewhere
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    return res.end();
  }
  if (req.method === 'GET' && req.url.startsWith('/events')) {
 setCORS(res);   
   res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
   
    res.write('\n');
    sseClients.add(res);
    // Push current status to the newly connected client
    try {
      const init = `event: status\n` + `data: ${JSON.stringify({ resumed: !!LAST_RESUME_PATH, resume_path: LAST_RESUME_PATH, resume_meta: getResumeMeta(), memory: readMemoryFacts() })}\n\n`;
      res.write(init);
    } catch {}
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // health check
  if (req.method === 'GET' && req.url === '/health') {
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // quiet favicon request
  if (req.method === 'GET' && req.url === '/favicon.ico') {
    setCORS(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/memory') {
    const facts = readMemoryFacts();
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ facts }));
  }

  if (req.method === 'DELETE' && req.url === '/memory') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { fact } = JSON.parse(body || '{}');
        if (!fact || typeof fact !== 'string') { setCORS(res); res.writeHead(400); return res.end('Bad JSON'); }
        ensureMemoryFile();
        try {
          const lines = fs.readFileSync(MEMORY_FILE, 'utf8').split('\n');
          const needle = `- ${fact}`;
          const out = lines.filter(l => l.trim() !== needle.trim());
          fs.writeFileSync(MEMORY_FILE, out.join('\n'), 'utf8');
        } catch {}
        broadcastStatus();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { setCORS(res); res.writeHead(400); res.end('Bad JSON'); }
    });
    return;
  }

  if (req.method === 'DELETE' && req.url === '/session') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { path: p } = JSON.parse(body || '{}');
        if (!p) { setCORS(res); res.writeHead(400); return res.end('Bad JSON'); }
        const abs = path.resolve(p);
        if (!isWithinSessions(abs) || !/rollout-.*\.jsonl$/.test(abs)) { setCORS(res); res.writeHead(403); return res.end('Forbidden'); }
        try { fs.unlinkSync(abs); } catch {}
        // prune history entries pointing to this file
        const h = readHistory();
        h.entries = (h.entries || []).filter(e => e.resume_path !== abs);
        writeHistory(h);
        if (LAST_RESUME_PATH === abs) LAST_RESUME_PATH = null;
        broadcastStatus();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { setCORS(res); res.writeHead(400); res.end('Bad JSON'); }
    });
    return;
  }

  if (req.method === 'DELETE' && req.url === '/project-history') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { resume_path } = JSON.parse(body || '{}');
        const h = readHistory();
        h.entries = (h.entries || []).filter(e => e.resume_path !== resume_path);
        writeHistory(h);
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { setCORS(res); res.writeHead(400); res.end('Bad JSON'); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/message') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body || '{}');
        if (typeof text !== 'string' || !text.trim() || text.length > 16*1024) {
          setCORS(res); res.writeHead(400); return res.end('Missing text');
        }
        startCodexIfNeeded(() => {
          sendUserInput(text.trim());
          setCORS(res);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      } catch (e) {
        setCORS(res); res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/config') {
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(getConfigSafe()));
  }

  if (req.method === 'PUT' && req.url === '/config') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const obj = JSON.parse(body || '{}');
        // whitelist only known keys
        const allowed = ['model','approval_policy','tools.web_search_request','use_streamable_shell','sandbox_mode','instructions_extra'];
        Object.keys(obj||{}).forEach(k => { if (!allowed.includes(k)) delete obj[k]; });
        writeConfig(obj);
        broadcastStatus();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { setCORS(res); res.writeHead(400); res.end('Bad JSON'); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/restart') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    startCodexWithResume(LAST_RESUME_PATH || null, () => {
      setCORS(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, resume_path: LAST_RESUME_PATH }));
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/sessions') {
    const list = scanSessions();
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ sessions: list, current: LAST_RESUME_PATH }));
  }

  if (req.method === 'GET' && req.url === '/session-messages') {
    const messages = parseSessionMessages(LAST_RESUME_PATH);
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ messages }));
  }

  if (req.method === 'POST' && req.url === '/resume') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let resumePath = null;
      try {
        // Try JSON body first
        const parsed = JSON.parse(body || '{}');
        resumePath = parsed && (parsed.path || parsed.resume_path) || null;
      } catch {
        // Fallback: raw string body treated as path
        const s = String(body || '').trim();
        if (s && s !== '{}' && s !== 'null') resumePath = s;
      }
      // path safety
      if (resumePath) {
        const abs = path.resolve(resumePath);
        if (!isWithinSessions(abs) || !/rollout-.*\.jsonl$/.test(abs)) {
          setCORS(res); res.writeHead(400, { 'Content-Type':'application/json' });
          return res.end(JSON.stringify({ ok:false, error:'Invalid resume path' }));
        }
      }
      startCodexWithResume(resumePath || null, () => {
        broadcastStatus();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, resume_path: resumePath || null }));
      });
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/projects') {
    const h = readHistory();
    // Group by workdir
    const groups = {};
    for (const e of h.entries || []) {
      (groups[e.workdir] = groups[e.workdir] || []).push(e);
    }
    // Sort entries in each group by last_used desc
    Object.values(groups).forEach(arr => arr.sort((a, b) => (b.last_used || 0) - (a.last_used || 0)));
    setCORS(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ groups }));
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    if (!requireAuth(req)) { setCORS(res); res.writeHead(401); return res.end(); }
    if (codexProc && codexProc.stdin) {
      try { codexProc.stdin.write(JSON.stringify({ id: 'shutdown', op: { type: 'shutdown' } }) + '\n'); } catch {}
      try { codexProc.stdin.end(); } catch {}
    }
    setCORS(res);
    res.writeHead(200); res.end('OK');
    return;
  }

  // static
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Codex WebUI running at http://${HOST}:${PORT}`);
});