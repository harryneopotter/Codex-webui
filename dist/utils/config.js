import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_FILE = path.resolve(__dirname, '../../config.toml');
export function defaultConfig() {
    return {
        model: 'gpt-5',
        'tools.web_search_request': false,
        use_streamable_shell: true,
        sandbox_mode: 'danger-full-access',
        approval_policy: 'never',
        instructions_extra: ''
    };
}
export function getConfigSafe() {
    try {
        if (!fs.existsSync(CONFIG_FILE))
            return defaultConfig();
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        return parseToml(raw, defaultConfig());
    }
    catch {
        return defaultConfig();
    }
}
export function writeConfig(obj) {
    const cfg = Object.assign(defaultConfig(), obj || {});
    const toml = dumpToml(cfg);
    fs.writeFileSync(CONFIG_FILE, toml, 'utf8');
}
function parseToml(src, fallback) {
    const out = Object.assign({}, fallback || {});
    const lines = String(src || '').split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('['))
            continue;
        const idx = line.indexOf('=');
        if (idx < 0)
            continue;
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }
        else if (value === 'true' || value === 'false') {
            value = value === 'true';
        }
        else if (/^-?\d+(?:\.\d+)?$/.test(value)) {
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
        if (typeof v === 'string')
            parts.push(`${k} = "${v.replace(/"/g, '\\"')}"`);
        else if (typeof v === 'boolean')
            parts.push(`${k} = ${v ? 'true' : 'false'}`);
        else
            parts.push(`${k} = ${String(v)}`);
    });
    return parts.join('\n') + '\n';
}
