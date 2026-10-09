#!/usr/bin/env node
// Capture one app (or a batch) as portfolio media: desktop.jpg, mobile.jpg, clip.mp4, meta.json.
//
//   node capture.mjs --url https://example.com --out portfolio/media/example
//   node capture.mjs --batch apps.json --out portfolio/media
//
// A batch file is [{ "slug": "example", "url": "https://…", "setup": [ …steps ], "plan": [ …steps ] }, …].
// A plan is an optional list of steps recorded into clip.mp4 (see SKILL.md, "Capture plans").

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    batch: { type: 'string' },
    plan: { type: 'string' },
    duration: { type: 'string', default: '7' },
    wait: { type: 'string', default: '1200' },
    scheme: { type: 'string', default: 'light' },
    'no-video': { type: 'boolean', default: false },
    'no-mobile': { type: 'boolean', default: false },
    'no-desktop': { type: 'boolean', default: false },
    'keep-overlays': { type: 'boolean', default: false },
    'public-only': { type: 'boolean', default: false },
    'no-auto-enter': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

if (args.help || (!args.url && !args.batch) || !args.out) {
  console.error('usage: capture.mjs (--url <url> | --batch <apps.json>) --out <dir> [--plan plan.json]');
  console.error('       [--duration 7] [--wait 1200] [--scheme light|dark] [--no-video] [--no-mobile] [--no-desktop] [--keep-overlays] [--public-only] [--no-auto-enter]');
  process.exit(args.help ? 0 : 1);
}

async function loadChromium() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    console.error(`playwright is not installed. Run:\n  npm install --prefix "${SCRIPTS_DIR}"`);
    process.exit(2);
  }
}

