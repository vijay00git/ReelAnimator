/**
 * Smoke test: end-to-end pipeline WITHOUT external API keys.
 * Uses a stub TTS (generates silence) and skips Kilo translation (English fallback).
 * Verifies compose + assemble produce a valid 1080x1920 mp4.
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/pipeline/config.js';
import { scriptToTranscript } from '../src/pipeline/transcribe.js';
import { buildBeatsFromTranscript, classifyRoutes } from '../src/pipeline/script.js';
import { composeBaseVideo } from '../src/pipeline/compose.js';
import { assembleReel } from '../src/pipeline/assemble.js';
import { buildAssCaptions, saveAss } from '../src/pipeline/captions.js';
import { makeJobId, ensureJob } from '../src/pipeline/output.js';

const execFileAsync = promisify(execFile);

async function main() {
  const cfg = loadConfig();
  const jobId = makeJobId('smoke');
  const dir = ensureJob(jobId);
  console.log(`[smoke] job dir: ${dir}`);

  // Stub script (no Kilo call)
  const script = 'Hello world this is a smoke test\nIt verifies the full pipeline\nWithout any API keys at all';
  const transcript = scriptToTranscript(script);

  // Stub translation: use English as Tamil placeholder
  const beats = classifyRoutes(buildBeatsFromTranscript(transcript));
  for (const b of beats) b.textTa = b.textEn;

  // Stub TTS: generate silence of total duration
  const totalDur = transcript.duration;
  const narration = resolve(dir, 'narration.m4a');
  await execFileAsync('ffmpeg', [
    '-nostdin', '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${totalDur}`,
    '-c:a', 'aac', '-b:a', '128k', narration,
  ], { timeout: 60_000 });
  console.log(`[smoke] stub narration: ${totalDur}s`);

  // Captions
  saveAss(buildAssCaptions(transcript, cfg, beats), dir);

  // Compose base video (solid bg + beats)
  const base = await composeBaseVideo(beats, cfg, dir);
  console.log(`[smoke] base video: ${base}`);

  // Assemble
  const final = resolve(dir, 'reel_ta.mp4');
  await assembleReel(base, narration, cfg, final);
  console.log(`[smoke] final: ${final}`);

  // Verify with ffprobe
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name', '-of', 'csv=p=0', final,
  ]);
  console.log(`[smoke] ffprobe: ${stdout.trim()}`);
  if (!stdout.includes(String(cfg.output.width)) || !stdout.includes(String(cfg.output.height))) {
    throw new Error('Resolution mismatch');
  }
  console.log('\n✅ SMOKE TEST PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });