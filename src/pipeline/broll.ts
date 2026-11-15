import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Beat, ReelConfig } from './types.js';

const execFileAsync = promisify(execFile);

export interface PlacedBroll {
  index: number;
  sourcePath: string;
  inSec: number;
  outSec: number;
}

/**
 * Use the user's raw footage as the background for beats.
 * The raw footage is the primary visual; captions + motion overlays sit on top.
 * Falls back to yt-dlp sourcing only if no raw footage is available.
 */
export function matchLocalBroll(beats: Beat[], cfg: ReelConfig): PlacedBroll[] {
  const libDir = resolve(process.cwd(), cfg.broll.rawFootageDir);
  if (!existsSync(libDir)) return [];

  const files = listVideoFiles(libDir);
  if (files.length === 0) return [];

  const placed: PlacedBroll[] = [];
  // Use the first (longest) raw footage clip as the background for all beats.
  const bgClip = files[0] ?? null;

  for (const b of beats) {
    const dur = Math.max(0.5, b.end - b.start);
    if (bgClip) {
      placed.push({ index: b.index, sourcePath: bgClip, inSec: 0, outSec: Math.min(dur, 4) });
      b.brollClip = bgClip;
      b.visual = 'broll';
    }
  }
  return placed;
}

function listVideoFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /\.(mp4|mov|mkv|webm)$/i.test(f))
    .map((f) => join(dir, f));
}

/** Naive keyword match: prefer a clip whose filename contains a beat keyword. */
function pickClip(files: string[], text: string, needSec: number): string | null {
  if (files.length === 0) return null;
  const words = text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  for (const f of files) {
    const low = basename(f).toLowerCase();
    if (words.some((w) => low.includes(w))) return f;
  }
  // fallback: first clip that is long enough
  for (const f of files) {
    try {
      const d = statSync(f);
      if (d.size > 0) return f;
    } catch { /* ignore */ }
  }
  return files[0] ?? null;
}

/** Crop/scale a b-roll clip to fill the output frame (full-bleed, silent). */
export async function prepBrollClip(
  src: string, outPath: string, cfg: ReelConfig, inSec = 0, dur = 4,
): Promise<string> {
  const w = cfg.output.width;
  const h = cfg.output.height;
  const g = cfg.style.brollGrade;
  await execFileAsync('ffmpeg', [
    '-nostdin', '-y',
    '-ss', String(inSec), '-t', String(dur), '-i', src,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},eq=saturation=${g.saturation}:contrast=${g.contrast},hue=h=${Math.round(g.warmth * 30)}`,
    '-an', '-c:v', 'libx264', '-crf', '19', '-preset', 'veryfast',
    outPath,
  ], { timeout: 180_000 });
  return outPath;
}

/**
 * Build the b-roll-finder skill prompt for an agent to source missing beats.
 * Returns the prompt text; actual sourcing is done by the agent (skill).
 */
export function buildBrollPrompt(beats: Beat[], jobId: string): string {
  const missing = beats.filter((b) => b.visual === 'broll' && !b.brollClip);
  const lines = missing.map((b) => `[${b.index}] (${b.route ?? 'entity'}, ${b.end - b.start}s) "${b.textEn}"`);
  return [
    `Sourced b-roll for job ${jobId}. Local library: ${process.cwd()}/${process.env.BROLL_LIB ?? 'Raw Footage'}.`,
    'Classify each beat (Receipts/Entity/Concept/Meme), search local footage first, then yt-dlp for official sources.',
    'Return STRICT JSON array: [{"index":<n>,"sourcePath":"<path>","inSec":<n>,"outSec":<n>}]',
    '',
    lines.join('\n'),
  ].join('\n');
}