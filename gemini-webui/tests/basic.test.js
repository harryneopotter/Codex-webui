// Basic tests for Generic AI WebUI using Node's built-in test runner
// Run with: node --test gemini-webui/tests/*.test.js

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname; // gemini-webui/

function startServer(port = 5070) {
  const env = { ...process.env, PORT: String(port), AI_CMD: 'echo' };
  const child = spawn('node', ['server.js'], { cwd: root, env });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', () => {});
  const url = `http://localhost:${port}`;
  return { child, url, logs: () => out };
}

async function waitForHealth(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url + '/health');
      if (r.ok) return true;
    } catch {}
    await wait(100);
  }
  return false;
}

test('server starts and /health responds', async (t) => {
  const { child, url } = startServer(5070);
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  assert.equal(await waitForHealth(url), true, 'health should respond');
  const r = await fetch(url + '/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.ai_cmd, 'echo');
});

test('GET / returns HTML', async (t) => {
  const { child, url } = startServer(5071);
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const r = await fetch(url + '/');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('Generic AI WebUI'), 'HTML title present');
});

test('POST /message accepts JSON', async (t) => {
  const { child, url } = startServer(5072);
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const r = await fetch(url + '/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'test message' })
  });
  assert.equal(r.status, 200);
});

test('POST /restart works', async (t) => {
  const { child, url } = startServer(5073);
  t.after(() => { try { child.kill('SIGKILL'); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const r = await fetch(url + '/restart', { method: 'POST' });
  assert.equal(r.status, 200);
});
