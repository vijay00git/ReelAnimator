import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export interface DownloadResult {
  videoPath: string;
  audioPath: string;
  infoPath: string;
}

/**
 * Download a video via yt-dlp (venv python) into <outDir>.
 * Produces the best mp4 video + a 16kHz mono wav audio for whisper.
 */
export async function downloadVideo(url: string, outDir: string): Promise<DownloadResult> {
  mkdirSync(outDir, { recursive: true });
  const python = process.env.PYTHON_VENV ?? '.venv/bin/python';

  const videoPath = resolve(outDir, 'source.mp4');
  const audioPath = resolve(outDir, 'source_audio.wav');
  const infoPath = resolve(outDir, 'source_info.json');

  await execFileAsync(python, [
    '-m', 'yt_dlp',
    '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4',
    '-o', videoPath,
    url,
  ], { timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });

  // Extract mono 16kHz wav for whisper
  await execFileAsync('ffmpeg', [
    '-nostdin', '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000',
    audioPath,
  ], { timeout: 300_000 });

  await execFileAsync(python, [
    '-m', 'yt_dlp',
    '--skip-download', '--write-info-json',
    '-o', resolve(outDir, 'source_info'),
    url,
  ], { timeout: 120_000 }).catch(() => {});

  return { videoPath, audioPath, infoPath };
}