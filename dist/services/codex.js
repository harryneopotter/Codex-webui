import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getConfigSafe } from '../utils/config.js';
import { readMemoryFacts, saveMemoryFactsFromText } from './memory.js';
import { readHistory, writeHistory } from '../utils/fs-helpers.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const WORKDIR = process.env.CODEX_WORKDIR ? path.resolve(process.env.CODEX_WORKDIR) : ROOT_DIR;
const CODEX_CMD = process.env.CODEX_CMD || 'codex';
export class CodexService extends EventEmitter {
    codexProc = null;
    sessionConfigured = false;
    messageBuffer = '';
    lastResumePath = null;
    constructor() {
        super();
    }
    getLastResumePath() {
        return this.lastResumePath;
    }
    isRunning() {
        return this.codexProc !== null;
    }
    async start(resumePath = null) {
        if (this.codexProc)
            return;
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
        // Resume logic
        let finalResumePath = resumePath;
        if (!finalResumePath) {
            // Try to find latest if allowed
            const resumeAllowed = !['0', 'false', 'no', 'off'].includes(String(process.env.CODEX_RESUME || '1').toLowerCase());
            if (resumeAllowed) {
                finalResumePath = this.findLatestRollout();
            }
        }
        if (finalResumePath) {
            args.push('-c', `experimental_resume=${finalResumePath}`);
            this.lastResumePath = finalResumePath;
            setTimeout(() => {
                this.emit('broadcast', 'system', { text: `Resuming from rollout: ${finalResumePath}` });
                this.emit('status_update');
            }, 500);
            this.recordResume(finalResumePath);
        }
        const spawnEnv = { ...process.env, TERM: 'dumb' };
        this.codexProc = spawn(CODEX_CMD, args, {
            cwd: WORKDIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: spawnEnv
        });
        if (this.codexProc.stdout) {
            this.codexProc.stdout.setEncoding('utf8');
            this.codexProc.stdout.on('data', (chunk) => this.handleStdout(chunk));
        }
        if (this.codexProc.stderr) {
            this.codexProc.stderr.setEncoding('utf8');
            this.codexProc.stderr.on('data', (d) => this.emit('broadcast', 'stderr', { text: d.toString() }));
        }
        this.codexProc.on('exit', (code) => {
            this.emit('broadcast', 'system', { text: `Codex exited with code ${code}` });
            this.codexProc = null;
            this.sessionConfigured = false;
        });
    }
    stop(cb) {
        if (!this.codexProc) {
            if (cb)
                cb();
            return;
        }
        try {
            this.codexProc.stdin?.write(JSON.stringify({ id: 'shutdown', op: { type: 'shutdown' } }) + '\n');
        }
        catch { }
        const proc = this.codexProc;
        this.codexProc = null;
        setTimeout(() => {
            try {
                proc.kill();
            }
            catch { }
            if (cb)
                cb();
        }, 500);
    }
    restart(resumePath, cb) {
        this.stop(() => {
            this.lastResumePath = resumePath;
            this.start(resumePath).then(cb);
        });
    }
    sendUserInput(text) {
        if (!this.codexProc)
            return;
        const facts = readMemoryFacts();
        let memoryBlock = '';
        if (facts.length) {
            memoryBlock = '\n\n<memory>\n' + facts.map(f => `- ${f}`).join('\n') + '\n</memory>\n';
        }
        const finalText = text + memoryBlock;
        const items = [{ type: 'text', text: finalText }];
        const id = `msg_${Date.now().toString(16)}`;
        const payload = { id, op: { type: 'user_input', items } };
        this.codexProc.stdin?.write(JSON.stringify(payload) + '\n');
    }
    handleStdout(chunk) {
        const lines = chunk.split(/\r?\n/);
        for (const raw of lines) {
            const line = raw.trim();
            if (!line)
                continue;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch {
                continue;
            }
            const msg = (event && event.msg) || {};
            const type = msg.type;
            if (type === 'session_configured') {
                this.sessionConfigured = true;
                const cfg2 = getConfigSafe();
                const ctl = { id: `ctl_${Date.now()}`, op: { type: 'override_turn_context', approval_policy: cfg2['approval_policy'] || 'never', sandbox_policy: { mode: cfg2['sandbox_mode'] || 'danger-full-access' } } };
                try {
                    this.codexProc?.stdin?.write(JSON.stringify(ctl) + '\n');
                }
                catch { }
                this.emit('broadcast', 'system', { text: 'Codex session configured' });
                if (this.lastResumePath)
                    this.recordResume(this.lastResumePath);
                this.emit('status_update');
            }
            if (type === 'agent_message_delta') {
                const delta = msg.delta || '';
                this.messageBuffer += delta;
                this.emit('broadcast', 'delta', { text: delta });
            }
            if (type === 'agent_message') {
                if (!this.messageBuffer) {
                    const m = msg.message;
                    if (m)
                        this.messageBuffer = m;
                }
                if (this.messageBuffer) {
                    saveMemoryFactsFromText(this.messageBuffer);
                    this.emit('status_update');
                    this.emit('broadcast', 'message', { text: this.messageBuffer });
                    this.messageBuffer = '';
                }
            }
            if (type === 'exec_command_begin') {
                this.emit('broadcast', 'tool', { name: 'Bash', detail: (msg.command || []).join(' ') });
            }
            if (type === 'patch_apply_begin') {
                this.emit('broadcast', 'tool', { name: 'Edit', detail: 'apply_patch' });
            }
            if (type === 'task_complete') {
                this.emit('broadcast', 'system', { text: 'Task complete' });
            }
            if (type === 'error') {
                this.emit('broadcast', 'error', { text: msg.message || 'Error' });
            }
        }
    }
    findLatestRollout() {
        try {
            const root = path.join(os.homedir(), '.codex', 'sessions');
            if (!fs.existsSync(root))
                return null;
            let latest = null;
            let latestMtime = 0;
            const stack = [root];
            while (stack.length) {
                const dir = stack.pop();
                if (!dir)
                    continue;
                let entries = [];
                try {
                    entries = fs.readdirSync(dir, { withFileTypes: true });
                }
                catch {
                    continue;
                }
                for (const ent of entries) {
                    const full = path.join(dir, ent.name);
                    if (ent.isDirectory()) {
                        stack.push(full);
                        continue;
                    }
                    if (/^rollout-.*\.jsonl$/.test(ent.name)) {
                        let stat;
                        try {
                            stat = fs.statSync(full);
                        }
                        catch {
                            continue;
                        }
                        if (stat && stat.mtimeMs > latestMtime) {
                            latestMtime = stat.mtimeMs;
                            latest = full;
                        }
                    }
                }
            }
            return latest;
        }
        catch {
            return null;
        }
    }
    recordResume(resumePath) {
        if (!resumePath)
            return;
        const h = readHistory();
        const ts = Date.now();
        h.entries = h.entries || [];
        h.entries = h.entries.filter(e => !(e.resume_path === resumePath && e.workdir === WORKDIR));
        h.entries.push({ resume_path: resumePath, workdir: WORKDIR, last_used: ts });
        writeHistory(h);
    }
}
export const codexService = new CodexService();
