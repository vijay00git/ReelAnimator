import 'dotenv/config';
import { Command } from 'commander';
import { loadConfig, env, resolvePath } from './config.js';
import { makeJobId, ensureJob, loadState, markStep, stepDone, saveMeta, jobDir } from './output.js';
import { downloadVideo } from './sources/ytDlpSource.js';
import { generateScript, loadScriptFile, loadBilingualScript } from './sources/textSource.js';
import { transcribe, transcriptToScript, scriptToTranscript, saveTranscript } from './transcribe.js';
import { buildBeatsFromTranscript, translateBeatsToBeats, classifyRoutes } from './script.js';
import { synthesizeNarration } from './tts.js';
import { renderHypeScene } from './hypermotion.js';
import { matchLocalBroll } from './broll.js';
import { planSfxCues, renderSfxTrack } from './sfx.js';
import { buildAssCaptions, saveAss } from './captions.js';
import { composeBaseVideo } from './compose.js';
import { assembleReel } from './assemble.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Beat, Transcript, JobMeta, Lang } from './types.js';

const program = new Command();

program
  .name('reel')
  .description('ReelAnimator — English text + Tamil voice Instagram Reels pipeline')
  .version('0.1.0');

program
  .command('from-video')
  .description('Create a reel from a downloaded long-form video (yt-dlp)')
  .requiredOption('--url <url>', 'source video URL')
  .option('--lang <lang>', 'voice language', 'ta')
  .option('--keep-intermediate', 'keep intermediate files', true)
  .action(async (opts) => {
    const cfg = loadConfig();
    const jobId = makeJobId('video');
    const dir = ensureJob(jobId);
    const state = loadState(jobId);

    console.log(`[${jobId}] downloading…`);
    const { videoPath, audioPath } = await downloadVideo(opts.url, dir);
    markStep(state, 'download', 'done');

    console.log(`[${jobId}] transcribing…`);
    const transcript = await transcribe(audioPath, dir, cfg.whisper.model, cfg.whisper.language);
    saveTranscript(transcript, dir);
    markStep(state, 'transcribe', 'done');

    await buildAndRender(jobId, dir, state, transcript, {
      kind: 'video', url: opts.url, path: videoPath,
    }, opts.lang as Lang, cfg);
  });

program
  .command('from-text')
  .description('Create a reel from a topic or a script file')
  .option('--topic <topic>', 'topic to generate a script from')
  .option('--script-file <path>', 'path to a plain-text script (one beat per line)')
  .option('--bilingual', 'script file uses EN|TA per line; skips LLM translation')
  .option('--lang <lang>', 'voice language', 'ta')
  .action(async (opts) => {
    const cfg = loadConfig();
    if (!opts.topic && !opts.scriptFile) {
      console.error('Provide --topic or --script-file');
      process.exit(1);
    }
    const jobId = makeJobId('text');
    const dir = ensureJob(jobId);
    const state = loadState(jobId);

    let scriptText: string;
    let bilingual: Array<{ en: string; ta: string }> | null = null;
    let sourceMeta: JobMeta['source'];
    if (opts.scriptFile) {
      if (opts.bilingual) {
        bilingual = loadBilingualScript(resolvePath(opts.scriptFile));
        scriptText = bilingual.map((b) => b.en).join('\n');
      } else {
        scriptText = loadScriptFile(resolvePath(opts.scriptFile));
      }
      sourceMeta = { kind: 'text', path: resolvePath(opts.scriptFile) };
    } else {
      const r = await generateScript(opts.topic, dir);
      scriptText = readFileSync(r.scriptPath, 'utf8');
      sourceMeta = { kind: 'text', topic: opts.topic };
      markStep(state, 'generate', 'done');
    }

    const transcript = scriptToTranscript(scriptText);
    saveTranscript(transcript, dir);
    markStep(state, 'transcribe', 'done');

    await buildAndRender(jobId, dir, state, transcript, sourceMeta, opts.lang as Lang, cfg, bilingual);
  });