async function launch(chromium) {
  try {
    return await chromium.launch();
  } catch (bundledError) {
    // No bundled Chromium downloaded: fall back to the Chrome already on the machine.
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      console.error(`${bundledError.message}\n\nNo browser available. Run:\n  npx --prefix "${SCRIPTS_DIR}" playwright install chromium`);
      process.exit(2);
    }
  }
}

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${stderr.slice(-1500)}`))));
  });
}

// For servers capturing URLs from strangers: refuse requests to loopback, private and link-local hosts.
function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return host.includes(':') && (host === '::1' || host === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith('::ffff:'));
}

async function newContext(browser, options, opts) {
  const context = await browser.newContext({ ...options, colorScheme: opts.scheme });
  if (opts.publicOnly) {
    await context.route('**/*', (route) => {
      const { protocol, hostname } = new URL(route.request().url());
      const allowed = protocol === 'data:' || protocol === 'blob:' || (/^https?:$/.test(protocol) && !isPrivateHost(hostname));
      return allowed ? route.continue() : route.abort('blockedbyclient');
    });
  }
  return context;
}

async function open(page, url, waitMs) {
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(waitMs);
}

// Decline consent banners where a decline control exists, then hide what is left. Never accepts.
async function clearOverlays(page) {
  await page
    .evaluate(() => {
      const decline = /^(reject( all)?|decline( all)?|deny|refuse|(only )?(necessary|essential)( only| cookies)?|no,? thanks)$/i;
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        const text = (el.innerText || '').trim();
        if (text.length < 30 && decline.test(text)) {
          el.click();
          break;
        }
      }
    })
    .catch(() => {});
  await page.waitForTimeout(300);
  await page
    .addStyleTag({
      content:
        '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[id*="gdpr" i],[class*="gdpr" i],[aria-label*="cookie" i]{display:none!important}',
    })
    .catch(() => {});
}

// Some sites open on an intro, splash or "tap to enter" screen that hides the real page. Detect a full-viewport
// fixed layer with most of the page's text behind it, and click through it the way a visitor would.
// A layer holding a form is treated as a pop-up instead and only ever dismissed, never submitted.
function findIntro() {
  const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  let cover = null;
  for (let node = centre; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const box = node.getBoundingClientRect();
    if (getComputedStyle(node).position === 'fixed' && box.width >= innerWidth * 0.95 && box.height >= innerHeight * 0.95) cover = node;
  }
  if (!cover) return null;
  const inside = (cover.innerText || '').trim().length;
  const behind = (document.body.innerText || '').trim().length - inside;
  if (behind < 200 || behind < inside * 2) return null; // the layer is the app itself, not something in front of it

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden';
  };
  const distance = (el) => {
    const r = el.getBoundingClientRect();
    return Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2);
  };
  const popup = Boolean(cover.querySelector('input, textarea, select, form'));
  let candidates;
  if (popup) {
    candidates = [...cover.querySelectorAll('button, [role="button"], a')].filter(
      (el) => visible(el) && /^(×|✕|x|close|dismiss|skip|no,? thanks|not now|maybe later)$/i.test(((el.getAttribute('aria-label') || el.innerText || '').trim())),
    );
    if (!candidates.length) return { popup: true, target: false };
  } else {
    candidates = [...cover.querySelectorAll('button, [role="button"], [onclick], [tabindex]:not([tabindex="-1"])')].filter(visible);
    if (!candidates.length) candidates = [...cover.querySelectorAll('*')].filter((el) => visible(el) && getComputedStyle(el).cursor === 'pointer');
  }
  cover.setAttribute('data-flex-cover', '');
  (candidates.sort((a, b) => distance(a) - distance(b))[0] ?? cover).setAttribute('data-flex-enter', '');
  return { popup, target: true };
}

async function passIntro(page) {
  const stillCovered = () =>
    page.evaluate(() => {
      const cover = document.querySelector('[data-flex-cover]');
      if (!cover || !cover.isConnected) return false;
      const style = getComputedStyle(cover);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.1 || style.pointerEvents === 'none') return false;
      return Boolean(document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('[data-flex-cover]'));
    });
  const intro = await page.evaluate(findIntro).catch(() => null);
  if (!intro) return false;
  const origin = new URL(page.url()).origin;
  if (intro.target) {
    const box = await page.locator('[data-flex-enter]').first().boundingBox().catch(() => null);
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(2500);
  if (new URL(page.url()).origin !== origin) {
    await page.goBack({ waitUntil: 'load' }).catch(() => {}); // the click was a link out, not a way in
    return false;
  }
  if (await stillCovered().catch(() => false)) {
    await page.keyboard.press(intro.popup ? 'Escape' : 'Enter');
    await page.waitForTimeout(1500);
  }
  return !(await stillCovered().catch(() => true));
}

function extractMeta() {
  const content = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || null;
  const abs = (u) => {
    try {
      return u ? new URL(u, location.href).href : null;
    } catch {
      return null;
    }
  };
  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const saturation = ({ r, g, b }) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  };

  // Background: first opaque colour up the body → html chain.
  let background = '#ffffff';
  for (const el of [document.body, document.documentElement]) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0.5) {
      background = hex(c);
      break;
    }
  }

  // Accent: the most-used saturated colour on buttons and links, weighted towards filled buttons.
  const votes = new Map();
  const vote = (c, weight) => {
    // Skip near-black and near-white: they are ink and paper, not the brand colour.
    if (!c || c.a < 0.6 || saturation(c) < 0.3 || Math.max(c.r, c.g, c.b) < 90 || Math.min(c.r, c.g, c.b) > 225) return;
    const key = hex(c);
    votes.set(key, (votes.get(key) || 0) + weight);
  };
  for (const el of document.querySelectorAll('button, [role="button"], a, [class*="btn" i], [class*="button" i]')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    vote(parse(cs.backgroundColor), 3);
    vote(parse(cs.color), 1);
  }
  const accent = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const firstFamily = (el) => (el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim() : null);
  const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.href);
  const find = (re) => hrefs.find((h) => re.test(h)) || null;

  return {
    url: location.href,
    title: document.title.trim() || null,
    description: content('meta[name="description"]') || content('meta[property="og:description"]'),
    siteName: content('meta[property="og:site_name"]'),
    ogImage: abs(content('meta[property="og:image"]')),
    favicon: abs(
      document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel~="icon"]')?.getAttribute('href') ||
        '/favicon.ico',
    ),
    lang: document.documentElement.lang || null,
    background,
    accent,
    fonts: { heading: firstFamily(document.querySelector('h1, h2')), body: firstFamily(document.body) },
    h1: text(document.querySelector('h1')) || null,
    headings: [...document.querySelectorAll('h2')].map(text).filter(Boolean).slice(0, 8),
    calls: [...new Set([...document.querySelectorAll('a, button')].filter(visible).map(text).filter((t) => t && t.length < 32))].slice(0, 12),
    links: {
      appStore: find(/apps\.apple\.com/),
      playStore: find(/play\.google\.com\/store/),
      github: find(/github\.com\/[^/]+\/[^/]+/),
      productHunt: find(/producthunt\.com\/(posts|products)/),
      chromeStore: find(/chromewebstore\.google\.com|chrome\.google\.com\/webstore/),
    },
    scrollHeight: document.documentElement.scrollHeight,
  };
}

// --- clip recording -------------------------------------------------------

async function addCursor(page) {
  await page.evaluate(({ w, h }) => {
    if (document.getElementById('__flex_cursor')) return;
    const el = document.createElement('div');
    el.id = '__flex_cursor';
    el.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8-6.5 1.8L9 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><i></i>';
    el.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;opacity:0;transform:translate(${w * 0.62}px,${h * 0.72}px);transition:transform .55s cubic-bezier(.2,.8,.2,1),opacity .2s`;
    const ring = el.querySelector('i');
    ring.style.cssText =
      'position:absolute;left:-12px;top:-12px;width:30px;height:30px;border-radius:50%;background:rgba(17,17,17,.22);transform:scale(0);transition:transform .25s ease-out,opacity .35s';
    document.documentElement.appendChild(el);
  }, { w: DESKTOP.width, h: DESKTOP.height });
}

