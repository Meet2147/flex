// One order at a time: capture each app, write the copy, build the page.
import { mkdir, writeFile, rm, rename, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config, PLANS } from './config.mjs';
import { getOrder, updateOrder, ordersWithStatus, pagesDir, zipsDir, slugify } from './store.mjs';
import { appStoreId } from './safety.mjs';
import { writeCopy } from './copy.mjs';
import { refundOrder } from './payments.mjs';

const queue = [];
let working = false;

export function enqueue(orderId) {
  if (!queue.includes(orderId)) queue.push(orderId);
  if (!working) void drain();
}
export const queuePosition = (orderId) => queue.indexOf(orderId) + 1;

async function drain() {
  working = true;
  while (queue.length) {
    const id = queue[0];
    try {
      await processOrder(id);
    } catch (error) {
      console.error(`order ${id} failed`, error);
      const order = await updateOrder(id, { status: 'failed', error: error.message.split('\n')[0] });
      // Paid and never got a page: refund without being asked. A failed re-capture keeps the page it already had.
      if (order?.plan === 'pass' && !order.readyAt && !order.refund && order.paidVia !== 'simulated') await updateOrder(id, await refundOrder(order));
    }
    queue.shift();
  }
  working = false;
}

// Pick up anything interrupted by a restart.
export async function resume() {
  for (const order of await ordersWithStatus('queued', 'capturing', 'writing', 'building')) enqueue(order.id);
}

function run(script, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(config.scriptsDir, script), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      let json = null;
      try {
        json = JSON.parse(stdout);
      } catch {}
      resolve({ code, json, stderr });
    });
  });
}

const exists = (file) => access(file).then(() => true, () => false);

async function captureWeb(app, mediaDir, plan) {
  const args = ['--url', app.url, '--out', mediaDir, '--public-only', ...(plan.video ? [] : ['--no-video'])];
  if (app.hint) {
    // The customer told us what to click to get past an intro screen.
    const planFile = `${mediaDir}.plan.json`;
    await writeFile(planFile, JSON.stringify({ setup: [{ do: 'click', selector: `text=${JSON.stringify(app.hint)}`, ms: 2400 }] }));
    args.push('--plan', planFile);
  }
  const { json, stderr } = await run('capture.mjs', args, config.captureTimeoutMs);
  const files = json?.files ?? {};
  if (!files.desktop && !files.mobile) {
    if (!json) console.error(`capture of ${app.url} produced no result: ${stderr.slice(-400)}`);
    // Shown to the customer, so no server paths or stack traces.
    const reason = json?.warnings?.[0] ?? '';
    throw new Error(/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_BLOCKED|Timeout/.test(reason) ? 'the site did not load' : 'the capture did not finish');
  }
  return { meta: json.meta ?? {}, files, still: files.desktop ? path.join(mediaDir, 'desktop.jpg') : path.join(mediaDir, 'mobile.jpg') };
}

