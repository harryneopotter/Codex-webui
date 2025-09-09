#!/usr/bin/env node

// Minimal dependency-free Web UI to wrap any AI CLI
// Simplified version of Codex WebUI for generic AI CLIs

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5056;
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.WEBUI_TOKEN || '';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || `http://localhost:${PORT}`;

// Generic AI CLI settings
const AI_CMD = process.env.AI_CMD || 'gemini-cli';
const AI_ARGS = process.env.AI_ARGS ? process.env.AI_ARGS.split(' ') : [];

// Current AI settings
let currentConfig = {
  model: process.env.GEMINI_MODEL || 'gemini-pro',
  temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.7'),
  maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '1024'),
  topP: parseFloat(process.env.GEMINI_TOP_P || '0.9')
};

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function requireAuth(req) {
  if (!TOKEN) return true;
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

let aiProc = null;
let sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { /* ignore */ }
  }
}

// Keep SSE alive
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n'); } catch {}
  }
}, 15000);

function startAI() {
  if (aiProc) return;
  
  broadcast('system', { text: `Starting ${AI_CMD} with model ${currentConfig.model}...` });
  
  // Build args with current configuration
  const args = [
    ...AI_ARGS,
    '--model', currentConfig.model,
    '--temperature', currentConfig.temperature.toString(),
    '--max-tokens', currentConfig.maxTokens.toString(),
    '--top-p', currentConfig.topP.toString()
  ].filter(arg => arg !== '');
  
  aiProc = spawn(AI_CMD, args, { 
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true 
  });

  aiProc.stdout.setEncoding('utf8');
  aiProc.stderr.setEncoding('utf8');

  aiProc.stdout.on('data', (chunk) => {
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        broadcast('message', { text: line.trim() });
      }
    }
  });

  aiProc.stderr.on('data', (chunk) => {
    broadcast('error', { text: chunk.toString() });
  });

  aiProc.on('exit', (code) => {
    broadcast('system', { text: `${AI_CMD} exited with code ${code}` });
    aiProc = null;
  });

  aiProc.on('error', (err) => {
    broadcast('error', { text: `Failed to start ${AI_CMD}: ${err.message}` });
    aiProc = null;
  });
}

function sendInput(text) {
  if (!aiProc) {
    startAI();
    // Wait a bit for process to start, then send input
    setTimeout(() => {
      if (aiProc) {
        try {
          aiProc.stdin.write(text + '\n');
        } catch (err) {
          broadcast('error', { text: `Failed to send input: ${err.message}` });
        }
      }
    }, 1000);
  } else {
    try {
      aiProc.stdin.write(text + '\n');
    } catch (err) {
      broadcast('error', { text: `Failed to send input: ${err.message}` });
    }
  }
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Serve static HTML
  if (url.pathname === '/') {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end('index.html not found');
    }
    return;
  }

  // SSE events endpoint
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    sseClients.add(res);
    
  // Send initial status
    broadcast('status', { 
      ai_cmd: AI_CMD,
      args: AI_ARGS,
      running: !!aiProc,
      config: currentConfig
    });
    
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Send message to AI
  if (url.pathname === '/message' && req.method === 'POST') {
    if (!requireAuth(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
        if (text) {
          broadcast('user', { text });
          sendInput(text);
        }
        res.writeHead(200);
        res.end('OK');
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
    return;
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      ok: true, 
      ai_cmd: AI_CMD,
      running: !!aiProc,
      config: currentConfig
    }));
    return;
  }

  // Update config
  if (url.pathname === '/config' && req.method === 'PUT') {
    if (!requireAuth(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const obj = JSON.parse(body || '{}');
        // apply only known keys
        const allowed = ['model','temperature','maxTokens','topP'];
        Object.keys(obj || {}).forEach(k => { if (!allowed.includes(k)) delete obj[k]; });
        currentConfig = { ...currentConfig, ...obj };
        broadcast('system', { text: `Config updated: ${JSON.stringify(obj)}` });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: currentConfig }));
      } catch {
        res.writeHead(400); res.end('Invalid JSON');
      }
    });
    return;
  }

  // Restart AI process
  if (url.pathname === '/restart' && req.method === 'POST') {
    if (!requireAuth(req)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    if (aiProc) {
      aiProc.kill();
      aiProc = null;
    }
    setTimeout(startAI, 500);
    
    res.writeHead(200);
    res.end('Restarting...');
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Generic AI WebUI running at http://${HOST}:${PORT}`);
  console.log(`📡 Using AI command: ${AI_CMD} ${AI_ARGS.join(' ')}`);
  console.log(`💡 Set AI_CMD and AI_ARGS environment variables to customize`);
});
