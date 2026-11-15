import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kiloRun } from '../llm.js';

export interface TextSourceResult {
  scriptPath: string;
  topic: string;
}

/**
 * Generate an English script from a topic (or use a provided script file).
 * Returns a path to a plain-text script (one sentence/beat per line).
 */
export async function generateScript(topic: string, outDir: string): Promise<TextSourceResult> {
  const prompt = [
    'You are a scriptwriter for short-form vertical video (Instagram Reels).',
    'Write a punchy 30-45 second script on the topic below.',
    'Rules:',
    '- Plain sentences, one per line, no numbering, no headings, no emojis.',
    '- Strong hook in the first line.',
    '- 6-10 short lines total, each line <= 12 words.',
    '- Return ONLY the script text.',
    '',
    `Topic: ${topic}`,
  ].join('\n');

  const raw = await kiloRun(prompt);
  const script = raw.trim();

  const scriptPath = resolve(outDir, 'script.txt');
  writeFileSync(scriptPath, script, 'utf8');
  return { scriptPath, topic };
}

/** Load a provided script file (one beat per line). */
export function loadScriptFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Load a bilingual script file (EN|TA per line). Returns {en, ta} lines. */
export function loadBilingualScript(path: string): Array<{ en: string; ta: string }> {
  const text = readFileSync(path, 'utf8');
  return text.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf('|');
      if (idx === -1) return { en: l, ta: l };
      return { en: l.slice(0, idx).trim(), ta: l.slice(idx + 1).trim() };
    });
}