import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { checkRateLimit } from './utils/rate-limit.js';
import { codexService } from './services/codex.js';
import { getConfigSafe, writeConfig } from './utils/config.js';
import { readMemoryFacts, deleteMemoryFact } from './services/memory.js';
import { scanSessions, parseSessionMessages, isWithinSessions, readHistory, writeHistory } from './utils/fs-helpers.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT ? Number(process.env.PORT) : 5055;
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.WEBUI_TOKEN || '';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || `http://localhost:${PORT}`;
const sseClients = new Set();
function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function requireAuth(req) {
    if (!TOKEN)
        return true;
    return req.headers.authorization === `Bearer ${TOKEN}`;
}
function broadcast(event, data) {
    const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(payload);
        }
        catch { /* ignore */ }
    }
}
// Keep SSE alive
setInterval(() => {
    for (const res of sseClients) {
        try {
            res.write(': ping\n\n');
        }
        catch { }
    }
}, 15000);
// Wire up Codex Service events
codexService.on('broadcast', (event, data) => broadcast(event, data));
codexService.on('status_update', () => broadcastStatus());
function getResumeMeta() {
    try {
        const lastPath = codexService.getLastResumePath();
        if (!lastPath)
            return null;
        const stat = fs.statSync(lastPath);
        const name = path.basename(lastPath);
        return { name, mtimeMs: stat.mtimeMs, size: stat.size };
    }
    catch {
        return null;
    }
}
function broadcastStatus() {
    const facts = readMemoryFacts();
    const meta = getResumeMeta();
    const lastPath = codexService.getLastResumePath();
    broadcast('status', {
        resumed: !!lastPath,
        resume_path: lastPath,
        resume_meta: meta,
        memory: facts,
        config: getConfigSafe()
    });
}
function serveStatic(req, res) {
    const url = (req.url || '').split('?')[0];
    // Adjust path to point to public folder relative to dist/server.js or src/server.ts
    // Assuming compiled to dist/, public is in ../public
    // But during dev with ts-node or similar, it might be different.
    // Let's assume standard structure: project/public
    const root = path.resolve(__dirname, '../../public');
    let filePath = path.join(root, url === '/' ? 'index.html' : url);
    if (!filePath.startsWith(root)) {
        setCORS(res);
        res.writeHead(403);
        return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            setCORS(res);
            res.writeHead(404);
            return res.end('Not Found');
        }
        const ext = path.extname(filePath);
        const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
        setCORS(res);
        res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
        res.end(data);
    });
}
const server = http.createServer((req, res) => {
    if (!checkRateLimit(req)) {
        setCORS(res);
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Too Many Requests' }));
    }
    if (req.method === 'OPTIONS') {
        setCORS(res);
        res.writeHead(204);
        return res.end();
    }
    const url = req.url || '/';
    if (req.method === 'GET' && url.startsWith('/events')) {
        setCORS(res);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.write('\n');
        sseClients.add(res);
        // Initial status
        const lastPath = codexService.getLastResumePath();
        try {
            const init = `event: status\n` + `data: ${JSON.stringify({ resumed: !!lastPath, resume_path: lastPath, resume_meta: getResumeMeta(), memory: readMemoryFacts() })}\n\n`;
            res.write(init);
        }
        catch { }
        req.on('close', () => sseClients.delete(res));
        return;
    }
    if (req.method === 'GET' && url === '/health') {
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'GET' && url === '/memory') {
        const facts = readMemoryFacts();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ facts }));
    }
    if (req.method === 'DELETE' && url === '/memory') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { fact } = JSON.parse(body || '{}');
                if (!fact || typeof fact !== 'string') {
                    setCORS(res);
                    res.writeHead(400);
                    return res.end('Bad JSON');
                }
                deleteMemoryFact(fact);
                broadcastStatus();
                setCORS(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            }
            catch (e) {
                setCORS(res);
                res.writeHead(400);
                res.end('Bad JSON');
            }
        });
        return;
    }
    if (req.method === 'DELETE' && url === '/session') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const { path: p } = JSON.parse(body || '{}');
                if (!p) {
                    setCORS(res);
                    res.writeHead(400);
                    return res.end('Bad JSON');
                }
                const abs = path.resolve(p);
                if (!isWithinSessions(abs) || !/rollout-.*\.jsonl$/.test(abs)) {
                    setCORS(res);
                    res.writeHead(403);
                    return res.end('Forbidden');
                }
                try {
                    fs.unlinkSync(abs);
                }
                catch { }
                const h = readHistory();
                h.entries = (h.entries || []).filter(e => e.resume_path !== abs);
                writeHistory(h);
                // If current session was deleted, we might want to update state, but CodexService handles its own state.
                // Ideally we should tell CodexService, but for now just broadcasting status is enough as the file is gone.
                broadcastStatus();
                setCORS(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            }
            catch (e) {
                setCORS(res);
                res.writeHead(400);
                res.end('Bad JSON');
            }
        });
        return;
    }
    if (req.method === 'DELETE' && url === '/project-history') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
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
            }
            catch (e) {
                setCORS(res);
                res.writeHead(400);
                res.end('Bad JSON');
            }
        });
        return;
    }
    if (req.method === 'POST' && url === '/message') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { text } = JSON.parse(body || '{}');
                if (typeof text !== 'string' || !text.trim() || text.length > 16 * 1024) {
                    setCORS(res);
                    res.writeHead(400);
                    return res.end('Missing text');
                }
                codexService.start().then(() => {
                    codexService.sendUserInput(text.trim());
                    setCORS(res);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                });
            }
            catch (e) {
                setCORS(res);
                res.writeHead(400);
                res.end('Bad JSON');
            }
        });
        return;
    }
    if (req.method === 'GET' && url === '/config') {
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(getConfigSafe()));
    }
    if (req.method === 'PUT' && url === '/config') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const obj = JSON.parse(body || '{}');
                const allowed = ['model', 'approval_policy', 'tools.web_search_request', 'use_streamable_shell', 'sandbox_mode', 'instructions_extra'];
                Object.keys(obj || {}).forEach(k => { if (!allowed.includes(k))
                    delete obj[k]; });
                writeConfig(obj);
                broadcastStatus();
                setCORS(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            }
            catch (e) {
                setCORS(res);
                res.writeHead(400);
                res.end('Bad JSON');
            }
        });
        return;
    }
    if (req.method === 'POST' && url === '/restart') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        const lastPath = codexService.getLastResumePath();
        codexService.restart(lastPath, () => {
            setCORS(res);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, resume_path: lastPath }));
        });
        return;
    }
    if (req.method === 'GET' && url === '/sessions') {
        const list = scanSessions();
        const lastPath = codexService.getLastResumePath();
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ sessions: list, current: lastPath }));
    }
    if (req.method === 'GET' && url === '/session-messages') {
        const lastPath = codexService.getLastResumePath();
        const messages = parseSessionMessages(lastPath);
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ messages }));
    }
    if (req.method === 'POST' && url === '/resume') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            let resumePath = null;
            try {
                const parsed = JSON.parse(body || '{}');
                resumePath = parsed && (parsed.path || parsed.resume_path) || null;
            }
            catch {
                const s = String(body || '').trim();
                if (s && s !== '{}' && s !== 'null')
                    resumePath = s;
            }
            if (resumePath) {
                const abs = path.resolve(resumePath);
                if (!isWithinSessions(abs) || !/rollout-.*\.jsonl$/.test(abs)) {
                    setCORS(res);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ ok: false, error: 'Invalid resume path' }));
                }
            }
            codexService.restart(resumePath, () => {
                broadcastStatus();
                setCORS(res);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, resume_path: resumePath }));
            });
        });
        return;
    }
    if (req.method === 'GET' && url === '/projects') {
        const h = readHistory();
        const groups = {};
        for (const e of h.entries || []) {
            (groups[e.workdir] = groups[e.workdir] || []).push(e);
        }
        Object.values(groups).forEach(arr => arr.sort((a, b) => (b.last_used || 0) - (a.last_used || 0)));
        setCORS(res);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ groups }));
    }
    if (req.method === 'POST' && url === '/shutdown') {
        if (!requireAuth(req)) {
            setCORS(res);
            res.writeHead(401);
            return res.end();
        }
        codexService.stop();
        setCORS(res);
        res.writeHead(200);
        res.end('OK');
        return;
    }
    serveStatic(req, res);
});
server.listen(PORT, HOST, () => {
    console.log(`Codex WebUI running at http://${HOST}:${PORT}`);
});
