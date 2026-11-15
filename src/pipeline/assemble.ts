import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ReelConfig } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Final assembly: mux base video + Tamil narration (loudness-normalized),
 * optional BGM ducked under VO, faststart. Returns the final reel path.
 */
export async function assembleReel(
  basePath: string, audioPath: string, cfg: ReelConfig, outPath: string,
  bgmPath?: string,
): Promise<string> {
  const w = cfg.output.width;
  const h = cfg.output.height;
  const { i, tp, lra } = cfg.output.loudnorm;

  // audioPath is the final audio track (narration, or SFX+narration mix if SFX applied).
  // bgmPath is an optional background music bed, ducked under the main audio.
  const args = ['-nostdin', '-y', '-i', basePath, '-i', audioPath];
  if (bgmPath) args.push('-i', bgmPath);

  let fc: string;
  let amap: string;
  if (bgmPath) {
    fc = [
      `[1:a]loudnorm=I=${i}:TP=${tp}:LRA=${lra}[main]`,
      `[2:a]volume=0.18[bg]`,
      `[main][bg]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[mix]`,
      `[mix]loudnorm=I=${i}:TP=${tp}:LRA=${lra}[aout]`,
    ].join(';');
    amap = '[aout]';
  } else {
    fc = `[1:a]loudnorm=I=${i}:TP=${tp}:LRA=${lra}[aout]`;
    amap = '[aout]';
  }
  args.push('-filter_complex', fc, '-map', '0:v:0', '-map', amap);

  args.push(
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', cfg.output.audioBitrate, '-ar', String(cfg.output.audioSampleRate),
    '-shortest', '-movflags', '+faststart',
    outPath,
  );

  await execFileAsync('ffmpeg', args, { timeout: 300_000 });
  return outPath;
}