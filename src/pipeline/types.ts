// Shared types for the ReelAnimator pipeline.

export type Lang = 'en' | 'ta';

export interface Word {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export type VisualKind = 'text' | 'broll' | 'motion';

export interface Beat {
  id: string;
  index: number;
  start: number; // timeline seconds (aligned to Tamil VO)
  end: number;
  textEn: string;
  textTa: string;
  visual: VisualKind;
  /** For broll beats: the route from b-roll-finder (Receipts/Entity/Concept/Meme). */
  route?: 'receipts' | 'entity' | 'concept' | 'meme';
  /** hyper-motion scene path if visual === 'motion'. */
  hypeScene?: string;
  /** Placed b-roll clip path if visual === 'broll'. */
  brollClip?: string;
  /** In-point (seconds) used when trimming the b-roll clip for this beat. */
  brollInSec?: number;
}

export interface Transcript {
  language: string;
  duration: number;
  segments: Segment[];
  words: Word[];
}

export interface JobState {
  jobId: string;
  createdAt: string;
  steps: Record<string, 'pending' | 'done' | 'error'>;
}

export interface ReelConfig {
  output: {
    width: number;
    height: number;
    fps: number;
    videoCodec: string;
    crf: number;
    audioCodec: string;
    audioBitrate: string;
    audioSampleRate: number;
    faststart: boolean;
    loudnorm: { i: number; tp: number; lra: number };
  };
  duration: { targetSec: number; minSec: number; maxSec: number };
  whisper: { model: string; language: string | null; wordTimestamps: boolean };
  tts: { provider?: string; model: string; languageCode?: string; voiceIdTa: string; voiceIdEn: string; pace?: number; stability: number; similarityBoost: number };
  style: {
    theme: 'light' | 'dark';
    accent: string;
    accentBright: string;
    accentDark: string;
    bgLight: string;
    bgDark: string;
    surface: string;
    textPrimary: string;
    textInverse: string;
    textMuted: string;
    border: string;
    fontFamily: string;
    fontWeights: { headline: number; subhead: number; caption: number };
    fontSize: { headline: number; subhead: number; caption: number };
    captionPosition: { x: string; y: number; maxWidthPct: number };
    safeZones: { topPx: number; bottomPx: number; rightPx: number };
    brollGrade: { saturation: number; contrast: number; warmth: number };
  };
  pacing: { cutsPerMin: number; shotMinSec: number; shotMaxSec: number };
  broll: { localLibraryFirst: boolean; rawFootageDir: string; autoPickFirst: boolean };
  hypermotion: { enabled: boolean; renderDir: string; quality: string };
}

export interface JobMeta {
  jobId: string;
  title: string;
  source: { kind: 'video' | 'text'; url?: string; path?: string; topic?: string };
  lang: Lang;
  beats: Beat[];
  voice: string;
  createdAt: string;
}