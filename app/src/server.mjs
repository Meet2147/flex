import { createReadStream } from 'node:fs';
import { stat, appendFile, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config, PLANS, paymentsLive } from './config.mjs';
import { createOrder, getOrder, updateOrder, findOrderByCheckout, claimCheckout, claimedOrder, pagesDir } from './store.mjs';
import { checkUrl, UrlError } from './safety.mjs';
import { createCheckout, checkoutSucceeded, verifyWebhook } from './payments.mjs';
import { enqueue, queuePosition, resume, zipFor } from './pipeline.mjs';
import { landing, orderPage, devPayPage, thanksPage, legalPage, messagePage, notFound, STYLES, FAVICON } from './views.mjs';

const app = new Hono();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.zip': 'application/zip' };

// Static files with byte ranges, which Safari requires before it will play a video.
async function sendFile(c, root, relative, { cache = 'public, max-age=300', download } = {}) {
  const file = path.join(root, relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative);
  if (!file.startsWith(root + path.sep) && file !== root) return c.html(notFound(), 404);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return c.html(notFound(), 404);
  const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${download}"`;
  const range = c.req.header('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) return c.body(null, 416, { 'Content-Range': `bytes */${info.size}` });
    return c.body(Readable.toWeb(createReadStream(file, { start, end })), 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': String(end - start + 1) });
  }
  return c.body(Readable.toWeb(createReadStream(file)), 200, { ...headers, 'Content-Length': String(info.size) });
}

const clientIp = (c) => c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.env?.incoming?.socket?.remoteAddress || 'unknown';
const freeUse = new Map(); // ip → timestamps of free pages in the last day
function freeAllowed(ip) {
  const recent = (freeUse.get(ip) ?? []).filter((t) => Date.now() - t < 86_400_000);
  if (recent.length >= config.freePagesPerDay) return false;
  freeUse.set(ip, [...recent, Date.now()]);
  return true;
}

async function markPaid(id, details = {}) {
  let changed = false;
  await updateOrder(id, (order) => {
    if (order.status !== 'awaiting_payment') return;
    changed = true;
    Object.assign(order, { status: 'queued', paidAt: new Date().toISOString(), ...details });
  });
  if (changed) enqueue(id);
}

const publicView = (order) => ({
  status: order.status,
  plan: order.plan,
  apps: order.apps.map(({ url, state, error }) => ({ url, state, error })),
  position: queuePosition(order.id),
  error: order.error ?? null,
  refund: order.refund ?? null,
  ...(order.status === 'ready' && {
    pageUrl: `${config.baseUrl}/p/${order.slug}/`,
    canDownload: PLANS[order.plan].zip,
    refreshesLeft: Math.max(0, PLANS[order.plan].refreshes - order.refreshesUsed),
  }),
});

app.get('/', (c) => c.html(landing()));
app.get('/favicon.svg', (c) => c.body(FAVICON, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }));
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 301));
for (const slug of ['terms', 'acceptable-use', 'refunds', 'privacy']) app.get(`/${slug}`, (c) => c.html(legalPage(slug)));

