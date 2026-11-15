import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LlmOptions {
  /** Model in provider/model form; empty = kilo default. */
  model?: string;
  /** Working directory. */
  cwd?: string;
  /** Timeout in ms. */
  timeoutMs?: number;
}

/**
 * Run the Kilo CLI headless and return the model's final text output.
 * Uses `kilo run --format json` and extracts the last text event.
 */
export async function kiloRun(prompt: string, opts: LlmOptions = {}): Promise<string> {
  const args = ['run', '--format', 'json'];
  // Default to a free model to avoid credit exhaustion.
  const model = opts.model || process.env.KILO_MODEL || 'kilo/kilo-auto/free';
  args.push('--model', model);
  args.push(prompt);

  const { stdout } = await execFileAsync('kilo', args, {
    cwd: opts.cwd ?? process.cwd(),
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });

  return extractFinalText(stdout);
}

/**
 * Parse the JSON-event stream from `kilo run --format json` and return the
 * concatenated assistant text. Falls back to raw stdout if parsing fails.
 */
export function extractFinalText(stdout: string): string {
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  const texts: string[] = [];

  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      // Kilo/opencode event shapes vary; collect any text-ish fields.
      if (evt?.type === 'text' && typeof evt.text === 'string') {
        texts.push(evt.text);
      } else if (evt?.part?.type === 'text' && typeof evt.part.text === 'string') {
        texts.push(evt.part.text);
      } else if (evt?.message?.role === 'assistant' && typeof evt.message.content === 'string') {
        texts.push(evt.message.content);
      } else if (evt?.text && typeof evt.text === 'string' && evt?.role !== 'user') {
        texts.push(evt.text);
      }
    } catch {
      // not JSON — ignore
    }
  }

  const joined = texts.join('\n').trim();
  return joined.length > 0 ? joined : stdout.trim();
}

/**
 * Extract the first balanced JSON value (object or array) from a string that
 * may be wrapped in markdown fences or prose.
 */
export function extractJson<T = unknown>(raw: string): T {
  const cleaned = stripFences(raw);
  const start = findJsonStart(cleaned);
  if (start === -1) throw new Error(`No JSON found in LLM output:\n${raw.slice(0, 500)}`);
  const json = sliceBalanced(cleaned, start);
  if (!json) throw new Error(`Unbalanced JSON in LLM output:\n${cleaned.slice(start, start + 500)}`);
  return JSON.parse(json) as T;
}

function stripFences(s: string): string {
  return s.replace(/```[a-zA-Z0-9]*\n?/g, '').trim();
}

function findJsonStart(s: string): number {
  const obj = s.indexOf('{');
  const arr = s.indexOf('[');
  if (obj === -1) return arr;
  if (arr === -1) return obj;
  return Math.min(obj, arr);
}

function sliceBalanced(s: string, start: number): string | null {
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}