async function buildAndRender(
  jobId: string, dir: string, state: any, transcript: Transcript,
  source: JobMeta['source'], lang: Lang, cfg: ReturnType<typeof loadConfig>,
  bilingual: Array<{ en: string; ta: string }> | null = null,
): Promise<void> {
  console.log(`[${jobId}] planning beats…`);
  let beats: Beat[] = buildBeatsFromTranscript(transcript);
  beats = classifyRoutes(beats);
  if (bilingual) {
    // Use provided Tamil text (skip LLM translation)
    for (const b of beats) {
      const match = bilingual.find((x) => x.en === b.textEn) || bilingual[b.index];
      b.textTa = match?.ta || b.textEn;
    }
    console.log(`[${jobId}] using provided bilingual script (no LLM translation)`);
  } else {
    console.log(`[${jobId}] translating to Tamil via Kilo…`);
    beats = await translateBeatsToBeats(beats);
  }
  writeFileSync(resolve(dir, 'beats.json'), JSON.stringify({ beats }, null, 2), 'utf8');
  markStep(state, 'script', 'done');

  console.log(`[${jobId}] synthesizing Tamil narration (${cfg.tts.provider})…`);
  const tts = await synthesizeNarration(beats, dir, {
    provider: (cfg.tts as any).provider || 'sarvam',
    apiKey: env('SARVAM_API_KEY') || env('ELEVENLABS_API_KEY'),
    voiceIdTa: (cfg.tts as any).voiceIdTa || env('SARVAM_VOICE_ID_TA') || env('ELEVEN_VOICE_ID_TA'),
    voiceIdEn: (cfg.tts as any).voiceIdEn || env('SARVAM_VOICE_ID_EN') || env('ELEVEN_VOICE_ID_EN'),
    model: (cfg.tts as any).model || 'bulbul:v3',
    languageCode: (cfg.tts as any).languageCode || 'ta-IN',
    pace: (cfg.tts as any).pace ?? 1.0,
    stability: (cfg.tts as any).stability ?? 0.5,
    similarityBoost: (cfg.tts as any).similarityBoost ?? 0.75,
  });
  markStep(state, 'tts', 'done');

  if (cfg.hypermotion.enabled) {
    console.log(`[${jobId}] rendering hyper-motion scenes…`);
    for (const b of beats) {
      if (b.visual === 'motion' && !b.hypeScene) {
        await renderHypeScene(b, cfg, dir);
      }
    }
    markStep(state, 'hypermotion', 'done');
  }

  console.log(`[${jobId}] matching local b-roll…`);
  matchLocalBroll(beats, cfg);
  markStep(state, 'broll', 'done');

  console.log(`[${jobId}] building captions…`);
  const ass = buildAssCaptions(transcript, cfg, beats);
  saveAss(ass, dir);
  markStep(state, 'captions', 'done');

  console.log(`[${jobId}] rendering sound effects (earshot)…`);
  const cues = planSfxCues(beats, cfg);
  const sfxTrack = await renderSfxTrack(cues, tts.narrationPath, dir, cfg);
  markStep(state, 'sfx', 'done');

  console.log(`[${jobId}] composing base video (HyperFrames)…`);
  const basePath = await composeBaseVideo(beats, cfg, dir);
  markStep(state, 'compose', 'done');

  console.log(`[${jobId}] assembling final reel…`);
  const finalPath = resolve(dir, `reel_${lang}.mp4`);
  const bgmPath = resolvePath('assets/bgm/bed.mp3');
  const bgm = await import('node:fs').then((m) => m.existsSync(bgmPath) ? bgmPath : undefined);
  await assembleReel(basePath, sfxTrack, cfg, finalPath, bgm);
  markStep(state, 'assemble', 'done');

  const meta: JobMeta = {
    jobId,
    title: (source as any).topic || (source as any).url || 'reel',
    source,
    lang,
    beats,
    voice: cfg.tts.voiceIdTa,
    createdAt: new Date().toISOString(),
  };
  saveMeta(meta);

  console.log(`\n✅ Reel ready: ${finalPath}`);
}

/** Convert a plain-text script (one line per beat) into a synthetic transcript. */
// scriptToTranscript is imported from transcribe.ts

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});