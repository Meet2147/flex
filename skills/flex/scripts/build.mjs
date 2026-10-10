#!/usr/bin/env node
// Build the one-page portfolio from portfolio.json.
//
//   node build.mjs portfolio/portfolio.json          → portfolio/index.html
//   node build.mjs portfolio/portfolio.json --og     → also renders portfolio/og.jpg (needs playwright)
//
// Media paths in portfolio.json are relative to the folder that holds it.

import { readFile, writeFile, access } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { og: { type: 'boolean', default: false }, out: { type: 'string' } },
});
if (!positionals[0]) {
  console.error('usage: build.mjs <portfolio.json> [--out <dir>] [--og]');
  process.exit(1);
}

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const dataFile = path.resolve(positionals[0]);
const outDir = path.resolve(args.out ?? path.dirname(dataFile));
const data = JSON.parse(await readFile(dataFile, 'utf8'));
const owner = data.owner ?? {};
const theme = data.theme ?? {};
const apps = data.apps ?? [];
const warnings = [];

if (!apps.length) {
  console.error('portfolio.json has no apps');
  process.exit(1);
}

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Only http(s), mailto and relative links reach the page.
const href = (value) => {
  const url = String(value ?? '').trim();
  return /^(https?:|mailto:|\/|\.|#)/i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url) ? esc(url) : '#';
};
const host = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const exists = (file) => access(file).then(() => true, () => false);
// Looks the page can take. Each is a stylesheet layered over page.css; some only make sense in one colour scheme.
const STYLES = { editorial: {}, genz: { mode: 'light' }, professional: {}, appstore: { mode: 'light' }, apple: {}, glass: { mode: 'dark' }, neumorphism: { mode: 'light' } };
const STYLE_ALIASES = { 'gen-z': 'genz', 'app-store': 'appstore', 'apple-style': 'apple', glassmorphism: 'glass', neomorphism: 'neumorphism', default: 'editorial' };
const styleKey = String(theme.style ?? 'editorial').toLowerCase().trim();
const style = STYLES[styleKey] ? styleKey : (STYLE_ALIASES[styleKey] ?? 'editorial');
if (style !== styleKey && !STYLE_ALIASES[styleKey]) warnings.push(`unknown style "${theme.style}", using editorial. Choose from: ${Object.keys(STYLES).join(', ')}`);
const mode = STYLES[style].mode ?? (theme.mode === 'light' || theme.mode === 'dark' ? theme.mode : null);

const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c ?? '');
// Black or white text, whichever reads better on the colour.
const inkFor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#15140f' : '#ffffff';
};
const colorVars = (hex, name) => (hexOk(hex) ? `--${name}:${hex};--${name}-ink:${inkFor(hex)}` : '');
const emphasis = (text) => esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>');
const pad = (n) => String(n).padStart(2, '0');
const initials = (name) => (name ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

async function media(app, key) {
  const file = app.media?.[key];
  if (!file) return null;
  if (/^https?:/i.test(file)) return file;
  if (await exists(path.join(outDir, file))) return file;
  warnings.push(`${app.slug}: ${key} not found at ${file}`);
  return null;
}

const video = (clip, poster, label) =>
  `<video muted loop playsinline preload="none" data-src="${esc(clip)}"${poster ? ` poster="${esc(poster)}"` : ''} aria-label="${esc(label)} in use"></video>` +
  `<button class="play" type="button" aria-label="Play clip">▶</button>`;
const image = (src, alt, eager) => `<img src="${esc(src)}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">`;

async function stage(app, eager) {
  const [desktop, mobile, clip] = await Promise.all([media(app, 'desktop'), media(app, 'mobile'), media(app, 'clip')]);
  const shots = [];
  for (const [i, shot] of (app.media?.shots ?? []).entries()) {
    if (/^https?:/i.test(shot) || (await exists(path.join(outDir, shot)))) shots.push(shot);
    else warnings.push(`${app.slug}: shot ${i + 1} not found at ${shot}`);
  }

  if (desktop || clip) {
    const screen = `<div class="screen">${clip ? video(clip, desktop, app.name) : image(desktop, `${app.name} screenshot`, eager)}</div>`;
    const phone = mobile ? `<div class="phone">${image(mobile, `${app.name} on a phone`, eager)}</div>` : '';
    if (app.media?.frame === 'none') return `<div class="stage plain">${screen}</div>`;
    return `<div class="stage${phone ? ' has-phone' : ''}">
      <div class="browser"><div class="bar"><span class="dots"><i></i><i></i><i></i></span><span class="host">${esc(host(app.url) || app.name)}</span><span></span></div>${screen}</div>${phone}
    </div>`;
  }
  const phones = [mobile, ...shots].filter(Boolean).slice(0, 3);
  if (phones.length) {
    // Store screenshots usually come with a device already drawn in: "frame": "none" shows them as they are.
    return `<div class="stage phones${app.media?.frame === 'none' ? ' bare' : ''}">${phones.map((src, i) => `<div class="phone">${image(src, `${app.name} screen ${i + 1}`, eager)}</div>`).join('')}</div>`;
  }
  return `<div class="stage empty" aria-hidden="true">${esc(initials(app.name))}</div>`;
}

const list = (items, cls, render) => (items?.length ? `<ul class="${cls}">${items.map(render).join('')}</ul>` : '');
const statusPill = (app) => (app.status ? `<span class="pill ${esc(app.status.toLowerCase())}">${esc(app.status)}</span>` : '');

function actions(app) {
  const links = [...(app.url ? [{ label: app.cta ?? 'Open app', url: app.url }] : []), ...(app.links ?? [])];
  if (!links.length) return '';
  return `<div class="actions">${links
    .map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${href(l.url)}" target="_blank" rel="noopener">${esc(l.label)}${i === 0 ? ' <span aria-hidden="true">↗</span>' : ''}</a>`)
    .join('')}</div>`;
}

async function section(app, n) {
  return `<section class="app" id="${esc(app.slug)}" style="${colorVars(app.accent, 'app')}">
    <div class="copy">
      <div class="app-head"><span class="n">${pad(n)}</span>${statusPill(app)}${app.year ? `<span class="label">${esc(app.year)}</span>` : ''}</div>
      <h2>${esc(app.name)}</h2>
      ${app.tagline ? `<p class="tagline">${esc(app.tagline)}</p>` : ''}
      ${app.description ? `<p class="desc">${esc(app.description)}</p>` : ''}
      ${list(app.highlights, 'points', (h) => `<li>${esc(h)}</li>`)}
      ${list(app.metrics, 'metrics', (m) => `<li><b>${esc(m.value)}</b><span class="label">${esc(m.label)}</span></li>`)}
      ${list(app.stack, 'stack', (s) => `<li>${esc(s)}</li>`)}
      ${actions(app)}
    </div>
    ${await stage(app, n === 1)}
  </section>`;
}

async function card(app) {
  const [desktop, mobile, clip] = await Promise.all([media(app, 'desktop'), media(app, 'mobile'), media(app, 'clip')]);
  const still = desktop ?? mobile ?? app.media?.shots?.[0];
  const tall = !desktop && !clip && still; // phone-shaped still: show it as a phone, not cropped to 16:10
  const screen = clip ? video(clip, still, app.name) : still ? image(still, `${app.name} screenshot`, false) : '';
  const tag = app.url ? 'a' : 'div';
  return `<${tag} class="card" id="${esc(app.slug)}" style="${colorVars(app.accent, 'app')}"${app.url ? ` href="${href(app.url)}" target="_blank" rel="noopener"` : ''}>
    <div class="screen${tall ? ' tall' : ''}">${screen}</div>
    <div class="body"><h3>${esc(app.name)}</h3>${app.tagline ? `<p>${esc(app.tagline)}</p>` : ''}${list((app.stack ?? []).slice(0, 4), 'stack', (s) => `<li>${esc(s)}</li>`)}</div>
  </${tag}>`;
}

async function render({ withOg }) {
  const featuredCount = theme.featuredCount ?? 6;
  const featured = apps.filter((a, i) => a.featured ?? i < featuredCount);
  const rest = apps.filter((a) => !featured.includes(a));
  const ordered = [...featured, ...rest];

  // A page.css beside portfolio.json replaces the default look.
  const localCss = path.join(outDir, 'page.css');
  const [baseCss, js] = await Promise.all([readFile((await exists(localCss)) ? localCss : path.join(ASSETS, 'page.css'), 'utf8'), readFile(path.join(ASSETS, 'page.js'), 'utf8')]);
  const css = style === 'editorial' ? baseCss : `${baseCss}\n${await readFile(path.join(ASSETS, 'styles', `${style}.css`), 'utf8')}`;
  // Tab icon: the owner's initials on the accent colour.
  const iconColour = hexOk(theme.accent) ? theme.accent : '#ff5a1f';
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${iconColour}"/><text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="${inkFor(iconColour)}">${esc(initials(owner.name))}</text></svg>`;
  const name = owner.name ?? 'Portfolio';
  const title = owner.title ?? `${name} — ${apps.length} ${apps.length === 1 ? 'app' : 'apps'} shipped`;
  const description = owner.bio ?? owner.headline?.replace(/\*/g, '') ?? `Everything ${name} has shipped.`;
  const site = owner.site?.replace(/\/$/, '');
  const fonts = theme.fonts === false ? '' : `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=JetBrains+Mono:wght@500&display=swap">`;
  const facts = [
    { value: apps.length, label: apps.length === 1 ? 'app shipped' : 'apps shipped' },
    ...(owner.since ? [{ value: owner.since, label: 'shipping since' }] : []),
    ...(owner.facts ?? []),
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    ...(site && { url: site }),
    ...(owner.bio && { description: owner.bio }),
    sameAs: (owner.links ?? []).map((l) => l.url).filter((u) => /^https?:/.test(u)),
    owns: apps.map((a) => ({ '@type': 'SoftwareApplication', name: a.name, ...(a.url && { url: a.url }), ...(a.tagline && { description: a.tagline }) })),
  };
  const sections = await Promise.all(featured.map((app, i) => section(app, i + 1)));
  const cards = await Promise.all(rest.map(card));
  const contact = [...(owner.email ? [{ label: owner.email, url: `mailto:${owner.email}` }] : []), ...(owner.links ?? [])];

  return `<!doctype html>
<html lang="${esc(owner.lang ?? 'en')}" data-style="${style}"${mode ? ` data-mode="${mode}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="profile">
${site ? `<meta property="og:url" content="${esc(site)}/">\n<link rel="canonical" href="${esc(site)}/">` : ''}
${withOg ? `<meta property="og:image" content="${esc(site ? `${site}/og.jpg` : 'og.jpg')}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
${fonts}
<style>${css}${hexOk(theme.accent) ? `\n:root{${colorVars(theme.accent, 'accent')}}` : ''}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip" href="#apps">Skip to apps</a>
<header class="wrap">
  <div class="top">
    <a class="who" href="${href(site ?? '#')}">
      ${owner.avatar ? `<img src="${esc(owner.avatar)}" alt="">` : `<span class="mono-avatar" aria-hidden="true">${esc(initials(name))}</span>`}
      <span>${esc(name)}${owner.handle ? `<small>${esc(owner.handle)}</small>` : ''}</span>
    </a>
    <nav class="socials" aria-label="Elsewhere">${(owner.links ?? []).map((l) => `<a href="${href(l.url)}" target="_blank" rel="noopener me">${esc(l.label)}</a>`).join('')}</nav>
  </div>
  <div class="hero">
    <span class="label">${esc(owner.role ?? 'Indie developer')}${owner.location ? ` · ${esc(owner.location)}` : ''}</span>
    <h1>${emphasis(owner.headline ?? `Things ${name.split(' ')[0]} has *shipped*.`)}</h1>
    ${owner.bio ? `<p class="bio">${esc(owner.bio)}</p>` : ''}
    <ul class="facts">${facts.map((f) => `<li><b>${esc(f.value)}</b><span class="label">${esc(f.label)}</span></li>`).join('')}</ul>
  </div>
  <ol class="index" aria-label="All apps">${ordered
    .map(
      (app, i) => `<li><a href="#${esc(app.slug)}" style="${colorVars(app.accent, 'app')}">
      <span class="n">${pad(i + 1)}</span><span class="name">${esc(app.name)}</span><span class="tag">${esc(app.tagline ?? '')}</span>
      <span class="meta">${esc([...(app.platforms ?? []), app.year].filter(Boolean).join(' · '))}</span><span class="go" aria-hidden="true">↘</span></a></li>`,
    )
    .join('')}</ol>
</header>
<main class="wrap" id="apps">
${sections.join('\n')}
${cards.length ? `<section class="more"><span class="label">And ${cards.length} more</span><h2>${esc(theme.moreTitle ?? 'Also shipped')}</h2><div class="grid">${cards.join('\n')}</div></section>` : ''}
</main>
<footer class="wrap end">
  <span class="label">Contact</span>
  <h2>${emphasis(owner.cta ?? 'Got an idea? Say hello.')}</h2>
  ${contact.length ? `<div class="actions">${contact.map((l, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${href(l.url)}"${l.url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener me"'}>${esc(l.label)}</a>`).join('')}</div>` : ''}
  <div class="colophon"><span>© ${new Date().getFullYear()} ${esc(name)}</span>${theme.credit === false ? '' : '<span>Made with <a href="https://github.com/Meet2147/flex">/flex</a></span>'}</div>
</footer>
<script>${js}</script>
</body>
</html>
`;
}

const indexFile = path.join(outDir, 'index.html');
let hasOg = await exists(path.join(outDir, 'og.jpg'));
await writeFile(indexFile, await render({ withOg: hasOg }));

if (args.og) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(indexFile).href, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(outDir, 'og.jpg'), type: 'jpeg', quality: 88 });
    await browser.close();
    if (!hasOg) await writeFile(indexFile, await render({ withOg: (hasOg = true) }));
  } catch (error) {
    warnings.push(`og image skipped: ${error.message.split('\n')[0]}`);
  }
}

// The caption to post with the page. Written by whoever wrote portfolio.json, saved beside the page.
if (typeof data.share === 'string' && data.share.trim()) await writeFile(path.join(outDir, 'share-copy.txt'), `${data.share.trim()}\n`);

console.log(JSON.stringify({ index: indexFile, apps: apps.length, og: hasOg, warnings: [...new Set(warnings)] }, null, 2));
