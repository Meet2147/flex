#!/usr/bin/env node
// Turn a built portfolio into a short reel: every app's captured clip, one after another, cut to music.
//
//   node reel.mjs portfolio/portfolio.json                     → portfolio/reel.mp4 + reel.jpg (1920×1080)
//   node reel.mjs portfolio/portfolio.json --format vertical   → 1080×1920, for Reels, Shorts and TikTok
//   node reel.mjs portfolio/portfolio.json --format square     → 1080×1080
//
// The reel is 120 bpm and every cut lands on a beat. Every frame is a pure function of time, drawn in a
// headless browser and captured one by one, so the result is the same on every run.

import { readFile, writeFile, mkdir, rm, access, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { format: { type: 'string', default: 'landscape' }, out: { type: 'string' }, 'no-music': { type: 'boolean', default: false }, keep: { type: 'boolean', default: false } },
});
const SIZES = { landscape: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] };
if (!positionals[0] || !SIZES[args.format]) {
  console.error('usage: reel.mjs <portfolio.json> [--format landscape|vertical|square] [--out reel.mp4] [--no-music] [--keep]');
  process.exit(1);
}

const FPS = 30, BEAT = 0.5, MAX_APPS = 8;
const [W, H] = SIZES[args.format];
const dataFile = path.resolve(positionals[0]);
const siteDir = path.dirname(dataFile);
const outFile = path.resolve(args.out ?? path.join(siteDir, args.format === 'landscape' ? 'reel.mp4' : `reel-${args.format}.mp4`));
const work = path.join(siteDir, '.reel-work');
const data = JSON.parse(await readFile(dataFile, 'utf8'));
const owner = data.owner ?? {};
const exists = (file) => access(file).then(() => true, () => false);

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${stderr.slice(-1200)}`))));
  });
}

// --- what goes in ----------------------------------------------------------

const apps = [];
for (const app of data.apps ?? []) {
  const media = app.media ?? {};
  const pick = async (file) => (file && !/^https?:/.test(file) && (await exists(path.join(siteDir, file))) ? path.join(siteDir, file) : null);
  const clip = await pick(media.clip);
  const still = (await pick(media.desktop)) ?? (await pick(media.shots?.[0])) ?? (await pick(media.mobile));
  if (clip || still) apps.push({ slug: app.slug, name: app.name, tagline: app.tagline ?? '', accent: /^#[0-9a-f]{6}$/i.test(app.accent ?? '') ? app.accent : '#ff5a1f', clip, still, tall: !clip && !(await pick(media.desktop)) });
  if (apps.length === MAX_APPS) break;
}
if (!apps.length) {
  console.error('No captured media found next to portfolio.json. Run capture and build first.');
  process.exit(1);
}

// Fewer apps get longer on screen; the whole reel stays between about 12 and 22 seconds.
const INTRO = 2.0, OUTRO = 3.0;
const SEG = apps.length <= 3 ? 3.5 : apps.length <= 5 ? 3.0 : apps.length <= 6 ? 2.5 : 2.0;
const DURATION = INTRO + SEG * apps.length + OUTRO;

await rm(work, { recursive: true, force: true });
await mkdir(path.join(work, 'frames'), { recursive: true });
for (const app of apps) {
  const dir = path.join(work, app.slug);
  await mkdir(dir, { recursive: true });
  if (app.clip) {
    // Skip the first moments of each clip, which are usually the page settling.
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', '0.7', '-i', app.clip, '-t', String(SEG), '-vf', 'fps=30,scale=1280:800', '-q:v', '3', path.join(dir, 'f%03d.jpg')]);
    app.frames = Math.round(SEG * FPS);
  } else {
    await copyFile(app.still, path.join(dir, 'still.jpg'));
  }
}

// --- the composition -------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const emphasis = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const accent = /^#[0-9a-f]{6}$/i.test(data.theme?.accent ?? '') ? data.theme.accent : '#ff5a1f';
const ink = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b0b0b' : '#ffffff';
};
const host = (() => { try { return new URL(owner.site).host.replace(/^www\./, ''); } catch { return owner.handle ?? ''; } })();
const u = Math.min(W, H) / 1080; // one unit of type size, so the three formats share a layout
const wide = args.format === 'landscape';

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
  html, body { width: ${W}px; height: ${H}px; margin: 0; overflow: hidden; background: #fff; color: #0b0b0b; font-family: "Bricolage Grotesque", system-ui, sans-serif; }
  .scene { position: absolute; inset: 0; display: none; overflow: hidden; }
  .mono { font: 700 ${(wide ? 44 : 34) * u}px "JetBrains Mono", ui-monospace, monospace; }
  .centre { position: absolute; left: ${90 * u}px; right: ${90 * u}px; top: 50%; text-align: ${wide ? 'left' : 'center'}; }
  h1 { margin: ${26 * u}px 0; font-weight: 800; font-size: ${(wide ? 196 : 118) * u}px; line-height: 0.93; letter-spacing: -0.04em; text-wrap: balance; }
  h1 em { font-style: normal; display: inline-block; padding: 0 0.14em; border-radius: 0.14em; background: ${accent}; color: ${ink(accent)}; transform: rotate(-1.5deg); }
  .pill { display: inline-block; padding: ${14 * u}px ${30 * u}px; border: ${4 * u}px solid #0b0b0b; border-radius: 99px; background: #fff; color: #0b0b0b; }
  .app .text { position: absolute; ${wide ? `left: ${90 * u}px; top: 50%; width: ${700 * u}px;` : `left: ${70 * u}px; right: ${70 * u}px; ${args.format === 'vertical' ? `top: ${1120 * u}px` : `bottom: ${70 * u}px`}; text-align: center;`} }
  .app h2 { margin: ${14 * u}px 0 0; font-weight: 800; font-size: ${(wide ? 150 : 104) * u}px; line-height: 0.94; letter-spacing: -0.04em; overflow-wrap: anywhere; }
  .app p { margin: ${20 * u}px 0 0; font: 600 ${(wide ? 54 : 40) * u}px/1.2 "Bricolage Grotesque", system-ui, sans-serif; text-wrap: balance; }
  .frame { position: absolute; ${wide ? `left: ${860 * u}px; top: 50%; width: ${970 * u}px;` : `left: ${60 * u}px; right: ${60 * u}px; top: ${(args.format === 'vertical' ? 330 : 80) * u}px;`} border: ${5 * u}px solid #0b0b0b; border-radius: ${24 * u}px; overflow: hidden; background: #fff; box-shadow: ${16 * u}px ${16 * u}px 0 #0b0b0b; }
  .frame .bar { display: flex; gap: ${10 * u}px; padding: ${14 * u}px ${18 * u}px; border-bottom: ${5 * u}px solid #0b0b0b; background: #fff; }
  .frame .bar i { width: ${16 * u}px; height: ${16 * u}px; border-radius: 50%; background: #0b0b0b; }
  .frame img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; }
  .frame.tall { ${wide ? `left: ${1120 * u}px; width: ${400 * u}px;` : `left: 50%; right: auto; width: ${(args.format === 'vertical' ? 520 : 330) * u}px; margin-left: ${(args.format === 'vertical' ? -260 : -165) * u}px;`} }
  .frame.tall img { aspect-ratio: 9 / 19; }
  .frame.tall .bar { display: none; }
</style></head>
<body>
<section class="scene" id="intro"><div class="centre" id="introc">
  <span class="mono pill">${esc(owner.name ?? 'Portfolio')}</span>
  <h1>${emphasis(owner.headline ?? `Things ${String(owner.name ?? '').split(' ')[0]} has *shipped*.`)}</h1>
  <span class="mono">${apps.length === (data.apps ?? []).length ? apps.length : (data.apps ?? []).length} ${(data.apps ?? []).length === 1 ? 'app' : 'apps'} shipped</span>
</div></section>
${apps.map((app, i) => `<section class="scene app" id="a${i}" style="background: color-mix(in oklab, ${app.accent} 22%, #fff)">
  <div class="text"><span class="mono pill">${String(i + 1).padStart(2, '0')}</span><h2>${esc(app.name)}</h2>${app.tagline ? `<p>${esc(app.tagline)}</p>` : ''}</div>
  <div class="frame${app.tall ? ' tall' : ''}"><div class="bar"><i></i><i></i><i></i></div><img id="img${i}" src="${app.slug}/${app.frames ? 'f001.jpg' : 'still.jpg'}" alt=""></div>
