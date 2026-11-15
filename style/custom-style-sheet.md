# ReelAnimator — Custom Style Sheet

Derived from objective signal analysis (ffmpeg) of the 4 reference reels in `Reference/`.
> Method: color histograms, signalstats (luma/saturation), scene-cut detection, audio volumedetect, band-layout sampling. Frames were analyzed numerically (this model has no image input), so typography and exact logo shapes are inferred from layout bands and require human confirmation (see "Needs human confirmation").

---

## 1. Reference set (measured facts)

| Ref file | Res | FPS | Duration | Scenes/min (thr 0.15) | Avg luma (0-255) | Avg saturation | Mean vol | Max vol |
|---|---|---|---|---|---|---|---|---|
| `snapgram.io_15vbkewwhcpq` | 720x1280 | 30 | 52.7s | ~14.8 | 131.2 (mid) | 7.9 (low) | -17.2 dB | -3.0 dB |
| `snapgram.io_4sibzwtv2lug` | 720x1280 | 24 | 71.1s | ~16.9 | 175.2 (bright) | 8.3 (low) | -16.2 dB | -2.7 dB |
| `snapgram.io_np3sdz325d80` | 720x1280 | 30 | 61.5s | ~27.3 | 180.6 (bright) | 5.3 (low) | -17.2 dB | -3.1 dB |
| `snapgram.io_zf9tujccucrv` | 720x1280 | 30 | 42.0s | ~37.1 (fast) | 57.0 (dark) | 9.4 (low) | -16.6 dB | -0.8 dB |

**Common format:** vertical 9:16, H.264 + AAC stereo 44.1kHz, 24–30 fps, 42–71s.

---

## 2. Color system

### 2.1 Dominant surfaces (histogram, top colors)
- **Three refs are light/white-dominant:** `#e0e0e0` (45–59%), `#f1efeb`/`#ede6cd`/`#e9e2d9` (warm off-white) — a clean white/cream background style.
- **One ref is dark-dominant:** `#000000` (66.8%) with warm dark browns `#201618`, `#4e4439`, `#100f10` — a dark cinematic style.
- Neutral grays `#c0c0c0`/`#a0a0a0` appear as secondary UI/text.

### 2.2 Brand accent — RED (the unifying element)
Strong saturated red appears in **all four** references. Measured accent reds:
- `#f03010`, `#f04030` (bright red, video `np3sdz…`)
- `#c01030`, `#b02030` (crimson-red, video `zf9tuj…`)
- `#e30000`, `#ea0000`, `#ce0000` (pure red, palette scans)

**Canonical accent red = `#E30000`** (primary), with a pressed/dark variant `#B00000` and a bright tint `#F03010`.

### 2.3 Style palette (recommended tokens)
```
/* Core */
--color-bg-light:   #F2F1EC;   /* warm off-white (dominant light bg) */
--color-bg-dark:    #141210;   /* near-black warm (dark style bg) */
--color-surface:    #E9E2D9;   /* cream surface / cards */
--color-text-primary:   #141210;   /* on light bg */
--color-text-inverse:   #F2F1EC;   /* on dark bg */
--color-text-muted:     #6B6B6B;
--color-border:         #D8D2C7;

/* Brand accent */
--color-accent:        #E30000;   /* primary red */
--color-accent-bright: #F03010;
--color-accent-dark:   #B00000;

/* Neutrals */
--color-gray-100: #E0E0E0;
--color-gray-400: #A0A0A0;
--color-gray-700: #606060;
--color-gray-900: #202020;
```

### 2.4 Color usage rules
- **Red is the only saturated accent.** Keep saturation low everywhere else (measured avg saturation 5–9 → desaturated, near-monochrome base + one red pop).
- **Two selectable background themes:** `light` (cream `#F2F1EC`) and `dark` (warm black `#141210`). Default = light; pick dark for cinematic/dramatic beats.
- Red used for: progress bar, key-word highlight, logo/bug, primary CTA, underline/stamp.

---

## 3. Typography (inferred — confirm)

> Cannot measure font files from pixels; inferred from clean flat captions and bold sans look.

- **Family:** geometric/grotesque **sans-serif** (e.g. Inter, Poppins, Montserrat, or SF Pro). One family, multiple weights.
- **Weights:** Bold/ExtraBold for headlines, Regular/Medium for body.
- **Scale (at 720x1280):**
  - Headline: 56–72px, weight 800
  - Subhead: 36–44px, weight 600–700
  - Caption/body: 30–36px, weight 500–600
  - Caption line-height: 1.2
