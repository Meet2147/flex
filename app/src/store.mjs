// Orders are one JSON file each. Enough for a single instance; swap for a database when there is more than one.
import { mkdir, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { config } from './config.mjs';

const ordersDir = path.join(config.dataDir, 'orders');
export const pagesDir = path.join(config.dataDir, 'pages');
export const zipsDir = path.join(config.dataDir, 'zips');
const claimsDir = path.join(config.dataDir, 'claims');
await Promise.all([ordersDir, pagesDir, zipsDir, claimsDir].map((dir) => mkdir(dir, { recursive: true })));

const ID = /^[A-Za-z0-9_-]{20,40}$/;
const file = (id) => path.join(ordersDir, `${id}.json`);

export const slugify = (text) =>
  String(text).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'page';

async function write(order) {
  const tmp = `${file(order.id)}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(order, null, 2));
  await rename(tmp, file(order.id));
  return order;
}

export function createOrder({ plan, owner, urls, hints = {}, style = 'genz', tone = '', reel = null, email, paid }) {
  const id = randomBytes(18).toString('base64url'); // the private link; unguessable
  return write({
    id,
    slug: `${slugify(owner.name)}-${randomBytes(3).toString('hex')}`,
    plan,
    owner,
    urls,
    hints, // url → text to click first, for sites that open on an intro screen
    style,
    tone, // the customer's own words about how the page should sound
    reel, // null, 'landscape' or 'vertical'
    email: email ?? null,
    status: plan === 'free' || paid ? 'queued' : 'awaiting_payment',
    ...(paid && { paidAt: new Date().toISOString(), paidVia: 'link', checkoutId: paid }),
    refreshesUsed: 0,
    apps: urls.map((url) => ({ url, state: 'waiting' })),
    createdAt: new Date().toISOString(),
  });
}

export async function getOrder(id) {
  if (!ID.test(id ?? '')) return null;
  try {
    return JSON.parse(await readFile(file(id), 'utf8'));
  } catch {
    return null;
  }
}

// Updates are serialised per order so the worker and a webhook cannot overwrite each other.
const locks = new Map();
export function updateOrder(id, change) {
  const next = (locks.get(id) ?? Promise.resolve()).then(async () => {
    const order = await getOrder(id);
    if (!order) return null;
    return write(typeof change === 'function' ? (change(order) ?? order) : Object.assign(order, change));
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function ordersWithStatus(...statuses) {
  const found = [];
  for (const name of await readdir(ordersDir)) {
    if (!name.endsWith('.json')) continue;
    const order = await getOrder(name.slice(0, -5));
    if (order && statuses.includes(order.status)) found.push(order);
  }
  return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findOrderByCheckout(checkoutId) {
  if (!checkoutId) return null;
  return (await ordersWithStatus('awaiting_payment')).find((o) => o.checkoutId === checkoutId) ?? null;
}

// A checkout paid through a shared link is exchanged for exactly one order.
export async function claimCheckout(checkoutId, orderId) {
  try {
    await writeFile(path.join(claimsDir, `${checkoutId}.json`), JSON.stringify({ orderId, at: new Date().toISOString() }), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}
export async function claimedOrder(checkoutId) {
  try {
    return JSON.parse(await readFile(path.join(claimsDir, `${checkoutId}.json`), 'utf8')).orderId;
  } catch {
    return null;
  }
}