async function pointAt(page, selector, { click = false } = {}) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded({ timeout: 5000 });
  const box = await target.boundingBox();
  if (!box) throw new Error(`no visible element for selector: ${selector}`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(({ x, y }) => {
    const el = document.getElementById('__flex_cursor');
    if (el) {
      el.style.opacity = '1';
      el.style.transform = `translate(${x}px,${y}px)`;
    }
  }, { x, y });
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(600);
  if (click) {
    await page.evaluate(() => {
      const ring = document.querySelector('#__flex_cursor i');
      if (!ring) return;
      ring.style.opacity = '1';
      ring.style.transform = 'scale(1)';
      setTimeout(() => ((ring.style.opacity = '0'), (ring.style.transform = 'scale(0)')), 260);
    });
    await page.mouse.click(x, y);
  }
  return target;
}

function smoothScroll(page, to, ms) {
  return page.evaluate(({ to, ms }) =>
    new Promise((resolve) => {
      document.documentElement.style.scrollBehavior = 'auto';
      const max = document.documentElement.scrollHeight - innerHeight;
      let target;
      if (typeof to === 'string') {
        const el = document.querySelector(to);
        target = el ? el.getBoundingClientRect().top + scrollY - innerHeight * 0.15 : scrollY;
      } else {
        target = to <= 1 ? to * max : to; // 0–1 is a fraction of the page, larger is pixels
      }
      target = Math.max(0, Math.min(max, target));
      const start = scrollY, delta = target - start, t0 = performance.now();
      const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      (function step(now) {
        const p = Math.min(1, (now - t0) / ms);
        scrollTo(0, start + delta * ease(p));
        p < 1 ? requestAnimationFrame(step) : resolve();
      })(t0);
    }), { to, ms });
}

async function defaultPlan(page, seconds) {
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const distance = Math.min(scrollable, DESKTOP.height * 3.2);
  if (distance < 80) return [{ do: 'wait', ms: Math.min(seconds, 4) * 1000 }];
  const travel = Math.max(1800, seconds * 1000 - 2600);
  return [
    { do: 'wait', ms: 900 },
    { do: 'scroll', to: distance, ms: travel },
    { do: 'wait', ms: 600 },
    { do: 'scroll', to: 0, ms: 800 }, // end where it started so the loop is seamless
    { do: 'wait', ms: 300 },
  ];
}

async function runStep(page, step, waitMs) {
  switch (step.do) {
    case 'wait':
      return page.waitForTimeout(step.ms ?? 800);
    case 'scroll':
      return smoothScroll(page, step.to ?? 1, step.ms ?? 1500);
    case 'hover':
      return pointAt(page, step.selector);
    case 'click':
      await pointAt(page, step.selector, { click: true });
      return page.waitForTimeout(step.ms ?? 700);
    case 'type': {
      const target = await pointAt(page, step.selector, { click: true });
      await target.pressSequentially(step.text ?? '', { delay: step.delay ?? 55 });
      return page.waitForTimeout(step.ms ?? 400);
    }
    case 'press':
      await page.keyboard.press(step.key);
      return page.waitForTimeout(step.ms ?? 500);
    case 'goto':
      await open(page, new URL(step.url, page.url()).href, Math.min(waitMs, 600));
      return addCursor(page);
    default:
      throw new Error(`unknown plan step: ${JSON.stringify(step)}`);
  }
}