- **Case:** sentence case for captions; ALL-CAPS for short punch words/labels.
- **Color:** text is near-black on light bg, near-white on dark bg; **key word in red** (`--color-accent`).
- **Alignment:** center or lower-center (see safe zones).

## 4. Caption / text-on-screen style
- **Word-by-word or 2–3 word phrase** karaoke captions (typical of these reels).
- **Highlight color on the active word** = red (`--color-accent`).
- **Stroke/shadow:** subtle dark drop shadow or 2px same-color stroke for legibility on busy b-roll.
- **Position:** lower-third, centered, within Instagram safe zone.

## 5. Safe zones (Instagram Reels UI, at 720x1280)
- **Top UI (handle/close):** avoid top **~120px**.
- **Bottom UI (caption/like/share):** avoid bottom **~250px**.
- **Right-side action rail:** avoid right **~120px**.
- **Effective content area:** `y: 120 → 1030`, `x: 40 → 600`. Captions sit in `y ≈ 880–1010` (lower-center, above the bottom UI).

## 6. Pacing / editing
- **Cut rate:** 15–37 cuts/min across refs. Target **~16–27 cuts/min** for standard reels; **~37/min** for the fast/dramatic style (`zf9tuj…`).
- **Shot length:** median ~2.2–4s; sub-second "stamp" cuts on beats.
- **Transitions:** mostly hard cuts; occasional fast whip/zoom. No slow fades in the fast style.
- **Hook:** dense, punchy first 3s (front-loaded cadence per b-roll-finder TASTE).

## 7. Audio / loudness
- **Mean volume:** -16 to -17 dB; **max:** -0.8 to -3.1 dB.
- **Target mastering:** normalize narration to **-14 LUFS** (Instagram/Spotify standard), true-peak **-1 dBTP**. Use ffmpeg `loudnorm=I=-14:TP=-1:LRA=11`.
- **No long silences** (0 regions > 0.5s @ -30dB) → continuous speech/music bed; keep a low-level music bed under narration (ducked via `sidechaincompress`).

## 8. Motion graphics (hyper-motion) style
- **Backgrounds:** flat cream or warm-black; no gradients except subtle vignette.
- **Accent shapes:** thin red rules underlines, red highlight blocks behind keywords, red progress bar at top.
- **Text motion:** typewriter / word-stagger with ease-out; settle fast.
- **Camera:** minimal 3D; occasional slow push-in (scale 1.0→1.05).
- **Stamps:** red "REC"-style dot or "★" badge for punchlines.

## 9. B-roll treatment
- **Full-bleed**, cover-crop (never letterboxed), audio stripped.
- **Grade:** slightly desaturated (saturation ~0.85) to match the low-sat palette; warm highlights.
- **Stills:** subtle Ken Burns (sub-pixel zoom) — never ffmpeg `zoompan`.
- **Credit label:** optional small bottom-right source credit (off/white/black/auto).

## 10. Output spec (matches references)
- **Resolution:** 1080x1920 (upscale from 720x1280 refs; refs are 720p — render at 1080x1920 for IG quality).
- **FPS:** 30 (dominant in refs).
- **Codec:** H.264 High, yuv420p, CRF 18–20, `+faststart`.
- **Audio:** AAC stereo 44.1kHz (or 48kHz), 192kbps, -14 LUFS.

---

## 11. Tailwind / CSS tokens (drop-in for Remotion)
```css
:root {
  --bg-light:#F2F1EC; --bg-dark:#141210; --surface:#E9E2D9;
  --text:#141210; --text-inverse:#F2F1EC; --text-muted:#6B6B6B; --border:#D8D2C7;
  --accent:#E30000; --accent-bright:#F03010; --accent-dark:#B00000;
  --gray-100:#E0E0E0; --gray-400:#A0A0A0; --gray-700:#606060; --gray-900:#202020;
}
```

## 12. Resolved style decisions (confirmed by user — accepted defaults)
1. **Font family:** **Inter** (geometric/grotesque sans; weights 500/600/700/800). Single family.
2. **Logo / brand mark:** **none** by default (no recurring logo bug). Add a text wordmark placeholder slot if needed later.
3. **Caption position & size:** **lower-third**, centered, `y ≈ 880–1010`, 30–36px, weight 600–700, active word in `--color-accent` red; subtle drop shadow.
4. **Default theme:** **light** (cream `#F2F1EC` background, near-black text). Dark theme (`#141210`) reserved for cinematic/dramatic beats, selectable per-beat.
5. **Music bed:** **neutral low-tempo bed** (lo-fi/ambient, ~70–90 BPM), ducked under narration at ≈ -18 dB relative to VO via `sidechaincompress`. No vocals.

> These are the canonical values; the pipeline reads them from `config/reel.config.json` (`style` block).