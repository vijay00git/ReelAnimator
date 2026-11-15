# ReelAnimator — Implementation Plan

Build an automated pipeline that turns source material (a downloaded long-form video via `yt-dlp`, OR a text/topic) into Instagram Reels in **English text + Tamil voice**, using:

- **HyperFrames** (https://github.com/heygen-com/hyperframes) — HTML-native video composition (captions, overlays, lower-thirds) rendered to MP4. **Replaces Remotion** (was the original choice; switched to HyperFrames for HTML authoring + Apache 2.0 + agent-friendly). Requires Node 22+.
- **hyper-motion CLI** (`@psiddharthdesign/hypermotion`) — code-driven `.hype` motion-graphics scenes (animated titles, callouts, transitions) rendered to MP4 and composited as overlays.
- **earshot** (https://github.com/Leonxlnx/earshot) — sound design CLI: `sfx render` places whoosh/pop/impact/click on beat cuts (252-sound bank, no models/network for `sfx`). Plus **motion-graphics/sound-effects** skill (Barty-Bart, 110 CC0 SFX + librosa beat sync).
- **ffmpeg / ffprobe** — media probing, trimming, loudness normalization, format conversion, final mux.
- **Whisper** — transcription + word-level timestamps (drives caption timing).
- **ElevenLabs** — TTS narration, including Tamil voice.
- **LLM** — script generation AND English→Tamil translation (Tamil text is the source for the Tamil TTS).

## Decisions (confirmed with user — all resolved)
- **Renderer = HyperFrames** (HTML-native, replaces Remotion). HTML `index.html` with `data-start`/`data-duration`/`data-track-index` per beat.
- **Sound effects = earshot** (`sfx render` on beat cuts) + motion-graphics/sound-effects skill for interactive CC0 library.
- Motion-graphics layer = **hyper-motion CLI/MCP** (`.hype` scenes).
- Source = **both** workflows: (A) `yt-dlp` download → Whisper → clip; (B) text/topic → script → TTS → visuals.
- Languages = **English text (captions/on-screen) + Tamil voice (narration)**.
- Tamil translation = **LLM-based** via **Kilo Code** (the `kilo` CLI is already installed on this host; call it headless to generate/translate scripts).
- **ffmpeg install method**: user delegated to me → **static Linux x86_64 build from BtbN/FFmpeg-Builds** extracted to `~/.local` (no sudo). Source: https://ffmpeg.org/download.html (Linux Static Builds → BtbN).
- **Whisper engine**: **Python `openai-whisper`** (`pip install -U openai-whisper`). Confirmed working with the b-roll-finder skill which expects openai-whisper as the CPU fallback.
- **ElevenLabs voice**: use a **premade/default voice** (free tier). Tamil requires model **`eleven_multilingual_v2`** (supports `ta`). Free tier = 10k credits/mo (~10 min audio), **non-commercial only**, and the **Voice Library is NOT accessible via API on the free tier** — so the plan uses a default voice ID and documents the commercial-use caveat.
- **B-roll**: integrate **b-roll-finder** (https://github.com/louisedesadeleer/b-roll-finder) as an **agent skill** (clone + register `SKILL.md`). It is transcript-driven, routes each beat, and **you pick final clips** (it never auto-picks). The user will also supply **raw footage** — that becomes the **local b-roll library searched first**, before falling back to yt-dlp sourcing per the skill's routing model.

---

## 1. Environment prerequisites to install (host is currently missing these)

> STATUS: All installed and verified (see "Implementation status" at bottom).

Current host state (verified):
- Node **v18.19.1** → **upgraded to Node 22.23.5** via nvm (HyperFrames needs Node 22+).
- npm 9.2.0; **pnpm installed** via corepack (re-enable after `nvm use 22`).
- **ffmpeg/ffprobe installed** (static BtbN build → `~/.local/bin`).
- **uv installed** (`~/.local/bin/uv`) for earshot.
- **earshot installed** (uv tool; models ~1.1GB in `~/.cache/earshot/`).
- `yt-dlp` **2024.04.09** (present but old — will refresh)
- python3 3.12.3 present

### Tasks
- **Install ffmpeg (static, no sudo):** download the latest **linux64** build from [BtbN/FFmpeg-Builds releases](https://github.com/BtbN/FFmpeg-Builds/releases) (e.g. `ffmpeg-master-latest-linux64-gpl.tar.xz`), extract `ffmpeg` + `ffprobe` into `~/.local/bin`, `chmod +x`. `~/.local/bin` is already on PATH. Verify `ffmpeg -version` and `ffprobe -version`.
- **Install a Node 20+ runtime without sudo.** Install **nvm** (user-space) then `nvm install 20 && nvm alias default 20`. The orchestrator scripts and `package.json` engines assume Node 20.
- **Install pnpm** (user-space): `corepack enable && corepack prepare pnpm@latest --activate` (after Node 20 is active).
- **Install pip** (user-space): `python3 -m ensurepip --upgrade` (or `apt install python3-pip` if the user runs it).
- **Install Chrome for Remotion**: `npx remotion browser ensure` (downloads a Chrome Headless Shell into a cache dir; no sudo).
- **Refresh yt-dlp**: `python3 -m pip install -U yt-dlp` (or download the standalone binary to `~/.local/bin`).
- **Install ImageMagick** (`convert`/`montage` for b-roll contact sheets) — static or `apt`; if no sudo, fetch a static AppImage to `~/.local`.
- **Clone b-roll-finder**: `git clone https://github.com/louisedesadeleer/b-roll-finder /media/vijay/DATA/ReelAnimator/vendor/b-roll-finder` and register `vendor/b-roll-finder/SKILL.md` as an agent skill (pointer in `AGENTS.md`).

> Note: Because the user's `npm prefix` was just changed to `~/.local` in the prior task, global installs land in `~/.local`. The plan keeps all installs **user-space** so no root is required except ffmpeg.

## 2. Project scaffold (inside `/media/vijay/DATA/ReelAnimator`)

```
ReelAnimator/
  package.json            # workspace root (Node 20)
  pnpm-workspace.yaml     # if using pnpm workspaces
  .env.example            # ELEVENLABS_API_KEY (Kilo CLI used for LLM; no separate LLM key)
  .gitignore
  AGENTS.md               # run instructions + b-roll-finder skill registration
  config/
    reel.config.json      # fps, resolution (1080x1920), target duration, voice IDs, style block (see style/custom-style-sheet.md)
    voices.json           # ElevenLabs default voice IDs for EN + TA
  scenes/                 # hyper-motion .hype source scenes + per-render generated ones
  vendor/
    b-roll-finder/        # cloned skill repo (SKILL.md, TASTE.md, scripts/)
  style/
    custom-style-sheet.md # measured reference style (colors, type, pacing, safe zones) — canonical
  assets/
    raw_footage/          # user-supplied raw b-roll library (searched first) — maps to "Raw Footage/"
    fonts/                # Inter (Latin) + Noto Sans Tamil; download woff2/ttf
    bgm/                  # neutral lo-fi/ambient bed (~70-90 BPM), no vocals
  src/
    pipeline/
      index.ts            # orchestrator CLI entrypoint
      config.ts           # load/validate config
      types.ts            # shared types (Reel, Scene, Caption, Voice, Lang, Beat)
      llm.ts              # Kilo CLI wrapper (generate + translate, JSON extraction)
      sources/
        ytDlpSource.ts    # download + probe + clip long-form video
        textSource.ts     # text/topic → script
      transcribe.ts       # openai-whisper wrapper → segments + word timings
      translate.ts        # EN→TA translation via llm.ts
      tts.ts              # ElevenLabs wrapper (eleven_multilingual_v2) → mp3 + duration
      script.ts           # build timed script/scene plan from transcript
      hypermotion.ts      # generate + render .hype scenes via CLI
      broll.ts            # b-roll-finder skill driver + local-library-first matching
      captions.ts         # ASS/SRT generation (EN text) from word timings
      compose.ts          # Remotion render of base video + overlay compositing
      assemble.ts         # ffmpeg: concat, mix narration+BGM, burn captions, mux
      output.ts           # write final reel(s) + metadata
  remotion/
    remotion.config.ts
    src/
      index.ts            # registerRoot
      Root.tsx            # <Composition> defs
      compositions/
        BaseReel.tsx      # full-frame base canvas (bg video + captions + overlays)
        CaptionLayer.tsx  # EN caption rendering
        OverlayLayer.tsx  # plays rendered .hype scene MP4 as an overlay
    public/               # assets (bg clips, lfonts, hype renders)
  assets/
    fonts/                # Tamil + Latin fonts (e.g. Noto Sans Tamil)
    bgm/                  # optional background music
  out/                    # final reels + intermediate artifacts
```

### Tasks
- Init `package.json` with `"type": "module"`, Node `engines >=20`, scripts: `dev`, `build`, `reel` (run pipeline), `remotion:studio`, `remotion:render`.
- Add dependencies: `remotion`, `@remotion/cli`, `@remotion/bundler`, `@remotion/renderer`, `fluent-ffmpeg` (or shell out to ffmpeg), `zod` (config validation), `commander` or `yargs` (CLI), `dotenv`, `openai` (LLM), `@elevenlabs/elevenlabs-js` (or REST via fetch), `whisper.cpp`/`openai-whisper` is Python (see §3).
- Add hyper-motion as a **dev tool**: `pnpm add -g @psiddharthdesign/hypermotion` (global) — used via CLI, not imported.

## 3. Transcription (Whisper — Python)

Engine = **openai-whisper** (chosen; also what b-roll-finder expects). Produces segment + word timestamps.

- Install: `python3 -m pip install -U openai-whisper` (user-space). Model size from config (default `small` for CPU; `medium`/`large` if a GPU is present).

### Tasks
- `src/pipeline/transcribe.ts`: spawn `whisper` on the audio extracted by ffmpeg (`-vn -ac 1 -ar 16000`), parse the verbose JSON (`--output_format json --word_timestamps True`) → `Segment[]` with `{start, end, text, words[]}`.
- Normalize timestamps to the reel timeline (offset by clip start).
- Emit `out/<jobId>/transcript.json`.
- This transcript is also the input the b-roll-finder skill consumes (so b-roll is placed on the exact Tamil/EN spoken word).

## 4. Script + translation

- `src/pipeline/script.ts`: build a **scene plan** — split transcript into short caption/scene beats (<= N seconds each) with: beat text (EN), start/end, suggested visual (text overlay vs. b-roll vs. motion-graphic), and which beats need hyper-motion scenes.
- `src/pipeline/translate.ts`: **LLM = Kilo CLI.** Invoke `kilo` headless (e.g. `kilo run --print` / a non-interactive prompt mode) with a tight prompt + glossary (names, brand terms) to translate each EN beat → **Tamil (ta-IN)**. Parse strict JSON back matching the beat schema; validate with zod; retry on parse failure.
- For the **text-source** workflow, the Kilo CLI instead **generates** the EN script from the topic, then translates to TA.
- Kilo CLI wrapper (`src/pipeline/llm.ts`) isolates all subprocess calls, timeouts, retries, and JSON extraction so the provider is swappable.

## 5. Text-to-speech (ElevenLabs — free tier)

- `src/pipeline/tts.ts`: for each beat, call ElevenLabs `/v1/text-to-speech/{voice_id}`:
  - **Model**: `eleven_multilingual_v2` (supports Tamil `ta`). Required for the Tamil voice.
  - **Voice**: a **premade default voice ID** (free tier cannot access the Voice Library via API). Store chosen EN + TA default voice IDs in `config/voices.json`.
  - **Tamil narration** = primary voice track (user wants Tamil voice). English = captions/on-screen text (+ optional English VO).
- Save one mp3 per beat → measure exact duration with ffprobe → adjust beat timing so captions + hype scenes sync to the **Tamil** audio.
- Concatenate beat audio with ffmpeg (`concat` demuxer or `adelay`/`amix`), normalize loudness (`loudnorm` filter), output `narration.m4a`.
- **Free-tier caveats (documented in README)**: 10k credits/mo (~10 min audio), **non-commercial use only**, no Voice Library via API. The orchestrator must track cumulative character usage against the monthly cap and warn before exceeding. For commercial use, a Starter plan is required.

## 6. hyper-motion scenes

- `src/pipeline/hypermotion.ts`: for each beat flagged "motion", **generate a `.hype` scene** (JSON) programmatically (title, keyword highlight, transition) using the CLI/MCP schema; write to `scenes/<beatId>.hype`; render via `hypermotion render -o scenes/<beatId>.mp4` (1080x1920, target fps).
- Validation: run `hypermotion validate` on each scene before rendering; fail fast with a clear error.
- Rendered `.hype` MP4s become **transparent-capable overlays** composited by Remotion (or overlaid via ffmpeg `overlay` with alpha if the export supports it; otherwise place as a designed panel on the base canvas).

> Risk: hyper-motion is a research preview (v0.1.x) — CLI flags/schema may change. Plan isolates all CLI calls in one module so schema updates are localized.

## 7. B-roll (b-roll-finder skill + user's raw footage)

Integrate the **b-roll-finder** agent skill (cloned to `vendor/b-roll-finder`, registered in `AGENTS.md`). It is transcript-driven and **never auto-picks** — it proposes vetted candidates and the user picks.

- **Local library first**: the user's **raw footage** lives in `assets/raw_footage/` (or a configured path). Before any yt-dlp search, match beats against this local library (filename/tag metadata + a quick visual check). Only fall back to yt-dlp sourcing for beats not covered locally.
- **Flow** (matches the skill's loop):
  1. Hand the pipeline transcript (EN beats + word timings) to the skill.
  2. Skill classifies each beat (Receipts / Entity / Concept / Meme) and routes it.
  3. Skill returns a **scored contact sheet** of candidates (from local footage first, then yt-dlp).
  4. **User picks** → recorded in a **b-roll manifest** (`out/<jobId>/broll_manifest.json`) so approved beats survive re-renders.
  5. Picked clips are cut full-bleed + silent and **placed on the exact spoken word** (anchored to the Tamil VO timeline).
- **Implementation**: `src/pipeline/broll.ts` — builds the prompt/inputs for the skill, runs its scripts (yt-dlp, ffmpeg, ImageMagick), parses the manifest, and returns placed b-roll segments. Because the skill is agent-driven (you approve picks), the orchestrator supports an `--auto-pick-first` override for fully-automated runs, defaulting to interactive.
- Motion-graphics beats (Concept route) are produced by hyper-motion (§6); b-roll covers Entity/Receipts/Meme routes from footage.

## 8. Captions (English text)

- `src/pipeline/captions.ts`: from word-level timestamps, build styled **ASS** subtitles (word-by-word or phrase karaoke) in English. ASS supports precise styling + positioning (safe margins for Reels UI). Burn in via ffmpeg `subtitles`/`ass` filter during assembly (or render inside Remotion `CaptionLayer` for more control).
- Decide during implementation: **burn-in via ffmpeg** (simplest) vs **render in Remotion** (more design control). Default: render in Remotion for styling; fall back to ffmpeg burn-in if timing sync is simpler.

## 9. Composition + assembly

- `src/pipeline/compose.ts`: drive **Remotion** (`@remotion/bundler` + `@remotion/renderer`) to render `BaseReel` composition: background (clipped source video, **placed b-roll**, or solid/branded bg for text-source workflow) + `OverlayLayer` (the `.hype` MP4s) + `CaptionLayer` (EN captions) → `out/<jobId>/base.mp4` (1080x1920, target fps, no audio).
- `src/pipeline/assemble.ts`: ffmpeg final pass:
  - mux `base.mp4` video + `narration.m4a` (Tamil) [+ optional EN VO + BGM ducked via `sidechaincompress`].
  - `loudnorm` the mix; `-shortest`; H.264 + AAC; `+faststart`.
  - write final `out/<jobId>/reel_<lang>_<n>.mp4` and a `metadata.json` (title, beats, timings, voice, source, b-roll manifest).

## 10. Orchestrator CLI

- `src/pipeline/index.ts`: a `reel` command with subcommands/flags:
  - `reel from-video --url <yt-url> [--start --end --clip-duration] [--lang ta]`
  - `reel from-text --topic "..." | --script-file <file> [--lang ta]`
  - `reel broll --job <jobId>` (re-run b-roll sourcing/pick for an existing job)
  - shared: `--config`, `--out`, `--voice`, `--raw-footage <dir>`, `--auto-pick-first`, `--keep-intermediate`.
- Deterministic job dirs: `out/<jobId>/` (timestamp + slug). Idempotent re-runs skip completed steps via a `state.json` (download/transcribe/translate/tts/hype-render/broll/render/assemble checkpoints).

## 11. Validation / testing

- **Unit**: config schema (zod), caption timing math, beat-splitting, translation JSON schema validation (mock Kilo CLI).
- **Integration (smoke)**: `reel from-text` on a tiny 5-second test script with a stubbed TTS (local silent/placeholder audio) and `--auto-pick-first` → asserts a valid 1080x1920 mp4 is produced by ffprobe.
- **Manual E2E**: one real `from-video` (short clip) and one real `from-text`, verifying EN captions + Tamil VO + hype overlay + b-roll are present and synced.
- Provide `AGENTS.md` noting how to run lint/typecheck/tests and how to register the b-roll-finder skill.

---

## Task ordering (execution order)

1. **Env setup** (§1): ffmpeg static build, Node 20 (nvm), pnpm, pip, openai-whisper, ImageMagick, Chrome for Remotion, refresh yt-dlp, clone b-roll-finder.
2. **Scaffold** (§2): package.json, tsconfig, deps, `.env.example`, config files, folder structure incl. `assets/raw_footage/` + `vendor/b-roll-finder/`.
3. **Types + config + llm wrapper** (`src/pipeline/types.ts`, `config.ts`, `llm.ts`).
4. **Transcribe** (§3) + **script/translate** (§4) via Kilo CLI.
5. **TTS** (§5) — ElevenLabs `eleven_multilingual_v2`, default voice IDs, free-tier usage tracking.
6. **hyper-motion scenes** (§6) — behind a feature flag until validated.
7. **B-roll** (§7) — local-library-first matching + b-roll-finder skill integration.
8. **Captions** (§8).
9. **Compose (Remotion)** + **assemble (ffmpeg)** (§9).
10. **Orchestrator CLI** + checkpointing (§10).
11. **Tests + docs** (§11) incl. `AGENTS.md` with skill registration.

## Risks / open items
- **Node 20 switch** — `nvm` modifies shell rc; must `nvm use 20` before any remotion/hyper-motion command. The orchestrator scripts must assume Node 20.
- **hyper-motion preview maturity** — schema/CLI may break; isolated in one module (`hypermotion.ts`).
- **ElevenLabs free-tier limits** — 10k credits/mo (~10 min), **non-commercial only**, no Voice Library via API (must use a default/premade voice). Tamil needs `eleven_multilingual_v2`. Track usage; warn before exceeding. Commercial use ⇒ Starter plan.
- **Kilo CLI headless mode** — confirm exact non-interactive invocation (`kilo run`/prompt mode + output capture) during implementation; wrapper isolates this.
- **b-roll-finder is agent-driven** — it never auto-picks; the orchestrator supports `--auto-pick-first` for automation but defaults to interactive approval. Its skill scripts assume `yt-dlp`, `ffmpeg`, ImageMagick, openai-whisper (all installed in §1).
- **Reels UI safe zones** — captions/overlays must respect Instagram's top/bottom UI; encode safe margins in config.

## Reused utilities (existing in env)
- `yt-dlp` (refresh to latest).
- `python3` 3.12 (for openai-whisper).
- `kilo` CLI (already installed) — used as the LLM for script generation + EN→TA translation, and to assist with code generation during implementation.

## Resolved decisions (no longer open)
1. **ffmpeg**: static Linux x86_64 build (BtbN) → `~/.local` (no sudo).
2. **Whisper**: openai-whisper (Python).
3. **LLM**: Kilo CLI (`kilo` headless).
4. **ElevenLabs**: `eleven_multilingual_v2` + default/premade voice IDs (free tier).
5. **B-roll**: b-roll-finder skill + user's raw footage as the local-first library.
6. **Renderer**: **HyperFrames** (HTML-native, replaces Remotion). Node 22+.
7. **Sound effects**: **earshot** (`sfx render` on beat cuts) + motion-graphics/sound-effects skill (CC0 library + librosa).

---

## Implementation status (DONE)

### Environment (all verified)
- Node **22.23.5** (nvm), pnpm **12.18.0** (corepack)
- ffmpeg/ffprobe static (BtbN) → `~/.local/bin`
- openai-whisper **20250625** + yt-dlp **2026.10.26** (in `.venv`)
- **uv 0.13.8** + **earshot** (uv tool, 252-sound bank; models ~1.1GB fetching)
- hyper-motion CLI **0.1.2** (built from source) → `~/.local/bin`
- **HyperFrames** project at `hyperframes-proj/` (v0.9.46, via `npx`)
- ImageMagick **7.1.2**, Chrome for Remotion, b-roll-finder + motion-graphics skills cloned

### Pipeline (`src/pipeline/`, 17 files)
- `llm.ts` — Kilo CLI wrapper (script gen + EN→TA translation)
- `transcribe.ts` — Whisper wrapper (segments + word timestamps)
- `script.ts` — beat planning, translation, route classification
- `tts.ts` — ElevenLabs (`eleven_multilingual_v2`) per-beat Tamil VO + concat
- `hypermotion.ts` — `.hype` scene generation + render
- `broll.ts` — local-footage-first matching (b-roll-finder)
- `captions.ts` — ASS karaoke captions (English)
- **`compose.ts` — HyperFrames HTML→MP4** (replaces Remotion BaseReel)
- **`sfx.ts` — earshot SFX on beat cuts** (whoosh/pop/impact/click)
- `assemble.ts` — ffmpeg mux/loudnorm (accepts SFX track)
- `index.ts` — CLI orchestrator (`from-video` / `from-text`)

### Verification
- `pnpm typecheck` → OK
- `pnpm test` → **6/6 pass**
- Smoke test (no API keys, stub TTS) → valid **1080×1920 H.264 + AAC** reel produced via HyperFrames
- earshot `sfx render ui_pop/soft` → clean pop WAV verified