</section>`).join('\n')}
<section class="scene" id="outro" style="background:${accent};color:${ink(accent)}"><div class="centre" id="outroc" style="text-align:center">
  <h1 style="font-size:${(wide ? 170 : 126) * u}px">${esc(String(owner.cta ?? 'now go look.').replace(/\*/g, ''))}</h1>
  ${host ? `<span class="mono pill" id="hostpill" style="font-size:${54 * u}px;box-shadow:${8 * u}px ${8 * u}px 0 #0b0b0b">${esc(host)}</span>` : ''}
</div></section>
<script>
const APPS = ${JSON.stringify(apps.map((a) => ({ slug: a.slug, frames: a.frames ?? 0 })))};
const INTRO = ${INTRO}, SEG = ${SEG}, TOTAL = ${DURATION}, WIDE = ${wide};
const $ = (id) => document.getElementById(id);
const clamp = (x) => Math.max(0, Math.min(1, x));
const out = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mid = WIDE ? 'translateY(-50%)' : '';
window.renderAt = async (t) => {
  const index = Math.floor((t - INTRO) / SEG);
  $('intro').style.display = t < INTRO ? 'block' : 'none';
  $('outro').style.display = t >= TOTAL - ${OUTRO} ? 'block' : 'none';
  APPS.forEach((_, i) => ($('a' + i).style.display = t >= INTRO && i === index && t < TOTAL - ${OUTRO} ? 'block' : 'none'));
  if (t < INTRO) {
    const p = out(t / 0.4);
    $('introc').style.opacity = p;
    $('introc').style.transform = 'translateY(calc(-50% + ' + (1 - p) * 60 + 'px))';
  } else if (t < TOTAL - ${OUTRO}) {
    const local = t - INTRO - index * SEG, app = APPS[index], scene = $('a' + index);
    const text = scene.querySelector('.text'), frame = scene.querySelector('.frame');
    const p = out(local / 0.3);
    text.style.opacity = p;
    text.style.transform = mid + ' translateY(' + (1 - p) * 50 + 'px)';
    const pop = 0.82 + 0.18 * back(local / 0.36), drift = 1 + 0.025 * (local / SEG);
    frame.style.transform = mid + ' scale(' + pop * drift + ') rotate(' + (index % 2 ? 1 : -1) + 'deg)';
    if (app.frames) {
      const src = app.slug + '/f' + String(Math.max(1, Math.min(app.frames, Math.floor(local * 30) + 1))).padStart(3, '0') + '.jpg';
      const img = $('img' + index);
      if (!img.src.endsWith(src)) { img.src = src; await img.decode().catch(() => {}); }
    }
  } else {
    const local = t - (TOTAL - ${OUTRO}), p = out(local / 0.4);
    $('outroc').style.opacity = p;
    $('outroc').style.transform = 'translateY(calc(-50% + ' + (1 - p) * 60 + 'px))';
    const pill = $('hostpill');
    if (pill) { const q = (local - 0.7) / 0.34; pill.style.opacity = q <= 0 ? 0 : 1; pill.style.transform = 'scale(' + (0.6 + 0.4 * back(q)) + ')'; }
  }
};
window.ready = Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode().catch(() => {}))]);
</script></body></html>`;
await writeFile(path.join(work, 'reel.html'), html);

