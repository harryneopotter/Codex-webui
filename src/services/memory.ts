import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const WORKDIR = process.env.CODEX_WORKDIR ? path.resolve(process.env.CODEX_WORKDIR) : ROOT_DIR;
const MEMORY_FILE = process.env.CODEX_MEMORY_FILE || path.join(WORKDIR, '.codex', 'memory.md');

export function ensureMemoryFile(): void {
  const dir = path.dirname(MEMORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, '# Codex Persistent Memory\n\n', 'utf8');
  }
}

export function readMemoryFacts(): string[] {
  try {
    ensureMemoryFile();
    const txt = fs.readFileSync(MEMORY_FILE, 'utf8');
    const facts = (txt.split(/\r?\n/) || []).filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^\-\s*/, '').trim());
    return facts;
  } catch {
    return [];
  }
}

export function saveMemoryFactsFromText(text: string): void {
  if (!text) return;
  ensureMemoryFile();
  const lines = text.split(/\r?\n/);
  let factsToAdd: string[] = [];
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

export function deleteMemoryFact(fact: string): void {
  ensureMemoryFile();
  try {
    const lines = fs.readFileSync(MEMORY_FILE, 'utf8').split(/\r?\n/);
    const needle = `- ${fact}`;
    const out = lines.filter(l => l.trim() !== needle.trim());
    fs.writeFileSync(MEMORY_FILE, out.join('\n'), 'utf8');
  } catch {}
}
