// Minimal tests for Codex WebUI using Node's built-in test runner
// Run with: node --test codex-webui/tests/*.test.js

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)); // codex-webui/

function startServer(port = 5065) {
  const env = { ...process.env, PORT: String(port) };
  const child = spawn('node', ['dist/server.js'], { cwd: root, env });
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
  const { child, url } = startServer(5065);
  t.after(() => { try { child.kill(); } catch {} });
  assert.equal(await waitForHealth(url), true, 'health should respond');
  const r = await fetch(url + '/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
});

test('GET /config returns defaults', async (t) => {
  const { child, url } = startServer(5066);
  t.after(() => { try { child.kill(); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const r = await fetch(url + '/config');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.model, 'model present');
  assert.ok('approval_policy' in j, 'approval_policy present');
});

test('PUT /config roundtrip', async (t) => {
  const { child, url } = startServer(5067);
  t.after(() => { try { child.kill(); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const payload = { model: 'gpt-5', approval_policy: 'never' };
  const put = await fetch(url + '/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(put.status, 200);
  const get = await fetch(url + '/config');
  const j = await get.json();
  assert.equal(j.model, 'gpt-5');
  assert.equal(j.approval_policy, 'never');
});

test('GET /sessions returns JSON structure', async (t) => {
  const { child, url } = startServer(5068);
  t.after(() => { try { child.kill(); } catch {} });
  assert.equal(await waitForHealth(url), true);
  const r = await fetch(url + '/sessions');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.sessions));
  assert.ok('current' in j);
});

test('rate limiting works', async (t) => {
  const { child, url } = startServer(5069);
  t.after(() => { try { child.kill(); } catch {} });
  assert.equal(await waitForHealth(url), true);

  // Send 101 requests
  const requests = [];
  for (let i = 0; i < 101; i++) {
    requests.push(fetch(url + '/health'));
  }

  const responses = await Promise.all(requests);
  const tooManyRequests = responses.filter(r => r.status === 429);

  // At least one request should be rate limited (since limit is 100)
  assert.ok(tooManyRequests.length > 0, 'should rate limit after 100 requests');
});

