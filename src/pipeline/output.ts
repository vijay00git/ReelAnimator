import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JobState, JobMeta } from './types.js';

export function makeJobId(slug: string): string {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const clean = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'job';
  return `${ts}_${clean}`;
}

export function jobDir(jobId: string): string {
  return resolve(process.cwd(), 'out', jobId);
}

export function ensureJob(jobId: string): string {
  const d = jobDir(jobId);
  mkdirSync(d, { recursive: true });
  return d;
}

const STATE_FILE = 'state.json';

export function loadState(jobId: string): JobState {
  const p = resolve(jobDir(jobId), STATE_FILE);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  const s: JobState = { jobId, createdAt: new Date().toISOString(), steps: {} };
  saveState(s);
  return s;
}

export function saveState(s: JobState): void {
  const p = resolve(jobDir(s.jobId), STATE_FILE);
  mkdirSync(resolve(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2), 'utf8');
}

export function stepDone(state: JobState, step: string): boolean {
  return state.steps[step] === 'done';
}

export function markStep(state: JobState, step: string, status: 'done' | 'error'): void {
  state.steps[step] = status;
  saveState(state);
}

export function saveMeta(meta: JobMeta): void {
  const p = resolve(jobDir(meta.jobId), 'metadata.json');
  writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8');
}