// Where a shared Polar checkout link sends the buyer: they have paid, and now choose what goes on the page.
app.get('/thanks', async (c) => {
  const checkoutId = c.req.query('checkout_id') ?? '';
  const existing = await claimedOrder(checkoutId);
  if (existing) return c.redirect(`/o/${existing}`);
  if (!(await checkoutSucceeded(checkoutId).catch(() => false))) {
    return c.html(messagePage('we could not confirm that payment.', 'If you just paid, give it a minute and reload this page. Otherwise <a href="/">start here</a>.', 'not confirmed'), 402);
  }
  return c.html(thanksPage(checkoutId), 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' });
});
app.get('/healthz', (c) => c.json({ ok: true, payments: paymentsLive ? 'polar' : 'simulated', copywriting: config.copywriting }));
app.get('/assets/*', (c) => sendFile(c, path.join(config.appDir, 'public'), c.req.path.slice('/assets/'.length)));
app.get('/example', (c) => c.redirect('/example/'));
app.get('/example/*', (c) => sendFile(c, path.join(config.appDir, 'example'), decodeURIComponent(c.req.path.slice('/example/'.length))));

app.post('/api/orders', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const plan = PLANS[body.plan] ? body.plan : null;
  const name = String(body.name ?? '').trim().slice(0, 60);
  const handle = String(body.handle ?? '').trim().slice(0, 40);
  const style = STYLES.some(([key]) => key === body.style) ? body.style : 'genz';
  // One app per line. A line may end with what to click to get past an intro screen:  https://site.com click: Enter
  const lines = (Array.isArray(body.urls) ? body.urls : String(body.urls ?? '').split(/[\n,]+/)).map((line) => String(line).trim()).filter(Boolean);
  const entries = new Map();
  for (const line of lines) {
    const [, link, hint] = line.match(/^(\S+)(?:\s+click:\s*["“']?(.{1,60}?)["”']?)?\s*$/i) ?? [null, line.split(/\s+/)[0], null];
    if (!entries.has(link)) entries.set(link, hint ?? null);
  }
  const inputs = [...entries.keys()];

  if (!plan) return c.json({ error: 'Pick a plan.' }, 400);
  if (!name) return c.json({ error: 'Add your name: it is the title of the page.' }, 400);
  if (!inputs.length) return c.json({ error: 'Paste at least one app link.' }, 400);
  if (inputs.length > PLANS[plan].apps) {
    return c.json({ error: `${PLANS[plan].name} covers up to ${PLANS[plan].apps} apps and you pasted ${inputs.length}.${plan === 'free' ? ` Remove some, or choose Page Pass for up to ${PLANS.pass.apps}.` : ''}` }, 400);
  }
  if (plan === 'pass' && !body.checkout && !paymentsLive && config.isProduction) return c.json({ error: 'Payments are not switched on yet. The free plan works.' }, 503);

  const checked = await Promise.allSettled(inputs.map(checkUrl));
  const problems = checked.filter((r) => r.status === 'rejected').map((r) => (r.reason instanceof UrlError ? r.reason.message : 'Could not check one of the links.'));
  if (problems.length) return c.json({ error: problems.join('\n') }, 400);
  const urls = [...new Set(checked.map((r) => r.value))];
  const hints = Object.fromEntries(checked.map((r, i) => [r.value, entries.get(inputs[i])]).filter(([, hint]) => hint));

  if (plan === 'free' && !freeAllowed(clientIp(c))) return c.json({ error: `The free plan allows ${config.freePagesPerDay} pages a day. Try again tomorrow, or choose Page Pass.` }, 429);

  // Already paid through a shared checkout link: confirm it with Polar and let it be used exactly once.
  if (body.checkout) {
    const checkoutId = String(body.checkout);
    if (plan !== 'pass' || !(await checkoutSucceeded(checkoutId).catch(() => false))) return c.json({ error: 'We could not confirm that payment.' }, 402);
    const order = await createOrder({ plan, owner: { name, handle }, urls, hints, style, paid: checkoutId });
    if (!(await claimCheckout(checkoutId, order.id))) {
      await updateOrder(order.id, { status: 'failed', error: 'This payment was already used for another page.' });
      return c.json({ error: 'That payment has already been used to make a page.', next: `/o/${await claimedOrder(checkoutId)}` }, 409);
    }
    enqueue(order.id);
    return c.json({ next: `/o/${order.id}` });
  }

  const order = await createOrder({ plan, owner: { name, handle }, urls, hints, style });
  if (plan === 'free') {
    enqueue(order.id);
    return c.json({ next: `/o/${order.id}` });
  }
  try {
    const checkout = await createCheckout(order);
    await updateOrder(order.id, { checkoutId: checkout.checkoutId });
    return c.json({ next: checkout.url });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Could not start the checkout. Nothing was charged; please try again.' }, 502);
  }
});

app.get('/api/orders/:id', async (c) => {
  const order = await getOrder(c.req.param('id'));
  return order ? c.json(publicView(order), 200, { 'Cache-Control': 'no-store' }) : c.json({ error: 'Not found' }, 404);
});

app.post('/api/orders/:id/refresh', async (c) => {
  const order = await getOrder(c.req.param('id'));
  if (!order) return c.json({ error: 'Not found' }, 404);
  const retry = order.status === 'failed'; // a failed run is retried without using up a refresh
  if (!retry && (order.status !== 'ready' || order.refreshesUsed >= PLANS[order.plan].refreshes)) return c.json({ error: 'No refreshes left.' }, 409);
  await updateOrder(order.id, { status: 'queued', refreshesUsed: order.refreshesUsed + (retry ? 0 : 1) });
  enqueue(order.id);
  return c.json({ ok: true });
});

app.get('/o/:id', async (c) => {
  const order = await getOrder(c.req.param('id'));
  return order ? c.html(orderPage(order), 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' }) : c.html(notFound(), 404);
});

// Polar sends the buyer back here. The webhook is the source of truth; this covers the case where it is slow.
app.get('/o/:id/paid', async (c) => {
  const order = await getOrder(c.req.param('id'));
  if (!order) return c.html(notFound(), 404);
  const checkoutId = c.req.query('checkout_id');
  if (order.status === 'awaiting_payment' && checkoutId && checkoutId === order.checkoutId) {
    if (await checkoutSucceeded(checkoutId).catch(() => false)) await markPaid(order.id, { paidVia: 'return' });
  }
  return c.redirect(`/o/${order.id}`);
});

app.get('/o/:id/download', async (c) => {
  const order = await getOrder(c.req.param('id'));
  if (!order || order.status !== 'ready' || !PLANS[order.plan].zip) return c.html(notFound(), 404);
  const file = await zipFor(order);
  return sendFile(c, path.dirname(file), path.basename(file), { cache: 'no-store', download: `${order.slug}.zip` });
});

app.post('/api/webhooks/polar', async (c) => {
  const raw = await c.req.text();
  const event = verifyWebhook(c.req.raw.headers, raw);
  if (!event) return c.json({ error: 'bad signature' }, 403);
  if (event.type === 'order.paid') {
    const data = event.data ?? {};
    const order = (await getOrder(data.metadata?.order_id)) ?? (await findOrderByCheckout(data.checkout_id));
    if (order) await markPaid(order.id, { paidVia: 'webhook', polarOrderId: data.id, email: data.customer?.email ?? order.email });
    else console.error('order.paid with no matching order', data.id);
  }
  return c.json({ received: true }, 202);
});

if (!paymentsLive && !config.isProduction) {
  app.get('/dev/pay/:id', async (c) => {
    const order = await getOrder(c.req.param('id'));
    return order?.status === 'awaiting_payment' ? c.html(devPayPage(order)) : c.redirect(order ? `/o/${order.id}` : '/');
  });
  app.post('/dev/pay/:id', async (c) => {
    const order = await getOrder(c.req.param('id'));
    if (!order) return c.html(notFound(), 404);
    await markPaid(order.id, { paidVia: 'simulated' });
    return c.redirect(`/o/${order.id}`, 303);
  });
}

app.post('/api/waitlist', async (c) => {
  const email = String((await c.req.json().catch(() => ({}))).email ?? '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return c.json({ error: 'invalid email' }, 400);
  await appendFile(path.join(config.dataDir, 'waitlist.jsonl'), JSON.stringify({ email, at: new Date().toISOString() }) + '\n');
  return c.json({ ok: true });
});

// Published pages. Only the page, its preview image and its media are public; the data files are not.
app.get('/p/:slug', (c) => c.redirect(`/p/${c.req.param('slug')}/`));
app.get('/p/:slug/*', async (c) => {
  const slug = c.req.param('slug');
  const rest = decodeURIComponent(c.req.path.slice(`/p/${slug}/`.length));
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !(rest === '' || rest === 'index.html' || rest === 'og.jpg' || /^media\/[\w-]+\/[\w.-]+\.(jpg|mp4)$/.test(rest))) return c.html(notFound(), 404);
  const expires = await readFile(path.join(pagesDir, slug, '.expires'), 'utf8').catch(() => null);
  if (expires && Date.parse(expires) < Date.now()) {
    return c.html(messagePage('this page has finished its year.', 'Page Pass hosting lasts 12 months. If it was yours, the zip you downloaded still works anywhere, or <a href="/">make a fresh one</a>.', 'expired'), 410);
  }
  return sendFile(c, path.join(pagesDir, slug), rest);
});

app.notFound((c) => c.html(notFound(), 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Something went wrong on our side.' }, 500);
});

// Fail at boot, not on the first paying customer, if the capture scripts are not where they should be.
for (const script of ['capture.mjs', 'build.mjs']) {
  if (!(await stat(path.join(config.scriptsDir, script)).catch(() => null))) {
    console.error(`Missing ${script} in ${config.scriptsDir}. Set FLEX_SCRIPTS_DIR.`);
    process.exit(1);
  }
}

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`/flex listening on ${config.baseUrl}  payments=${paymentsLive ? 'polar' : 'simulated'}  copywriting=${config.copywriting ? config.model : 'site text only'}`);
  void resume();
});
