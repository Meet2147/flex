# /flex: product, stack and pricing

Working notes. Prices marked *(third-party)* come from comparison articles, not the vendor's own page; confirm before relying on them.

## The model, copied from brag

brag has two halves, and so should this:

| | brag | /flex |
|---|---|---|
| Free, open source | `/brag` skill, runs in your own agent | `/flex` skill, runs in your own agent |
| Paid, hosted | letsbrag.app: paste a URL, pay $19 once, get a video | paste your app URLs, get a hosted portfolio page |
| Why people pay | no setup, no agent subscription needed | same, plus hosting, a domain and a page that stays current |

The free skill is the marketing. Every page it builds carries a "Made with /flex" link, and developers who see one are exactly the audience.

One difference matters for pricing. A launch video is finished the moment it renders, so a one-time price fits. A portfolio goes stale: new apps ship, old ones get redesigned. That ongoing upkeep is what justifies a subscription, and it is the only thing that does.

## What is free and what is paid

| | Free skill | Hosted free | Page Pass | Pro |
|---|---|---|---|---|
| Price | $0 | $0 | **$29 once** | **$9/mo or $79/yr** |
| Where it runs | your machine, your agent | our servers | our servers | our servers |
| Apps | unlimited | 3 | 12 | unlimited |
| Screenshots | yes | yes | yes | yes |
| MP4 clips | yes | no | yes | yes |
| Hosting | bring your own | `you.letsflex.app` | `you.letsflex.app`, 12 months | custom domain |
| Download as a zip | it is already yours | no | yes | yes |
| Re-capture | whenever you run it | no | 3 refreshes | automatic monthly, or on demand |
| "Made with" badge | on (removable, it is MIT) | on | on | off |
| Click analytics per app | no | no | no | yes |
| Private local projects | yes | no, URLs only | no, URLs only | no, URLs only |

Also offer a **Founding lifetime plan at $149**, capped at the first 200 buyers and at 12 re-captures a year. Indie developers buy lifetime deals readily, and 200 sales is about $30k to fund the build. The caps stop it becoming an open-ended cost.

### Why these numbers

- **$29 once.** brag charges $19 for one video of one site. A page covering up to 12 apps, each with its own clip, is worth more than that but must stay an impulse buy. $29 is below the point where an indie developer stops to think.
- **$9/mo, $79/yr.** In the range of link-in-bio and simple site builders, which is the mental comparison buyers will make. The yearly price is roughly 27% off, enough to pull most people to annual and cut churn.
- **Free hosted tier with 3 apps and no video.** Enough to produce a real page and share it, which spreads the badge. Video is the visible upgrade and the costliest part to produce, so it sits behind payment.
- **Local folders stay free-only.** The hosted service cannot see a developer's disk, and should not ask for source code. This also keeps the free skill better than the paid product at something, so it never feels crippled.

### Cost to serve (estimate, not measured)

Capturing one app took about 25 seconds of browser time on a laptop in testing. A 10-app page is therefore around 4 to 5 minutes of headless browser plus encoding, and one language-model call per app to write the copy. That should land well under $1 per page. Stored media was about 2.4 MB per app, so storage and bandwidth are negligible on a host with free egress. Measure both before launch; the model cost is the one that could surprise.

At $29, with payment fees near 4% plus $0.40 *(third-party)*, gross margin should be above 90%.

## Tech stack

### The free skill (built, in this repo)

| Part | Choice | Why |
|---|---|---|
| Packaging | Agent Skill + Claude Code plugin manifest | same shape as brag; works in Claude Code, Codex, Cursor and others |
| Capture | Playwright driving Chromium, recorded through the DevTools screencast | real frames at real timing, supports scripted clicks and typing |
| Encoding | ffmpeg, H.264, 1280×800, no audio | plays everywhere, about 1 to 1.5 MB per clip |
| Page | one HTML file with inlined CSS and JS, no framework | hostable anywhere, nothing to break |
| Data | `portfolio.json` | editable by hand, rebuilds in under a second |

### The hosted service (first version built, in `app/`)

Built as one container, not the Cloudflare split first sketched here. A single Node service is far less to operate while there are few orders, and the capture step needs a real container either way.

| Part | Choice now | Move to, when it hurts |
|---|---|---|
| Web app and API | Node 20 + Hono, server-rendered HTML | same |
| Capture and build | the skill's own `capture.mjs` and `build.mjs`, run as child processes | separate worker containers behind a queue |
| Queue | in-process, one order at a time | a hosted queue once orders overlap often |
| Storage | JSON files and page folders on a persistent disk | Postgres for orders, R2 for media ($0.015 per GB-month, no egress fees) |
| Copywriting | Claude API, one request per order, structured output | same |
| Hosting | Docker on Render with a disk | same, or Fly |
| Custom domains (Pro) | not built | Cloudflare for SaaS: 100 hostnames included, then $0.10 each per month |
| Auth | none: each order has a private link | email magic link when Pro arrives |
| Payments | Polar, already used for Tapri and Cairn | same |

Polar acts as merchant of record and handles sales tax. Its fees are roughly 4 to 5% plus 40 to 50 cents *(third-party; confirm on Polar's pricing page)*.

## Risks worth knowing

- **Login walls.** Many real apps sit behind sign-in, so the hosted version can only capture the marketing page. The free skill handles this better because it can run the project locally. Say so plainly on the pricing page.
- **Capturing sites the buyer does not own.** Anyone can paste any URL. Needs an acceptable-use policy and a takedown route, as brag has.
- **Lifetime plans and recurring cost.** Hence the caps.
- **The name.** "flex" is a common word, so a trademark on the bare name is unlikely and other products use it. `letsflex.app` had no DNS records when checked on 10 October 2026, which is a good sign but not proof it is free: confirm with a registrar.

## Suggested order

1. Publish the free skill and the demo page. Watch whether people run it.
2. Sell Page Pass with no accounts: paste URLs, pay, receive a private link. This is the smallest paid product and tests willingness to pay.
3. Add Pro (domains, refresh, analytics) only once Page Pass buyers ask how to keep their page current.
