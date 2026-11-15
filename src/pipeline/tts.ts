import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Beat } from './types.js';

const execFileAsync = promisify(execFile);

export interface TtsResult {
  beatAudio: Array<{ index: number; path: string; durationSec: number }>;
  narrationPath: string;
  totalDuration: number;
}

export interface TtsConfig {
  provider: 'sarvam' | 'elevenlabs';
  /** Sarvam: API key (api-subscription-key). ElevenLabs: xi-api-key. */
  apiKey: string;
  /** Sarvam: speaker voice (e.g. vijay_ta_narration). ElevenLabs: voice_id. */
  voiceIdTa: string;
  voiceIdEn: string;
  /** Sarvam: bulbul:v3 / bulbul:v4-flash. ElevenLabs: eleven_multilingual_v2. */
  model: string;
  /** Sarvam: language_code (ta-IN). ElevenLabs: ignored. */
  languageCode?: string;
  /** Sarvam: pace 0.5-2.0. ElevenLabs: stability/similarity_boost. */
  pace?: number;
  stability?: number;
  similarityBoost?: number;
}

/**
 * Synthesize Tamil narration per beat, then concat into a single track.
 * Supports Sarvam AI (bulbul:v3, ta-IN) and ElevenLabs (eleven_multilingual_v2).
 */
export async function synthesizeNarration(
  beats: Beat[], outDir: string, cfg: TtsConfig,
): Promise<TtsResult> {
  const audioDir = resolve(outDir, 'tts');
  mkdirSync(audioDir, { recursive: true });

  const beatAudio: Array<{ index: number; path: string; durationSec: number }> = [];

  for (const b of beats) {
    const text = b.textTa || b.textEn;
    const ext = cfg.provider === 'sarvam' ? 'wav' : 'mp3';
    const path = resolve(audioDir, `${b.id}.${ext}`);
    await ttsToFile(text, path, cfg);
    const dur = await probeDuration(path);
    beatAudio.push({ index: b.index, path, durationSec: dur });
    b.end = b.start + dur;
  }

  const narrationPath = resolve(outDir, 'narration.m4a');
  const totalDuration = await concatAudio(beatAudio.map((x) => x.path), narrationPath);

  return { beatAudio, narrationPath, totalDuration };
}

async function ttsToFile(text: string, outPath: string, cfg: TtsConfig): Promise<void> {
  if (!cfg.apiKey) throw new Error(`${cfg.provider === 'sarvam' ? 'SARVAM_API_KEY' : 'ELEVENLABS_API_KEY'} is not set`);
  if (!cfg.voiceIdTa) throw new Error('TTS voice ID is not set');

  if (cfg.provider === 'sarvam') {
    await ttsSarvam(text, outPath, cfg);
  } else {
    await ttsElevenLabs(text, outPath, cfg);
  }
}

/** Sarvam AI TTS (bulbul:v3, ta-IN). Returns base64 audio, decoded to file. */
async function ttsSarvam(text: string, outPath: string, cfg: TtsConfig): Promise<void> {
  const body = {
    text,
    language_code: cfg.languageCode || 'ta-IN',
    speaker: cfg.voiceIdTa,
    model: cfg.model || 'bulbul:v3',
    pace: cfg.pace ?? 1.0,
    output_audio_codec: 'wav',
    speech_sample_rate: 22050,
  };

  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam TTS failed (${res.status}): ${err.slice(0, 400)}`);
  }

  const json = await res.json() as { audios?: string[] };
  const b64 = json.audios?.[0];
  if (!b64) throw new Error('Sarvam TTS returned no audio');

  writeFileSync(outPath, Buffer.from(b64, 'base64'));
}

/** ElevenLabs TTS (eleven_multilingual_v2). */
async function ttsElevenLabs(text: string, outPath: string, cfg: TtsConfig): Promise<void> {
  const body = {
    text,
    model_id: cfg.model || 'eleven_multilingual_v2',
    voice_settings: { stability: cfg.stability ?? 0.5, similarity_boost: cfg.similarityBoost ?? 0.75 },
  };

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voiceIdTa}`, {
    method: 'POST',
    headers: {
      'xi-api-key': cfg.apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err.slice(0, 400)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', path,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

/** Concatenate audio files into a single m4a via ffmpeg concat demuxer. */
async function concatAudio(paths: string[], outPath: string): Promise<number> {
  const listPath = resolve(outPath + '.txt');
  writeFileSync(listPath, paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  await execFileAsync('ffmpeg', [
    '-nostdin', '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:a', 'aac', '-b:a', '192k',
    outPath,
  ], { timeout: 120_000 });
  return probeDuration(outPath);
}