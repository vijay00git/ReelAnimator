import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Beat, ReelConfig } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Build a .hype scene JSON for a beat (text-on-screen motion graphic).
 * Uses the hyper-motion SceneJson shape (see cli/src/scene/build.ts).
 */
export function buildSceneJson(beat: Beat, cfg: ReelConfig): any {
  const w = cfg.output.width;
  const h = cfg.output.height;
  const accent = cfg.style.accent;
  const bg = cfg.style.theme === 'dark' ? cfg.style.bgDark : cfg.style.bgLight;
  const fg = cfg.style.theme === 'dark' ? cfg.style.textInverse : cfg.style.textPrimary;
  const font = cfg.style.fontFamily;

  const text = (beat.textEn || '').toUpperCase().slice(0, 60);

  return {
    meta: { name: beat.id, canvas: { width: w, height: h } },
    activeCameraId: 'camera',
    nodes: {
      root: {
        id: 'root', kind: 'frame', parent: null,
        children: ['bg', 'accent_bar', 'text', 'subtext'],
        size: { width: w, height: h },
        layout: { mode: 'flex', direction: 'column', justify: 'center', align: 'center', padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      },
      bg: {
        id: 'bg', kind: 'rect', parent: 'root',
        size: { width: w, height: h },
        fill: { color: bg },
      },
      accent_bar: {
        id: 'accent_bar', kind: 'rect', parent: 'root',
        size: { width: Math.round(w * 0.18), height: 10 },
        fill: { color: accent },
        layout: { marginTop: 40, marginBottom: 24 },
      },
      text: {
        id: 'text', kind: 'text', parent: 'root',
        text,
        style: {
          fontFamily: font, fontSize: cfg.style.fontSize.headline,
          fontWeight: cfg.style.fontWeights.headline,
          color: fg, textAlign: 'center', maxWidth: Math.round(w * 0.82),
        },
      },
      subtext: {
        id: 'subtext', kind: 'text', parent: 'root',
        text: beat.textTa || '',
        style: {
          fontFamily: font, fontSize: cfg.style.fontSize.subhead,
          fontWeight: cfg.style.fontWeights.subhead,
          color: accent, textAlign: 'center', maxWidth: Math.round(w * 0.82),
        },
        layout: { marginTop: 24 },
      },
      camera: {
        id: 'camera', kind: 'camera', parent: null,
        transform: { x: w / 2, y: h / 2, z: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      },
    },
    tracks: {
      text_in: {
        id: 'text_in',
        nodeId: 'text',
        propertyId: 'appearance.opacity',
        defaultEasing: 'ease-out',
        keyframes: [
          { id: 'kf0', time: 0, value: 0, easingOut: 'ease-out' },
          { id: 'kf1', time: 0.27, value: 1, easingOut: 'ease-out' },
        ],
      },
    },
  };
}

/**
 * Generate + render a .hype motion graphic for a beat. Returns the mp4 path.
 * No-op if hyper-motion is disabled.
 */
export async function renderHypeScene(
  beat: Beat, cfg: ReelConfig, outDir: string,
): Promise<string | null> {
  if (!cfg.hypermotion.enabled) return null;

  const sceneDir = resolve(outDir, cfg.hypermotion.renderDir);
  mkdirSync(sceneDir, { recursive: true });

  const jsonPath = resolve(sceneDir, `${beat.id}.scene.json`);
  const hypePath = resolve(sceneDir, `${beat.id}.hype`);
  const mp4Path = resolve(sceneDir, `${beat.id}.mp4`);

  writeFileSync(jsonPath, JSON.stringify(buildSceneJson(beat, cfg), null, 2), 'utf8');

  // create .hype
  await execFileAsync('hypermotion', ['create', hypePath, '--from', jsonPath], { timeout: 120_000 });

  // validate
  await execFileAsync('hypermotion', ['validate', hypePath], { timeout: 60_000 }).catch((e) => {
    throw new Error(`hypermotion validate failed for ${beat.id}: ${e.stderr || e.message}`);
  });

  // render (requires hyper-motion desktop app; skip gracefully if absent)
  const quality = cfg.hypermotion.quality === '1080p' ? 'comp' : cfg.hypermotion.quality;
  try {
    await execFileAsync('hypermotion', [
      'render', '--scene', hypePath, '-o', mp4Path, '-q', quality, '--fps', String(cfg.output.fps),
    ], { timeout: 600_000 });
    beat.hypeScene = mp4Path;
    return mp4Path;
  } catch (e: any) {
    // Desktop app not installed — fall back to solid background (handled by compose).
    if (String(e?.stderr || e?.message || '').includes('desktop app not found')) {
      console.warn(`[hypermotion] desktop app not installed; beat ${beat.id} will use solid background. Install from https://github.com/psiddharthdesign/hypermotion/releases to enable.`);
      return null;
    }
    throw e;
  }
}