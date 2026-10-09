#!/usr/bin/env node
// Create the /flex products and checkout links in Polar. Safe to run again: anything that already exists is reused.
//
//   node --env-file=app/.env app/scripts/polar-setup.mjs                 Page Pass only
//   node --env-file=app/.env app/scripts/polar-setup.mjs --plans all     also Pro monthly, Pro yearly, Founding lifetime
//   node --env-file=app/.env app/scripts/polar-setup.mjs --links         also create a shareable checkout link per product
//   node --env-file=app/.env app/scripts/polar-setup.mjs --webhook https://your-site/api/webhooks/polar
//   node --env-file=app/.env app/scripts/polar-setup.mjs --write-env     save the product id (and webhook secret) into app/.env
//
// Needs POLAR_ACCESS_TOKEN (scopes: products:read/write, plus checkout_links:write and webhooks:write for those flags).
// POLAR_SANDBOX=true targets sandbox-api.polar.sh; anything else targets the live API.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { values: args } = parseArgs({
  options: {
    plans: { type: 'string', default: 'pass' },
    links: { type: 'boolean', default: false },
    webhook: { type: 'string' },
    'write-env': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const CATALOG = {
  pass: { name: 'Flex Page Pass', cents: 2900, interval: null, description: 'One portfolio page: up to 12 apps with screenshots and video clips, a zip download, three re-captures, hosted for 12 months. One-time payment.' },
  'pro-monthly': { name: 'Flex Pro — Monthly', cents: 900, interval: 'month', description: 'Your portfolio on your own domain, unlimited apps, refreshed automatically every month.' },
  'pro-yearly': { name: 'Flex Pro — Yearly', cents: 7900, interval: 'year', description: 'Your portfolio on your own domain, unlimited apps, refreshed automatically every month. Billed yearly.' },
  lifetime: { name: 'Flex — Founding Lifetime', cents: 14900, interval: null, description: 'Flex Pro for life, for the first 200 buyers. Up to 12 refreshes a year.' },
};

const token = process.env.POLAR_ACCESS_TOKEN;
if (!token) {
  console.error('POLAR_ACCESS_TOKEN is not set. Run with: node --env-file=app/.env app/scripts/polar-setup.mjs');
  process.exit(1);
}
const sandbox = process.env.POLAR_SANDBOX === 'true';
const api = sandbox ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
const baseUrl = (process.env.BASE_URL ?? 'http://localhost:4400').replace(/\/$/, '');
const wanted = args.plans === 'all' ? Object.keys(CATALOG) : args.plans.split(',').map((p) => p.trim());
for (const plan of wanted) {
  if (!CATALOG[plan]) {
    console.error(`Unknown plan "${plan}". Choose from: ${Object.keys(CATALOG).join(', ')}, or all.`);
    process.exit(1);
  }
}

async function polar(method, pathname, body) {
  const response = await fetch(`${api}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function listAll(pathname) {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await polar('GET', `${pathname}${pathname.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    items.push(...result.items);
    if (page >= (result.pagination?.max_page ?? 1)) return items;
  }
}

const dollars = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
console.log(`Polar ${sandbox ? 'SANDBOX' : 'LIVE'} · ${api}${args['dry-run'] ? ' · dry run, nothing will be created' : ''}\n`);

// Products are matched by the metadata this script sets, so renaming one in the dashboard does not create a duplicate.
const existing = (await listAll('/v1/products/?is_archived=false')).filter((p) => p.metadata?.app === 'flex');
const products = {};
for (const plan of wanted) {
  const spec = CATALOG[plan];
  let product = existing.find((p) => p.metadata.plan === plan);
  let state = 'exists';
  if (!product && !args['dry-run']) {
    product = await polar('POST', '/v1/products/', {
      name: spec.name,
      description: spec.description,
      prices: [{ amount_type: 'fixed', price_currency: 'usd', price_amount: spec.cents }],
      ...(spec.interval && { recurring_interval: spec.interval }),
      metadata: { app: 'flex', plan },
    });
    state = 'created';
  }
  products[plan] = product;
  const price = product?.prices?.[0]?.price_amount;
  console.log(`${(product ? state : 'would create').padEnd(13)} ${spec.name.padEnd(28)} ${dollars(spec.cents)}${spec.interval ? `/${spec.interval}` : ' once'}  ${product?.id ?? ''}`);
  if (product && price !== spec.cents) console.log(`  note: its price in Polar is ${dollars(price)}, not ${dollars(spec.cents)}. Change one of them.`);
}

const links = {};
if (args.links && !args['dry-run']) {
  console.log('');
  for (const plan of wanted) {
    const product = products[plan];
    const found = (await listAll(`/v1/checkout-links/?product_id=${product.id}`)).find((l) => l.metadata?.app === 'flex');
    const link =
      found ??
      (await polar('POST', '/v1/checkout-links/', {
        payment_processor: 'stripe',
        products: [product.id],
        label: `flex ${plan}`,
        success_url: `${baseUrl}/thanks?checkout_id={CHECKOUT_ID}`,
        metadata: { app: 'flex', plan },
      }));
    // A link made while BASE_URL was something else still sends buyers back there: point it at the current address.
    const successUrl = `${baseUrl}/thanks?checkout_id={CHECKOUT_ID}`;
    const moved = found && found.success_url !== successUrl;
    if (moved) await polar('PATCH', `/v1/checkout-links/${found.id}`, { success_url: successUrl });
    links[plan] = link.url;
    console.log(`${moved ? 'updated' : found ? 'exists ' : 'created'}  link  ${CATALOG[plan].name.padEnd(28)} ${link.url}${moved ? `  (now returns to ${baseUrl})` : ''}`);
  }
}

let webhookSecret = null;
if (args.webhook && !args['dry-run']) {
  if (!/^https:\/\//.test(args.webhook)) {
    console.error('\n--webhook needs a public https address; Polar cannot reach localhost.');
    process.exit(1);
  }
  const found = (await listAll('/v1/webhooks/endpoints')).find((e) => e.url === args.webhook);
  const endpoint = found ?? (await polar('POST', '/v1/webhooks/endpoints', { url: args.webhook, format: 'raw', events: ['order.paid'], name: 'flex' }));
  webhookSecret = endpoint.secret ?? null;
  console.log(`\n${found ? 'exists' : 'created'}  webhook  ${args.webhook}`);
}

const env = { POLAR_PRODUCT_ID: products.pass?.id, ...(webhookSecret && { POLAR_WEBHOOK_SECRET: webhookSecret }) };
if (args['write-env'] && env.POLAR_PRODUCT_ID) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  let text = await readFile(file, 'utf8').catch(() => '');
  for (const [key, value] of Object.entries(env)) {
    text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${text.replace(/\n?$/, '\n')}${key}=${value}\n`;
  }
  await writeFile(file, text, { mode: 0o600 });
  console.log(`\nSaved ${Object.keys(env).join(' and ')} to app/.env`);
} else if (env.POLAR_PRODUCT_ID) {
  console.log(`\nAdd to app/.env (or run again with --write-env):\n  POLAR_PRODUCT_ID=${env.POLAR_PRODUCT_ID}${webhookSecret ? '\n  POLAR_WEBHOOK_SECRET=<printed once by Polar; use --write-env to save it without showing it>' : ''}`);
}
