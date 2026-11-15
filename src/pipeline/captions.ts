import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Beat, ReelConfig, Transcript } from './types.js';

/**
 * Build an ASS subtitle file for English captions from word-level timings.
 * Karaoke-style word highlight in the accent color.
 */
export function buildAssCaptions(
  transcript: Transcript, cfg: ReelConfig, beats: Beat[],
): string {
  const w = cfg.output.width;
  const h = cfg.output.height;
  const font = cfg.style.fontFamily;
  const fontSize = cfg.style.fontSize.caption;
  const primary = cfg.style.theme === 'dark' ? cfg.style.textInverse : cfg.style.textPrimary;
  const accent = cfg.style.accent;

  // Position: lower-third, centered, within safe zone
  const marginV = Math.round(h - cfg.style.captionPosition.y); // from bottom
  const marginLeft = Math.round(w * (1 - cfg.style.captionPosition.maxWidthPct / 100) / 2);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${font},${fontSize},${toAss(primary)},${toAss(accent)},${toAss('#000000')},${toAss('#80000000')},${cfg.style.fontWeights.caption >= 700 ? -1 : 0},0,0,0,100,100,0,0,1,3,1,2,${marginLeft},${marginLeft},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events: string[] = [];
  for (const seg of transcript.segments) {
    const start = toAssTime(seg.start);
    const end = toAssTime(seg.end);
    // Group words into caption lines of ~3 words with karaoke highlight
    const words = seg.words;
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3);
      if (!chunk.length) continue;
      const text = chunk.map((wd) => highlight(wd)).join(' ');
      events.push(`Dialogue: 0,${start},${end},Cap,,0,0,0,,${text}`);
    }
  }

  return `${header}\n${events.join('\n')}\n`;
}

function highlight(w: { word: string; start: number; end: number }): string {
  const word = w.word.replace(/\n/g, ' ').trim();
  // Wrap each word; active-word coloring is handled by \k karaoke timing in full impl.
  // For simplicity, emit plain text with a subtle karaoke \kf duration.
  const durCs = Math.max(1, Math.round((w.end - w.start) * 100));
  return `{\\kf${durCs}}${word}`;
}

/** Convert #RRGGBB to ASS &HBBGGRR. */
function toAss(hex: string): string {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

/** Seconds → H:MM:SS.cc */
function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${pad(m)}:${s.toFixed(2).padStart(5, '0')}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function saveAss(content: string, outDir: string): string {
  const p = resolve(outDir, 'captions.ass');
  writeFileSync(p, content, 'utf8');
  return p;
}