// --- the soundtrack: a small synth, so the reel needs no audio files -------

function soundtrack() {
  const SR = 44100, N = Math.round(SR * DURATION), L = new Float32Array(N), R = new Float32Array(N);
  let seed = 7;
  const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648) - 1;
  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const add = (at, length, gain, fn, pan = 0) => {
    const start = Math.round(at * SR), n = Math.round(length * SR);
    for (let i = 0; i < n && start + i < N; i++) {
      if (start + i < 0) continue;
      const v = fn(i / SR) * gain;
      L[start + i] += v * (1 - pan * 0.5); R[start + i] += v * (1 + pan * 0.5);
    }
  };
  const kick = (at, g = 0.9) => add(at, 0.3, g, (t) => Math.sin(2 * Math.PI * (48 * t + 3.9 * (1 - Math.exp(-t * 34)))) * Math.exp(-t / 0.11));
  const hat = (at, g = 0.1) => { let prev = 0; add(at, 0.05, g, (t) => { const x = noise(), y = x - prev; prev = x; return y * Math.exp(-t / 0.014); }, 0.4); };
  const pluck = (at, midi, length, g, pan = 0) => { const f = hz(midi); add(at, length, g, (t) => (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)) * Math.min(1, t / 0.004) * Math.exp(-t / (length / 3.2)), pan); };
  const bass = (at, midi, g = 0.42) => { const f = hz(midi); add(at, 0.24, g, (t) => Math.sin(2 * Math.PI * f * t) * Math.min(1, t / 0.005) * Math.exp(-t / 0.11)); };
  const whoosh = (at) => { let low = 0; add(at, 0.4, 0.1, (t) => { low += (noise() - low) * (0.05 + 0.5 * (t / 0.4)); return low * (t / 0.4) ** 2; }); };

  const CHORDS = [[48, [60, 64, 67]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [59, 62, 67]]]; // C  Am  F  G
  const end = DURATION - OUTRO;
  pluck(0.05, 60, 0.9, 0.3); pluck(0.05, 67, 0.9, 0.22); kick(0.05, 0.6); pluck(1.0, 72, 0.8, 0.18);
  whoosh(INTRO - 0.4);
  for (let t = INTRO, step = 0; t < end - 1e-6; t += BEAT, step++) {
    const [root, tones] = CHORDS[Math.floor((t - INTRO) / 2) % 4];
    kick(t); hat(t + 0.25);
    bass(t, root - 12); bass(t + 0.25, root, 0.3);
    for (let k = 0; k < 4; k++) pluck(t + k * 0.125, tones[(step * 4 + k) % 3] + ((step + k) % 4 === 2 ? 12 : 0), 0.3, 0.085, k % 2 ? 0.5 : -0.5);
  }
  // One rising note as each app arrives, and a whoosh into each cut.
  const scale = [72, 74, 76, 79, 81, 84, 86, 88];
  apps.forEach((_, i) => { pluck(INTRO + i * SEG, scale[i % scale.length], 0.6, 0.2); if (i) whoosh(INTRO + i * SEG - 0.4); });
  whoosh(end - 0.4); kick(end, 1);
  for (const note of [36, 48, 60, 64, 67, 72]) pluck(end, note, OUTRO, 0.17);
  pluck(end + 0.7, 84, 1.6, 0.16); kick(end + 0.7, 0.5);

  const pcm = Buffer.alloc(44 + N * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
  const fadeFrom = N - Math.round(1.0 * SR);
  for (let i = 0; i < N; i++) {
    const fade = i > fadeFrom ? ((N - i) / (N - fadeFrom)) ** 1.5 : 1;
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * 1.1) * 0.84 * fade * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * 1.1) * 0.84 * fade * 32767), 46 + i * 4);
  }
  return pcm;
}

