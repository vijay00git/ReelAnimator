import { kiloRun, extractJson } from './llm.js';
import type { Beat, Transcript, VisualKind } from './types.js';

const GLOSSARY = 'Keep brand names, product names, and technical terms in their original form when translating to Tamil.';

/**
 * Build the timed scene plan (beats) from a transcript.
 * Each whisper segment becomes a beat; we assign a default visual kind.
 */
export function buildBeatsFromTranscript(t: Transcript, targetMaxSec = 6): Beat[] {
  const beats: Beat[] = [];
  let idx = 0;
  for (const seg of t.segments) {
    // Split long segments into <= targetMaxSec beats
    let cur = { start: seg.start, end: seg.end, text: seg.text };
    if (cur.end - cur.start > targetMaxSec && seg.words.length) {
      let chunkStart = seg.start;
      let chunkText = '';
      for (const w of seg.words) {
        chunkText += (chunkText ? ' ' : '') + w.word;
        if (w.end - chunkStart >= targetMaxSec) {
          beats.push(makeBeat(idx++, chunkStart, w.end, chunkText.trim()));
          chunkStart = w.end;
          chunkText = '';
        }
      }
      if (chunkText.trim()) beats.push(makeBeat(idx++, chunkStart, cur.end, chunkText.trim()));
    } else {
      beats.push(makeBeat(idx++, cur.start, cur.end, cur.text));
    }
  }
  return beats;
}

function makeBeat(index: number, start: number, end: number, text: string): Beat {
  return {
    id: `beat_${index}`,
    index,
    start,
    end,
    textEn: text,
    textTa: '',
    visual: 'broll' as VisualKind,
  };
}

/**
 * Translate all beats' English text to Tamil via Kilo CLI (one batch call).
 * Mutates and returns the beats with textTa filled in.
 */
export async function translateBeatsToBeats(beats: Beat[]): Promise<Beat[]> {
  const payload = beats.map((b, i) => ({ i, en: b.textEn }));
  const prompt = [
    'Translate each English sentence to natural Tamil (ta).',
    GLOSSARY,
    'Return STRICT JSON only: an array of objects {"i": <number>, "ta": "<tamil text>"}.',
    'No markdown, no commentary.',
    '',
    JSON.stringify(payload),
  ].join('\n');

  const raw = await kiloRun(prompt);
  const arr = extractJson<Array<{ i: number; ta: string }>>(raw);

  const byIndex = new Map<number, string>();
  for (const item of arr) {
    if (typeof item?.i === 'number' && typeof item?.ta === 'string') {
      byIndex.set(item.i, item.ta);
    }
  }

  for (const b of beats) {
    b.textTa = byIndex.get(b.index) ?? b.textEn;
  }
  return beats;
}

/** Classify each beat's b-roll route heuristically (entity/receipts/concept). */
export function classifyRoutes(beats: Beat[]): Beat[] {
  for (const b of beats) {
    const t = b.textEn.toLowerCase();
    if (/(\b\d{4}\b|\bnews\b|\breport\b|\bstudy\b|\d+\s*%|\bpercent\b|\bresults?\b|\b\d+\s*(dollars|rupees|crore|lakh|million|billion)\b)/.test(t)) b.route = 'receipts';
    else if (/\b(company|ceo|founder|app|product|model|iphone|google|meta|ai)\b/.test(t)) b.route = 'entity';
    else b.route = 'concept';
    // Motion graphics for concept beats where no b-roll fits
    b.visual = b.route === 'concept' ? 'motion' : 'broll';
  }
  return beats;
}