import fs from 'fs';
import * as path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SessionEntry, History, Message } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HISTORY_FILE = path.resolve(__dirname, '../../history.json');
const SESS_ROOT = path.join(os.homedir(), '.codex', 'sessions');

export const isWithinSessions = (p: string): boolean => p ? path.resolve(p).startsWith(path.resolve(SESS_ROOT)) : false;

export function scanSessions(): SessionEntry[] {
  const root = SESS_ROOT;
  const out: SessionEntry[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { stack.push(full); continue; }
      if (/^rollout-.*\.jsonl$/.test(ent.name)) {
        let stat: fs.Stats | undefined;
        try { stat = fs.statSync(full); } catch { continue; }
        if (stat) out.push({ path: full, name: ent.name, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export function readHistory(): History {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch { return { entries: [] }; }
}

export function writeHistory(h: History): void {
  try { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2)); } catch {}
}

export function parseSessionMessages(filePath: string | null): Message[] {
  const out: Message[] = [];
  try {
    if (!filePath || !fs.existsSync(filePath)) return out;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const s = line.trim(); if (!s) continue;
      let obj; try { obj = JSON.parse(s); } catch { continue; }
      if (obj.type === 'message' && obj.role && obj.content && Array.isArray(obj.content)) {
        const text = obj.content.map((c: any) => c && c.text).filter(Boolean).join('\n');
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