// --- render ----------------------------------------------------------------

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed. Run npm install in the scripts folder.');
  process.exit(2);
}
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(work, 'reel.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => window.ready);
const total = Math.round(DURATION * FPS);
for (let f = 0; f < total; f++) {
  await page.evaluate((t) => window.renderAt(t), f / FPS);
  await page.screenshot({ path: path.join(work, 'frames', `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
}
await browser.close();

// The poster is the settled intro. It also replaces frame 0, so every platform shows it as the thumbnail.
const poster = outFile.replace(/\.mp4$/, '.jpg');
await copyFile(path.join(work, 'frames', `${String(Math.round(1.5 * FPS)).padStart(4, '0')}.jpg`), poster);
await copyFile(poster, path.join(work, 'frames', '0000.jpg'));

const inputs = ['-framerate', String(FPS), '-i', path.join(work, 'frames', '%04d.jpg')];
if (!args['no-music']) {
  await writeFile(path.join(work, 'music.wav'), soundtrack());
  inputs.push('-i', path.join(work, 'music.wav'));
}
await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  ...(args['no-music'] ? ['-an'] : ['-c:a', 'aac', '-b:a', '192k', '-shortest']), '-movflags', '+faststart', outFile]);
if (!args.keep) await rm(work, { recursive: true, force: true });
console.log(JSON.stringify({ reel: outFile, poster, format: args.format, seconds: DURATION, apps: apps.length, music: !args['no-music'] }, null, 2));
