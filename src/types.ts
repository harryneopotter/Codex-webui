export interface Config {
  model: string;
  'tools.web_search_request': boolean;
  use_streamable_shell: boolean;
  sandbox_mode: string;
  approval_policy: string;
  instructions_extra: string;
  [key: string]: string | boolean | number;
}

export interface SessionEntry {
  path: string;
  name: string;
  mtimeMs: number;
  size: number;
}

export interface HistoryEntry {
  resume_path: string;
  workdir: string;
  last_used: number;
}

export interface History {
  entries: HistoryEntry[];
}

export interface Message {
  role: string;
  text: string;
}

export interface ResumeMeta {
  name: string;
  mtimeMs: number;
  size: number;
}
