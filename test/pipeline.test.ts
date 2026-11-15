import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, extractFinalText } from '../src/pipeline/llm.js';
import { scriptToTranscript } from '../src/pipeline/transcribe.js';
import { buildBeatsFromTranscript, classifyRoutes } from '../src/pipeline/script.js';
import { buildAssCaptions } from '../src/pipeline/captions.js';
import { loadConfig } from '../src/pipeline/config.js';

test('extractJson parses fenced JSON', () => {
  const raw = '```json\n[{"i":0,"ta":"வணக்கம்"}]\n```';
  const out = extractJson(raw);
  assert.deepEqual(out, [{ i: 0, ta: 'வணக்கம்' }]);
});

test('extractJson parses bare array', () => {
  const out = extractJson('prefix [1,2,3] suffix');
  assert.deepEqual(out, [1, 2, 3]);
});

test('extractFinalText falls back to raw', () => {
  const out = extractFinalText('plain text');
  assert.equal(out, 'plain text');
});

test('scriptToTranscript produces timed segments', () => {
  const t = scriptToTranscript('Line one here\nLine two here');
  assert.equal(t.segments.length, 2);
  assert.ok(t.duration > 0);
  assert.ok(t.segments[0].end <= t.segments[1].start + 0.001);
});

test('buildBeats + classifyRoutes', () => {
  const t = scriptToTranscript('OpenAI released GPT-6 today\nIt costs 20 dollars');
  const beats = buildBeatsFromTranscript(t);
  classifyRoutes(beats);
  assert.ok(beats.length >= 2);
  assert.ok(beats.some((b) => b.route === 'receipts')); // "20 dollars" / digits
});

test('buildAssCaptions produces valid ASS header', () => {
  const cfg = loadConfig();
  const t = scriptToTranscript('Hello world this is a test');
  const beats = buildBeatsFromTranscript(t);
  const ass = buildAssCaptions(t, cfg, beats);
  assert.ok(ass.includes('[Script Info]'));
  assert.ok(ass.includes('[Events]'));
  assert.ok(ass.includes('Dialogue:'));
});