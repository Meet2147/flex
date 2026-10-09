import { config, PLANS, paymentsLive } from './config.mjs';
import { legalPages, LEGAL_UPDATED } from './legal.mjs';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The looks a page can take, in the order the picker shows them.
export const STYLES = [
  ['genz', 'gen z', 'loud, outlined, lowercase'],
  ['editorial', 'editorial', 'big type, warm paper'],
  ['professional', 'professional', 'quiet and corporate-safe'],
  ['appstore', 'app store', 'cards on soft grey'],
  ['apple', 'apple', 'centred, huge, airy'],
  ['glass', 'glass', 'frosted panels, colour blooms'],
  ['neumorphism', 'neumorphism', 'soft, pressed shapes'],
];

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#ff4d00"/><text x="32" y="45" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="34" font-weight="700" fill="#fff">/f</text></svg>`;

const shell = ({ title, description, body, script = true }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${config.baseUrl}/example/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ff4d00">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header class="wrap top">
  <a class="brand" href="/" aria-label="flex home"><b>/flex</b></a>
  <span class="sticker">no login. no template.</span>
  <nav><a href="/#pricing">pricing</a><a href="/example/">example</a><a href="https://github.com/Meet2147/flex">github</a></nav>
</header>
${body}
<footer class="wrap foot">
  <span>payments by polar</span>
  <nav><a href="/terms">terms</a><a href="/acceptable-use">acceptable use</a><a href="/refunds">refunds</a><a href="/privacy">privacy</a>${config.operator.email ? `<a href="mailto:${esc(config.operator.email)}">${esc(config.operator.email)}</a>` : ''}</nav>
  <span>by ${esc(config.operator.name)}</span>
</footer>
${script ? '<script src="/assets/site.js" defer></script>' : ''}
</body>
</html>`;

const yes = '<span class="y">yes</span>';
const no = '<span class="n">no</span>';

// The paste form. With `paid`, the buyer has already paid through a shared link and is choosing what to put on the page.
function maker({ paid = null } = {}) {
  const { free, pass } = PLANS;
  return `<form class="maker" id="maker" novalidate>
    <div class="maker-head"><span>&gt; /flex these</span><i>${paid ? 'paid · thank you' : 'takes ~30s per app'}</i></div>
    <label for="urls">your app links <small>one per line</small></label>
    <textarea id="urls" name="urls" rows="5" required placeholder="https://myapp.com&#10;https://another.app&#10;https://apps.apple.com/app/id123456789" spellcheck="false" autocapitalize="off"></textarea>
    <div class="row">
      <div><label for="name">your name</label><input id="name" name="name" required maxlength="60" autocomplete="name" placeholder="Ada Park"></div>
      <div><label for="handle">handle <small>optional</small></label><input id="handle" name="handle" maxlength="40" placeholder="@adaships" autocapitalize="off"></div>
    </div>
    <fieldset class="vibes">
      <legend>pick a vibe</legend>
      ${STYLES.map(([key, label, hint], i) => `<label title="${esc(hint)}"><input type="radio" name="style" value="${key}"${i === 0 ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('')}
    </fieldset>
    ${
      paid
        ? `<input type="hidden" name="plan" value="pass"><input type="hidden" name="checkout" value="${esc(paid)}">`
        : `<fieldset class="plans">
      <legend class="sr">plan</legend>
      <label class="plan"><input type="radio" name="plan" value="pass" checked>
        <span><b>${pass.name.toLowerCase()} · $${pass.price} once</b><i>up to ${pass.apps} apps, video clips, zip download, hosted 12 months</i></span></label>
      <label class="plan"><input type="radio" name="plan" value="free">
        <span><b>free</b><i>up to ${free.apps} apps, screenshots only</i></span></label>
    </fieldset>`
    }
    <p class="error" id="error" role="alert" hidden></p>
    <button class="go" type="submit" id="go">${paid ? 'make my page →' : `flex for me · $${pass.price} →`}</button>
    <p class="fine">${paid ? 'Your payment is confirmed. This link works once.' : paymentsLive ? 'Checkout by Polar. No account. No page, automatic refund.' : 'Test mode: payments are simulated on this server.'} By ordering you agree to the <a href="/terms">terms</a> and the <a href="/acceptable-use">acceptable use policy</a>.</p>
  </form>`;
}

export function landing() {
  const { free, pass } = PLANS;
  const words = ['real screenshots', 'looping clips', 'copy written for you', 'one link to share', 'no login', 'no template', '7 vibes'];
  return shell({
    title: '/flex — you shipped it. now flex.',
    description: `Paste your app links, get one portfolio page with real screenshots and a clip of every app. Free for ${free.apps} apps, $${pass.price} once for ${pass.apps}.`,
    body: `
<main>
<section class="wrap hero">
  <div class="pitch">
    <span class="tag">for indie devs with too many side projects</span>
    <h1>you shipped it.<br>now <mark>flex.</mark></h1>
    <p class="lede">Paste the links to your apps. Get <b>one page</b> with real screenshots and a clip of every single one. No template to fill in, no screenshots to take.</p>
  </div>
  ${maker()}
  <a class="peek" href="/example/"><img src="/example/og.jpg" alt="An example portfolio page made by flex" width="1200" height="630"><span class="sticker tilt">made from 8 links ↗</span></a>
</section>

<div class="ticker" aria-hidden="true"><div>${[...words, ...words, ...words].map((w) => `<span>${w}</span>`).join('')}</div></div>

<section class="wrap steps">
  <article><span class="num">1</span><h2>paste.</h2><p>Web apps, landing pages, App Store listings. We open each one the way a visitor would, intro screens included.</p></article>
  <article><span class="num">2</span><h2>pay.</h2><p>$${pass.price} once for up to ${pass.apps} apps. Or don't: ${free.apps} apps with screenshots are free.</p></article>
  <article><span class="num">3</span><h2>flex.</h2><p>A few minutes later you have a public page to post and a private link to manage it. Bookmark the private one.</p></article>
</section>

<section class="wrap pricing" id="pricing">
  <span class="tag">pricing</span>
  <h2>free to run yourself.<br>cheap to have us run it.</h2>
  <div class="table"><table>
    <thead><tr><th></th><th>free skill</th><th>hosted free</th><th class="hot">page pass</th><th>pro</th></tr></thead>
    <tbody>
      <tr><th>price</th><td>$0</td><td>$0</td><td class="hot"><b>$${pass.price} once</b></td><td>$9/mo or $79/yr</td></tr>
      <tr><th>runs on</th><td>your machine and agent</td><td>our servers</td><td class="hot">our servers</td><td>our servers</td></tr>
      <tr><th>apps</th><td>unlimited</td><td>${free.apps}</td><td class="hot">${pass.apps}</td><td>unlimited</td></tr>
      <tr><th>video clips</th><td>${yes}</td><td>${no}</td><td class="hot">${yes}</td><td>${yes}</td></tr>
      <tr><th>hosting</th><td>your own</td><td>a link on this site</td><td class="hot">a link on this site, 12 months</td><td>your own domain</td></tr>
      <tr><th>download as zip</th><td>already yours</td><td>${no}</td><td class="hot">${yes}</td><td>${yes}</td></tr>
      <tr><th>refresh</th><td>when you re-run it</td><td>${no}</td><td class="hot">${pass.refreshes} times</td><td>monthly, automatic</td></tr>
      <tr><th>local project folders</th><td>${yes}</td><td>${no}</td><td class="hot">${no}</td><td>${no}</td></tr>
      <tr><th></th><td><a href="https://github.com/Meet2147/flex">install</a></td><td><a href="#maker" data-plan="free">start free</a></td><td class="hot"><a href="#maker" data-plan="pass">get a page pass</a></td><td>not open yet</td></tr>
    </tbody>
  </table></div>
  <form class="waitlist" id="waitlist">
    <label for="wl">want pro? your own domain, auto refresh.</label>
    <span><input id="wl" type="email" name="email" required placeholder="you@example.com" autocomplete="email"><button type="submit">tell me when it opens</button></span>
    <small id="wl-note" role="status"></small>
  </form>
</section>

<section class="wrap faq">
  <span class="tag">good to know</span>
  <dl>
    <div><dt>my app is behind a login.</dt><dd>We only see what a visitor sees, so we capture your public page. To show the app itself, run the free skill on your own machine, where it can start the project locally.</dd></div>
    <div><dt>my site opens on an intro screen.</dt><dd>We click through those automatically. If we miss, add what to click after the link, like <code>https://mysite.com click: Enter</code>, and re-capture.</dd></div>
    <div><dt>what if a capture fails?</dt><dd>That app is left off and the rest of the page is still built. If nothing can be captured on a paid order, it is refunded automatically.</dd></div>
    <div><dt>can i edit the page?</dt><dd>Page Pass includes the zip: one HTML file, your media and a <code>portfolio.json</code> you can change and rebuild with the free skill.</dd></div>
    <div><dt>whose apps can i add?</dt><dd>Your own. Pages that pass off other people's work are removed. See the <a href="/acceptable-use">acceptable use policy</a>.</dd></div>
    <div><dt>can i change the vibe later?</dt><dd>Free pages: make a new one. Page Pass: the zip rebuilds in any style with one line in <code>portfolio.json</code>.</dd></div>
  </dl>
</section>
</main>`,
  });
}

export function thanksPage(checkoutId) {
  return shell({
    title: 'paid. now paste · /flex',
    description: 'Your payment is confirmed. Paste your app links to make your page.',
    body: `
<main>
<section class="wrap hero">
  <div class="pitch">
    <span class="tag">payment confirmed</span>
    <h1>paid.<br>now <mark>paste.</mark></h1>
    <p class="lede">Add up to ${PLANS.pass.apps} app links and pick a vibe. Your page starts building the moment you submit.</p>
  </div>
  ${maker({ paid: checkoutId })}
</section>
</main>`,
  });
}

export function orderPage(order) {
  return shell({
    title: 'your page · /flex',
    description: 'Status of your flex portfolio page.',
    body: `
<main class="wrap order" id="order" data-id="${esc(order.id)}">
  <span class="tag">${esc(PLANS[order.plan].name.toLowerCase())} · for ${esc(order.owner.name)}</span>
  <h1 id="title">working on it…</h1>
  <p class="lede" id="detail">This page updates by itself. Bookmark it: this private link is how you get back to your page.</p>
  <ol class="apps" id="apps"></ol>
  <div class="ready" id="done" hidden></div>
</main>`,
  });
}

export function devPayPage(order) {
  return shell({
    title: 'simulated checkout · /flex',
    description: 'Development checkout.',
    script: false,
    body: `
<main class="wrap order">
  <span class="tag">test mode · no polar keys set</span>
  <h1>pretend to pay $${PLANS.pass.price}</h1>
  <p class="lede">This stands in for the Polar checkout while the server has no payment keys. Nothing is charged.</p>
  <form method="post" action="/dev/pay/${esc(order.id)}"><button class="go" type="submit">simulate a successful payment →</button></form>
</main>`,
  });
}

export function legalPage(slug) {
  const page = legalPages()[slug];
  if (!page) return null;
  return shell({
    title: `${page.title} · /flex`,
    description: `flex ${page.title}.`,
    script: false,
    body: `
<main class="wrap legal">
  <span class="tag">last updated ${LEGAL_UPDATED}</span>
  <h1>${esc(page.title)}.</h1>
  <article>${page.body}</article>
</main>`,
  });
}

export const messagePage = (heading, text, status = '') =>
  shell({ title: `${heading} · /flex`, description: text, script: false, body: `<main class="wrap order">${status ? `<span class="tag">${esc(status)}</span>` : ''}<h1>${esc(heading)}</h1><p class="lede">${text}</p></main>` });

export const notFound = () => messagePage('nothing here.', 'Check the link, or <a href="/">make a page</a>.', '404');
