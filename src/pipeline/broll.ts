import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
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
 * The newest clip in the library wins (so a fresh upload beats a tracked
 * default), and each beat gets a different in-point so the reel does not
 * repeat the same frames.
 */
export async function matchLocalBroll(
  beats: Beat[], cfg: ReelConfig, outDir: string,
): Promise<PlacedBroll[]> {
  const libDir = resolve(process.cwd(), cfg.broll.rawFootageDir);
  if (!existsSync(libDir)) return [];

  const files = listVideoFiles(libDir);
  if (files.length === 0) return [];

  const srcClip = pickNewest(files);
  const clipDur = probeDuration(srcClip);
  const trimDir = resolve(outDir, 'broll');
  mkdirSync(trimDir, { recursive: true });

  const placed: PlacedBroll[] = [];

  for (const b of beats) {
    const dur = Math.max(0.5, b.end - b.start);
    // Spread in-points across the source clip so each beat shows a new moment.
    const span = Math.max(0.1, clipDur - dur);
    const inSec = clipDur > dur ? (b.index * 1.9) % span : 0;

    const out = resolve(trimDir, `${b.id}.mp4`);
    try {
      await prepBrollClip(srcClip, out, cfg, inSec, dur);
    } catch (e: any) {
      // ffmpeg failed — fall back to the untrimmed source.
      console.warn(`[broll] trim failed for ${b.id}: ${e?.stderr || e?.message}; using full clip.`);
      b.brollClip = srcClip;
      b.brollInSec = 0;
      b.visual = 'broll';
      placed.push({ index: b.index, sourcePath: srcClip, inSec: 0, outSec: dur });
      continue;
    }

    b.brollClip = out;
    b.brollInSec = inSec;
    b.visual = 'broll';
    placed.push({ index: b.index, sourcePath: out, inSec, outSec: dur });
  }

  return placed;
}

/** Newest video file by mtime — a fresh upload beats a tracked default. */
function pickNewest(files: string[]): string {
  let best = files[0]!;
  let bestT = -1;
  for (const f of files) {
    try {
      const t = statSync(f).mtimeMs;
      if (t > bestT) { bestT = t; best = f; }
    } catch { /* ignore */ }
  }
  return best;
}

/** Duration in seconds via ffprobe; 0 when unknown. */
function probeDuration(p: string): number {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', p,
    ], { encoding: 'utf8', timeout: 30_000 });
    return parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
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