async function recordClip(browser, app, outDir, opts) {
  const context = await newContext(browser, { viewport: DESKTOP, deviceScaleFactor: 1 }, opts);
  const page = await context.newPage();
  const framesDir = path.join(outDir, '.frames');
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  try {
    await open(page, app.url, opts.waitMs);
    if (!opts.keepOverlays) await clearOverlays(page);
    await addCursor(page);
    if (opts.autoEnter && !app.setup?.length) await passIntro(page);
    for (const step of app.setup ?? []) await runStep(page, step, opts.waitMs);
    const plan = app.plan?.length ? app.plan : await defaultPlan(page, opts.seconds);

    const cdp = await context.newCDPSession(page);
    const frames = [];
    const writes = [];
    cdp.on('Page.screencastFrame', (frame) => {
      const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
      frames.push({ file, t: frame.metadata.timestamp });
      writes.push(writeFile(path.join(framesDir, file), Buffer.from(frame.data, 'base64')));
      cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: DESKTOP.width, maxHeight: DESKTOP.height, everyNthFrame: 1 });
    const started = Date.now();
    for (const step of plan) await runStep(page, step, opts.waitMs);
    const elapsed = (Date.now() - started) / 1000;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(writes);
    if (frames.length < 2) throw new Error('screencast produced no frames');

    // Frames arrive only when the page repaints, so each one carries its own duration.
    const end = frames[0].t + elapsed;
    const list = frames
      .map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`)
      .concat(`file '${frames.at(-1).file}'`)
      .join('\n');
    await writeFile(path.join(framesDir, 'frames.txt'), list);
    const clip = path.join(outDir, 'clip.mp4');
    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', path.join(framesDir, 'frames.txt'),
      '-vf', `fps=30,scale=${DESKTOP.width}:${DESKTOP.height}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-movflags', '+faststart', '-an', clip,
    ]);
    return { clip: 'clip.mp4', clipSeconds: Number(elapsed.toFixed(1)) };
  } finally {
    await rm(framesDir, { recursive: true, force: true });
    await context.close();
  }
}

async function still(browser, app, file, contextOptions, opts) {
  const context = await newContext(browser, contextOptions, opts);
  const page = await context.newPage();
  try {
    await open(page, app.url, opts.waitMs);
    if (!opts.keepOverlays) await clearOverlays(page);
    // Get past an intro or splash so the stills show the app itself: explicit setup steps if given, else automatically.
    const entered = opts.autoEnter && !app.setup?.length ? await passIntro(page) : false;
    for (const step of app.setup ?? []) await runStep(page, step, opts.waitMs);
    const meta = { ...(await page.evaluate(extractMeta)), passedIntro: entered };
    await page.screenshot({ path: file, type: 'jpeg', quality: 84 });
    return meta;
  } finally {
    await context.close();
  }
}

async function captureApp(browser, app, outDir, opts) {
  await mkdir(outDir, { recursive: true });
  const result = { slug: app.slug ?? path.basename(outDir), url: app.url, files: {}, warnings: [] };
  const attempt = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      result.warnings.push(`${label}: ${error.message.split('\n')[0]}`);
      return null;
    }
  };

  if (!opts.noDesktop) {
    const meta = await attempt('desktop', () => still(browser, app, path.join(outDir, 'desktop.jpg'), { viewport: DESKTOP, deviceScaleFactor: 2 }, opts));
    if (meta) {
      result.files.desktop = 'desktop.jpg';
      result.meta = meta;
      await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
    }
  }
  if (!opts.noMobile) {
    const meta = await attempt('mobile', () =>
      still(browser, app, path.join(outDir, 'mobile.jpg'), { viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA }, opts),
    );
    if (meta) result.files.mobile = 'mobile.jpg';
  }
  if (!opts.noVideo) {
    const clip = await attempt('clip', () => recordClip(browser, app, outDir, opts));
    if (clip) Object.assign(result.files, { clip: clip.clip }), (result.clipSeconds = clip.clipSeconds);
  }
  return result;
}

// A plan file is either a list of recorded steps or { setup, plan }.
function normalisePlan(file) {
  return Array.isArray(file) ? { plan: file } : { setup: file.setup, plan: file.plan };
}

const opts = {
  seconds: Number(args.duration),
  waitMs: Number(args.wait),
  scheme: args.scheme === 'dark' ? 'dark' : 'light',
  noVideo: args['no-video'],
  noMobile: args['no-mobile'],
  noDesktop: args['no-desktop'],
  keepOverlays: args['keep-overlays'],
  publicOnly: args['public-only'],
  autoEnter: !args['no-auto-enter'],
};

const apps = args.batch
  ? JSON.parse(await readFile(args.batch, 'utf8'))
  : [{ url: args.url, ...(args.plan ? normalisePlan(JSON.parse(await readFile(args.plan, 'utf8'))) : {}) }];

const browser = await launch(await loadChromium());
const results = [];
try {
  for (const app of apps) {
    const outDir = args.batch ? path.join(args.out, app.slug) : args.out;
    console.error(`capturing ${app.url} → ${outDir}`);
    results.push(await captureApp(browser, app, outDir, opts));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(args.batch ? results : results[0], null, 2));
// Set the code and let Node exit by itself: process.exit() can cut off the JSON above when stdout is a pipe.
process.exitCode = results.some((r) => Object.keys(r.files).length === 0) ? 1 : 0;
