import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Beat, ReelConfig } from './types.js';

const execFileAsync = promisify(execFile);

export interface SfxCue {
  id: string;
  timeSec: number;
  kind: 'whoosh' | 'pop' | 'impact' | 'click' | 'riser';
  gain: number;
}

/**
 * Plan SFX cues on beat cuts. Each beat transition gets a cue whose kind
 * depends on the beat's visual/route (entity→whoosh, concept→pop, motion→impact).
 */
export function planSfxCues(beats: Beat[], cfg: ReelConfig): SfxCue[] {
  const cues: SfxCue[] = [];
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const isCut = i > 0;
    const time = isCut ? b.start : 0.05;
    let kind: SfxCue['kind'];
    if (b.visual === 'motion') kind = 'impact';
    else if (b.route === 'receipts') kind = 'whoosh';
    else if (b.route === 'entity') kind = 'click';
    else kind = 'pop';
    cues.push({ id: `sfx_${i}`, timeSec: Math.max(0, time), kind, gain: 0.6 });
  }
  return cues;
}

/**
 * Render SFX wavs via earshot's `sfx render` (252-sound bank, no models/network),
 * then mix them onto the narration track at the planned cue times.
 * Returns the mixed SFX+narration track path.
 */
export async function renderSfxTrack(
  cues: SfxCue[], narrationPath: string, outDir: string, cfg: ReelConfig,
): Promise<string> {
  const sfxDir = resolve(outDir, 'sfx');
  mkdirSync(sfxDir, { recursive: true });

  const rendered: Array<{ path: string; timeSec: number; gain: number }> = [];
  for (const cue of cues) {
    const outWav = resolve(sfxDir, `${cue.id}.wav`);
    try {
      // earshot sfx render <bank-id> -o <out> --dur <s> --apex <s>
      // Pick a bank sound by kind. Use stable ids from the 252-sound bank.
      const bankId = pickBankId(cue.kind);
      await execFileAsync('earshot', [
        'sfx', 'render', bankId,
        '-o', outWav,
        '--dur', '0.4',
      ], { timeout: 60_000, env: process.env });
      rendered.push({ path: outWav, timeSec: cue.timeSec, gain: cue.gain });
    } catch {
      // If earshot fails (models not ready), skip this cue — non-fatal.
    }
  }

  if (rendered.length === 0) return narrationPath;

  // Mix: narration + each SFX delayed to its cue time, then loudnorm
  const args = ['-nostdin', '-y', '-i', narrationPath];
  const filterParts: string[] = [];
  const mixInputs: string[] = ['[0:a]'];

  rendered.forEach((r, i) => {
    const ms = Math.round(r.timeSec * 1000);
    args.push('-i', r.path);
    filterParts.push(`[${i + 1}:a]volume=${r.gain},adelay=${ms}|${ms}[s${i}]`);
    mixInputs.push(`[s${i}]`);
  });

  const filter = [
    ...filterParts,
    `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[mix]`,
    `[mix]loudnorm=I=${cfg.output.loudnorm.i}:TP=${cfg.output.loudnorm.tp}:LRA=${cfg.output.loudnorm.lra}[aout]`,
  ].join(';');

  const outPath = resolve(outDir, 'sfx_mix.m4a');
  args.push('-filter_complex', filter, '-map', '[aout]', '-c:a', 'aac', '-b:a', cfg.output.audioBitrate, outPath);

  await execFileAsync('ffmpeg', args, { timeout: 120_000 });
  return outPath;
}

function pickBankId(kind: SfxCue['kind']): string {
  // Stable ids from earshot's bank (verified via `earshot sfx list`)
  switch (kind) {
    case 'whoosh': return 'whoosh_fast/crisp';
    case 'impact': return 'cut_hit/punch';
    case 'click': return 'click/soft';
    case 'riser': return 'riser/build';
    case 'pop':
    default: return 'ui_pop/soft';
  }
}

/**
 * Build the earshot sound-effects skill prompt (Barty-Bart motion-graphics).
 * The skill provides 110 CC0 sounds (whoosh/pop/impact/typing/etc.) + librosa beat sync.
 */
export function buildEarshotSkillPrompt(jobId: string, cues: SfxCue[]): string {
  return [
    `Add sound effects to reel ${jobId}.`,
    'Use the motion-graphics sound-effects skill (vendor/motion-graphics/skills/sound-effects/SKILL.md).',
    `Cues (time → kind): ${cues.map((c) => `${c.timeSec.toFixed(2)}s=${c.kind}`).join(', ')}`,
    'Mix to -16 LUFS, true peaks < -4 dBFS. Write report.html + CREDITS.txt.',
  ].join('\n');
}