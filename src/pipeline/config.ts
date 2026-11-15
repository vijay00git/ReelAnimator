import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReelConfig } from './types.js';

const CONFIG_PATH = resolve(process.cwd(), 'config/reel.config.json');

let cached: ReelConfig | null = null;

export function loadConfig(): ReelConfig {
  if (cached) return cached;
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}`);
  }
  cached = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as ReelConfig;
  return cached;
}

/** Read .env-style vars from process.env (dotenv loads .env at startup). */
export function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/** Resolve a path relative to the project root. */
export function resolvePath(p: string): string {
  return resolve(process.cwd(), p);
}