import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Transcript, Segment, Word } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Transcribe an audio file with openai-whisper (venv python).
 * Writes verbose JSON to <outDir>/transcript_raw.json and returns parsed segments.
 */
export async function transcribe(
  audioPath: string,
  outDir: string,
  model = 'small',
  language: string | null = null,
): Promise<Transcript> {
  const python = process.env.PYTHON_VENV ?? '.venv/bin/python';
  const outBase = resolve(outDir, 'transcript_raw');
  const outJson = `${outBase}.json`;

  const args = [
    '-m', 'whisper', audioPath,
    '--model', model,
    '--output_format', 'json',
    '--output_dir', outDir,
    '--word_timestamps', 'True',
    '--verbose', 'False',
  ];
  if (language) args.push('--language', language);

  // whisper writes to outDir/<audio_basename>.json
  await execFileAsync(python, args, { timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 });

  // Find the produced json (whisper names it after the input file basename)
  const produced = resolve(outDir, `${basename(audioPath)}.json`);
  const path = existsSync(produced) ? produced : outJson;
  if (!existsSync(path)) {
    throw new Error(`Whisper output not found (looked for ${produced} or ${outJson})`);
  }

  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return parseWhisper(raw);
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  const f = parts[parts.length - 1] ?? p;
  return f.replace(/\.[^.]+$/, '');
}

function parseWhisper(raw: any): Transcript {
  const segments: Segment[] = [];
  const words: Word[] = [];

  const segs = raw.segments ?? [];
  segs.forEach((s: any, i: number) => {
    const seg: Segment = {
      id: i,
      start: s.start,
      end: s.end,
      text: (s.text ?? '').trim(),
      words: (s.words ?? []).map((w: any) => ({
        word: (w.word ?? w.text ?? '').trim(),
        start: w.start,
        end: w.end,
      })),
    };
    segments.push(seg);
    words.push(...seg.words);
  });

  return {
    language: raw.language ?? 'en',
    duration: raw.duration ?? (segments.length ? segments[segments.length - 1].end : 0),
    segments,
    words,
  };
}

/** Convert a transcript into a timed English script (one beat per segment). */
export function transcriptToScript(t: Transcript): string {
  return t.segments.map((s) => s.text).join('\n');
}

/** Convert a plain-text script (one line per beat) into a synthetic transcript. */
export function scriptToTranscript(script: string): Transcript {
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
  let t = 0;
  const segments: Segment[] = lines.map((text, i) => {
    const wordList = text.split(/\s+/).filter(Boolean);
    const dur = Math.max(1.2, Math.min(6, wordList.length / 2.5));
    const start = t;
    const end = t + dur;
    t = end;
    const words: Word[] = wordList.map((w, j) => ({
      word: w,
      start: start + (dur * j) / Math.max(1, wordList.length),
      end: start + (dur * (j + 1)) / Math.max(1, wordList.length),
    }));
    return { id: i, start, end, text, words };
  });
  const allWords = segments.flatMap((s) => s.words);
  return { language: 'en', duration: t, segments, words: allWords };
}

/** Write a transcript JSON snapshot. */
export function saveTranscript(t: Transcript, outDir: string): string {
  const p = resolve(outDir, 'transcript.json');
  writeFileSync(p, JSON.stringify(t, null, 2), 'utf8');
  return p;
}