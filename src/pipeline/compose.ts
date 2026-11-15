import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Beat, ReelConfig } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Compose the base video using HyperFrames (HTML → MP4).
 * - Background: raw footage (full-bleed) per beat, OR solid color.
 * - Motion: GSAP animations on text (fade/slide/scale in) like reference reels.
 * - Captions: English + Tamil, lower-third, animated in.
 */
export async function composeBaseVideo(
  beats: Beat[], cfg: ReelConfig, outDir: string,
): Promise<string> {
  const hfDir = resolve(outDir, 'hyperframes');
  mkdirSync(hfDir, { recursive: true });

  const w = cfg.output.width;
  const h = cfg.output.height;
  const totalDur = beats.length ? beats[beats.length - 1].end : cfg.duration.targetSec;

  const assetsDir = resolve(hfDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  // Build clips + GSAP timeline
  const clips: string[] = [];
  const animLines: string[] = [];

  for (const b of beats) {
    const dur = Math.max(0.5, b.end - b.start).toFixed(2);
    const start = b.start.toFixed(2);
    const trackIdx = clips.length;
    const bg = cfg.style.theme === 'dark' ? cfg.style.bgDark : cfg.style.bgLight;
    const textColor = cfg.style.theme === 'dark' ? cfg.style.textInverse : cfg.style.textPrimary;

    let src: string | null = null;
    if (b.brollClip && existsSync(b.brollClip)) {
      const fname = `bg_${b.id}_${basename(b.brollClip)}`;
      src = `assets/${fname}`;
      copyFileSync(b.brollClip, resolve(assetsDir, fname));
    } else if (b.hypeScene && existsSync(b.hypeScene)) {
      const fname = `hype_${b.id}_${basename(b.hypeScene)}`;
      src = `assets/${fname}`;
      copyFileSync(b.hypeScene, resolve(assetsDir, fname));
    }

    if (src) {
      clips.push(`      <video class="clip bg" data-start="${start}" data-duration="${dur}" data-track-index="${trackIdx}" src="${src}" muted playsinline></video>`);
    } else {
      clips.push(`      <div class="clip bg" data-start="${start}" data-duration="${dur}" data-track-index="${trackIdx}" style="position:absolute;inset:0;background:${bg};"></div>`);
    }

    // Caption text block for this beat
    const capTrack = 1000 + b.index;
    const captionId = `cap_${b.index}`;
    const text = escapeHtml(b.textEn);
    const textTa = escapeHtml(b.textTa);
    clips.push(
      `      <div id="${captionId}" class="clip caption" data-start="${start}" data-duration="${dur}" data-track-index="${capTrack}" style="position:absolute;left:0;right:0;top:${cfg.style.captionPosition.y - 60}px;text-align:center;color:${textColor};font-family:${cfg.style.fontFamily},sans-serif;font-size:${cfg.style.fontSize.caption}px;font-weight:${cfg.style.fontWeights.caption};text-shadow:0 2px 6px rgba(0,0,0,0.6);opacity:0;"><div class="cap-en">${text}</div><div class="cap-ta" style="color:${cfg.style.accent};font-size:${cfg.style.fontSize.subhead}px;margin-top:6px;">${textTa}</div></div>`,
    );

    // GSAP animation: fade + slide up + scale on each beat's caption
    animLines.push(
      `    tl.fromTo("#${captionId}", {opacity:0, y:30, scale:0.95}, {opacity:1, y:0, scale:1, duration:0.4, ease:"power4.out"}, ${start});`,
    );

    // Animate the background (subtle Ken Burns zoom) if it's a video
    if (src) {
      const bgId = `bg_${b.index}`;
      // add id to the video element (retrofit)
      clips[clips.length - 1 - 1] = clips[clips.length - 1 - 1].replace(
        `<video class="clip bg"`,
        `<video id="${bgId}" class="clip bg"`,
      );
      animLines.push(
        `    tl.fromTo("#${bgId}", {scale:1.0}, {scale:1.08, duration:${dur}, ease:"none"}, ${start});`,
      );
    }
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${w}, height=${h}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${cfg.style.theme === 'dark' ? cfg.style.bgDark : cfg.style.bgLight};}
  #root{position:relative;width:${w}px;height:${h}px;}
  .clip{position:absolute;}
  video.clip{width:${w}px;height:${h}px;object-fit:cover;}
  .caption{pointer-events:none;}
</style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${totalDur.toFixed(2)}" data-width="${w}" data-height="${h}">
${clips.join('\n')}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${animLines.join('\n')}
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>
`;

  const indexPath = resolve(hfDir, 'index.html');
  writeFileSync(indexPath, html, 'utf8');

  const outPath = resolve(outDir, 'base.mp4');
  await execFileAsync('npx', [
    '--yes', 'hyperframes@0.9.46', 'render',
    '-o', outPath,
    '--fps', String(cfg.output.fps),
    '--quality', 'looks',
    hfDir,
  ], { timeout: 600_000, env: process.env });

  return outPath;
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}