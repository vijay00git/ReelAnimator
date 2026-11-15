# ReelAnimator

Automated Instagram Reels pipeline: **English text (captions) + Tamil voice (narration)**.

`yt-dlp / text` → `openai-whisper transcribe` → `script + Kilo CLI translate (EN→TA)` → `ElevenLabs Tamil TTS` → `hyper-motion .hype scenes + b-roll (local raw footage first)` → **HyperFrames compose (HTML→MP4)** → **earshot SFX on beats** → `ffmpeg mux/mix` → final 1080×1920 reel.

## Prerequisites (already installed on this host)
- **Node 22** via nvm (`~/.nvm`). Activate: `nvm use 22`. (HyperFrames needs Node 22+.)
- **ffmpeg/ffprobe** static at `~/.local/bin` (on PATH).
- **pnpm** via corepack (re-enable after `nvm use 22`: `corepack enable`).
- **Python venv** at `.venv` (openai-whisper + yt-dlp). Activate: `. .venv/bin/activate`.
- **uv** at `~/.local/bin/uv` (for earshot).
- **earshot** (sound design CLI) — `earshot sfx render` / `earshot kit`. Models ~1.1GB in `~/.cache/earshot/`.
- **hyper-motion CLI** at `~/.local/bin/hypermotion` (built from source).
- **HyperFrames** via `npx hyperframes@0.9.46` (project at `hyperframes-proj/`).
- **ImageMagick** at `~/.local/bin/magick`.
- **b-roll-finder** skill at `vendor/b-roll-finder`.
- **motion-graphics/sound-effects** skill at `vendor/motion-graphics/skills/sound-effects/` (110 CC0 SFX + librosa beat sync).

## Setup
```bash
nvm use 22
corepack enable && corepack prepare pnpm@latest --activate
pnpm install
cp .env.example .env   # fill ELEVENLABS_API_KEY and voice IDs
```

## Usage
```bash
# From a long-form video
pnpm reel from-video --url "<youtube-url>" --lang ta

# From a topic (Kilo CLI generates EN script, translates to Tamil)
pnpm reel from-text --topic "The future of AI agents" --lang ta

# From a provided script file (one beat per line)
pnpm reel from-text --script-file ./script.txt --lang ta
```

Output lands in `out/<jobId>/reel_ta.mp4` with `metadata.json` + `beats.json`.

## Renderers
- **HyperFrames** (default): HTML-native, `index.html` with `data-start`/`data-duration`/`data-track-index` per beat. Rendered via `npx hyperframes render`.
- **hyper-motion** (optional): `.hype` scenes for motion-graphic beats, overlaid.
- **ffmpeg** (always): final compose/mux/loudnorm.

## Audio
- **ElevenLabs** Tamil TTS (`eleven_multilingual_v2`, premade voice). Free tier: ~10 min/mo, non-commercial.
- **earshot** SFX: `earshot sfx render` places whoosh/pop/impact/click on beat cuts (252-sound bank, no models/network for `sfx`).
- **motion-graphics sound-effects** skill: 110 CC0 sounds + librosa beat sync (interactive/agent-driven).
- Mix to **-14 LUFS** (Instagram standard), true-peak -1 dBTP.

## Style
Canonical style tokens live in `style/custom-style-sheet.md` (derived from `Reference/` reels) and mirrored into `config/reel.config.json` (`style` block).

## Testing
```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # node --test (tsx)
```

## Agent skills (register with your agent)
- `vendor/b-roll-finder/SKILL.md` — b-roll sourcing (transcript-driven, you pick).
- `vendor/motion-graphics/skills/sound-effects/SKILL.md` — sound effects pass (CC0 library + librosa).
- `hyperframes-proj/AGENTS.md` — HyperFrames authoring patterns.