// Native apps have nothing to record, so their page section uses the store listing's own screenshots.
async function captureAppStore(app, store, mediaDir) {
  const response = await fetch(`https://itunes.apple.com/lookup?id=${store.id}&country=${store.country}`, { signal: AbortSignal.timeout(15_000) });
  const listing = (await response.json()).results?.[0];
  if (!listing) throw new Error('App Store listing not found');
  await mkdir(mediaDir, { recursive: true });
  const shots = [];
  for (const [i, url] of (listing.screenshotUrls ?? []).slice(0, 3).entries()) {
    const image = await fetch(url.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x1300bb.jpg'), { signal: AbortSignal.timeout(20_000) });
    if (!image.ok) continue;
    await writeFile(path.join(mediaDir, `shot${i + 1}.jpg`), Buffer.from(await image.arrayBuffer()));
    shots.push(`shot${i + 1}.jpg`);
  }
  if (!shots.length) throw new Error('The listing has no screenshots');
  return {
    meta: { title: listing.trackName, siteName: listing.trackName, description: listing.description?.split('\n')[0] ?? '' },
    listing: { storeDescription: listing.description?.slice(0, 1500), genre: listing.primaryGenreName },
    platforms: ['iOS'],
    shots,
    still: path.join(mediaDir, shots[0]),
  };
}

async function processOrder(id) {
  let order = await getOrder(id);
  if (!order) return;
  const plan = PLANS[order.plan];
  // Build beside the live page and swap at the end, so a failed re-capture never takes a working page down.
  const liveDir = path.join(pagesDir, order.slug);
  const pageDir = path.join(pagesDir, `.work-${order.slug}`);
  const mediaRoot = path.join(pageDir, 'media');
  await rm(pageDir, { recursive: true, force: true });
  await mkdir(mediaRoot, { recursive: true });
  await updateOrder(id, { status: 'capturing', error: null, apps: order.urls.map((url) => ({ url, state: 'waiting' })) });

  const captured = [];
  const used = new Set();
  for (const [index, url] of order.urls.entries()) {
    const setApp = (patch) => updateOrder(id, (o) => void Object.assign(o.apps[index], patch));
    await setApp({ state: 'capturing' });
    let slug = slugify(new URL(url).hostname.replace(/^www\./, '').split('.')[0]);
    const store = appStoreId(url);
    if (store) slug = `app-${store.id}`;
    while (used.has(slug)) slug += '-2';
    used.add(slug);
    try {
      const mediaDir = path.join(mediaRoot, slug);
      const result = store ? await captureAppStore({ url }, store, mediaDir) : await captureWeb({ url, hint: order.hints?.[url] }, mediaDir, plan);
      await rm(`${mediaDir}.plan.json`, { force: true });
      captured.push({ slug, url, ...result });
      await setApp({ state: 'done', slug });
    } catch (error) {
      await setApp({ state: 'failed', error: error.message.split('\n')[0].slice(0, 200) });
    }
  }
  if (!captured.length) throw new Error('None of the apps could be captured.');

  await updateOrder(id, { status: 'writing' });
  const copy = await writeCopy(order.owner, captured, pageDir, order.style);

  await updateOrder(id, { status: 'building', copySource: copy.source });
  const bySlug = new Map(copy.apps.map((a) => [a.slug, a]));
  const portfolio = {
    owner: { name: order.owner.name, handle: order.owner.handle || undefined, headline: copy.headline, bio: copy.bio || undefined, links: order.owner.links ?? [], site: `${config.baseUrl}/p/${order.slug}` },
    theme: { style: order.style ?? 'genz', mode: 'auto', featuredCount: 8, credit: true },
    apps: captured.map((app) => {
      const words = bySlug.get(app.slug);
      const media = app.shots
        ? { shots: app.shots.map((s) => `media/${app.slug}/${s}`), frame: 'none' }
        : Object.fromEntries(Object.entries(app.files).map(([kind, name]) => [kind, `media/${app.slug}/${name}`]));
      return {
        slug: app.slug, name: words.name, status: words.status, platforms: words.platforms, tagline: words.tagline, description: words.description, highlights: words.highlights.slice(0, 3),
        url: app.url, cta: app.shots ? 'View on the App Store' : 'Visit site', accent: app.meta.accent ?? undefined, media,
      };
    }),
  };
  await writeFile(path.join(pageDir, 'portfolio.json'), JSON.stringify(portfolio, null, 2));
  for (const app of captured) await rm(path.join(mediaRoot, app.slug, 'meta.json'), { force: true });

  const built = await run('build.mjs', [path.join(pageDir, 'portfolio.json'), '--og'], 90_000);
  if (built.code !== 0 || !(await exists(path.join(pageDir, 'index.html')))) throw new Error(`Page build failed: ${built.stderr.split('\n')[0]}`);
  await rm(liveDir, { recursive: true, force: true });
  await rename(pageDir, liveDir);
  await rm(path.join(zipsDir, `${order.slug}.zip`), { force: true });
  const now = Date.now();
  await updateOrder(id, (o) => {
    o.status = 'ready';
    o.readyAt ??= new Date(now).toISOString();
    if (plan.hostedDays) o.expiresAt ??= new Date(now + plan.hostedDays * 86_400_000).toISOString();
  });
  const { expiresAt } = await getOrder(id);
  if (expiresAt) await writeFile(path.join(liveDir, '.expires'), expiresAt);
}

export async function zipFor(order) {
  const file = path.join(zipsDir, `${order.slug}.zip`);
  if (await exists(file)) return file;
  await new Promise((resolve, reject) => {
    spawn('zip', ['-r', '-q', file, '.'], { cwd: path.join(pagesDir, order.slug) }).on('close', (code) => (code === 0 ? resolve() : reject(new Error('zip failed')))).on('error', reject);
  });
  return file;
}
