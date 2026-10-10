---
name: flex
description: Build a one-page portfolio of every app a developer has shipped, with real screenshots and short MP4 clips captured from the apps themselves. Takes project directories, deployed URLs, a folder full of projects, or a mix. Use when someone says "/flex", "make my portfolio", "showcase my apps", "build a page for all my projects", or wants to add an app to an existing /flex portfolio.
---

# /flex

Everything a developer has shipped, on one page. You gather the apps, capture each one actually running, write the copy, and build a single self-contained page they can host anywhere.

The page should make a stranger think "this person ships". Real product on screen, specific words, nothing invented.

Usage: `/flex [inputs…] [options]`. Inputs and options can be flags or plain language.

| Input | How to recognise it | Where the material comes from |
|---|---|---|
| Deployed app | an `http(s)://` URL or bare domain | the live site |
| Project | a path to a directory with source code | the code, plus its deployed URL or a local run |
| Folder of projects | a directory whose children are projects | each child, after the user confirms the list |
| Nothing | no input | ask what to include; offer to scan the current folder |

| Option | Default |
|---|---|
| `--out <dir>` | `portfolio/` in the current directory |
| `--add` | add or refresh apps in an existing `portfolio.json` instead of starting over |
| `--no-video` | stills only |
| `--mode light\|dark\|auto` | auto |
| `--style <name>` | `editorial`; see Styles below |
| `--tone "<direction>"` | none; freeform direction for the look and the words, e.g. `--tone "dry, like release notes"` |
| `--reel [landscape\|vertical\|square]` | off; also make a short video of the whole portfolio |

`<skill-dir>` below is the directory containing this file. Scripts live in `<skill-dir>/scripts/`.

## 0. Check the tools

Needs Node 20+ and `ffmpeg` on `PATH`. If `<skill-dir>/scripts/node_modules` is missing, run `npm install --prefix <skill-dir>/scripts` once. The capture script uses Playwright's Chromium, or the Chrome already installed if there is no bundled browser; it prints the exact install command if neither exists.

## 1. Gather the apps

Build the list of apps before capturing anything.

- **Folder of projects:** list the candidates (name, what it looks like, whether a deployed URL was found) and let the user pick. Never include everything silently: folders hold experiments, client work and clones of other people's repos.
- **Deployed URL for a project:** look in `package.json` (`homepage`), the README, `vercel.json` / `netlify.toml` / `wrangler.toml` / `CNAME`, and `gh repo view --json homepageUrl` if `gh` is available. A live URL is always the best capture source.
- **No deployed URL:** run the project locally (its own dev or preview command) and capture `http://localhost:<port>`. Stop the server afterwards. If it needs secrets or a database you do not have, do not fake it; fall back to the next option.
- **Not a web app** (iOS, Android, desktop, CLI, extension, library): use what exists. App Store or Play listing screenshots, images or GIFs in the README, a `screenshots/` or `fastlane/screenshots/` folder, a marketing site. For an iOS project you can build, simulator screenshots work. For a CLI, a terminal recording or a styled still of real output. Copy what you use into `<out>/media/<slug>/`.

Also collect the owner: name, handle, one-line headline, short bio, links, contact email. Take them from `git config`, the GitHub profile, or an existing personal site, then confirm with the user. Ask once, in one message, for anything you could not find.

## 2. Understand each app

For every app answer, from the code or the live site: What is it, in one sentence? Who is it for? What is the one thing it does that is worth showing? What does it look like in use (entry → key action → result)? What is it built with? Is it live, in beta, or still being built?

Write entries into `<out>/portfolio.json` (schema below). Copy rules:

- **Specific.** Use the app's own words and claims. "Streamline your workflow" is banned.
- **Tagline:** under 10 words, says what it does. **Description:** one or two sentences. **Highlights:** up to three, each a concrete capability.
- **Nothing invented.** No made-up users, revenue, ratings, testimonials or awards. Metrics appear only if the user supplied them or you can read them from a source you can cite (GitHub stars, a public stats page).
- **Stack** comes from the manifest files, not from guessing. Four to six entries.
- **Order** by what impresses most, not by date. The first three get the most attention.
- **Nothing private.** Do not surface secrets, internal URLs, client names or unreleased work the user has not cleared.

## 3. Capture

Write a batch file and run it once:

```bash
node <skill-dir>/scripts/capture.mjs --batch <out>/capture.json --out <out>/media
```

```json
[
  { "slug": "my-app", "url": "https://my-app.com" },
  { "slug": "other", "url": "http://localhost:3000", "plan": [ … ] }
]
```

Each app gets `<out>/media/<slug>/desktop.jpg`, `mobile.jpg`, `clip.mp4` (1280×800, about 7s, no audio) and `meta.json` (title, description, colours, fonts, headings, store links). Flags: `--no-video`, `--no-mobile`, `--no-desktop`, `--scheme dark`, `--duration <s>`, `--wait <ms>` for slow apps, `--keep-overlays`. Consent banners are declined or hidden, never accepted.

### Capture plans

With no plan the clip is a smooth scroll down the page and back, which suits landing pages. An app that is used rather than read needs a plan that shows it in use. Steps run in order while the screen is recorded:

| Step | Fields |
|---|---|
| `wait` | `ms` |
| `scroll` | `to`: 0–1 fraction of the page, a pixel offset, or a CSS selector; `ms` |
| `click` | `selector`, `ms` to hold afterwards |
| `hover` | `selector` |
| `type` | `selector`, `text`, optional `delay` per key |
| `press` | `key` (for example `Enter`) |
| `goto` | `url`, relative or absolute |

A cursor is drawn for click, hover and type. Selectors are Playwright selectors, so `button:has-text('Export')` works. Keep clips to 5–9 seconds, and end where they began (scroll back to the top, or return to the first screen) so the loop is seamless. Type only harmless sample input; never real credentials, and never submit anything that sends a message, places an order or changes data on a live service.

An intro, splash or "tap to enter" screen is clicked through automatically (`meta.json` then has `"passedIntro": true`; `--no-auto-enter` turns this off). If the stills still show the intro, add `"setup": [ …steps ]` beside `plan`. Setup steps run before the stills and before recording starts, so the screenshots and the clip both show the app itself.

Pages that scroll inside a container rather than the document will not move with `scroll`; use `click` and `hover` steps instead.

### Review before building

Look at every `desktop.jpg` and `mobile.jpg`, and at two or three frames of each clip (`ffmpeg -i clip.mp4 -vf "select='eq(n,30)+eq(n,120)',tile=2x1" -frames:v 1 sheet.jpg`). Re-capture anything showing a loading spinner, an error page, a login wall, a leftover banner, or a blank section. A login wall means the public marketing page is the capture target, or the user supplies screenshots. One bad capture drags down the whole page; a missing clip is better than a broken one.

Use `meta.json` to set each app's `accent` (check it against the screenshot; pick the colour a person would call the app's colour) and to fill store and GitHub links.

## 4. Build

```bash
node <skill-dir>/scripts/build.mjs <out>/portfolio.json --og
```

This writes `<out>/index.html` with styles and script inlined, and `og.jpg` for link previews. Media paths are relative, so the folder is the whole site.

### portfolio.json

```json
{
  "owner": {
    "name": "Ada Park", "handle": "@adaships", "role": "Indie developer", "location": "Lisbon",
    "headline": "I build *small tools* for people who edit video.",
    "bio": "One or two sentences.", "since": 2019, "avatar": "media/avatar.jpg",
    "email": "ada@example.com", "site": "https://adapark.dev",
    "links": [{ "label": "GitHub", "url": "https://github.com/ada" }],
    "facts": [{ "value": "40k", "label": "downloads" }],
    "cta": "Got an idea? *Say hello.*"
  },
  "share": "A caption to post with the page.",
  "theme": { "style": "editorial", "tone": "", "mode": "auto", "accent": "#ff5a1f", "featuredCount": 6, "fonts": true, "credit": true },
  "apps": [
    {
      "slug": "cutlist", "name": "Cutlist", "year": 2025, "status": "Live", "platforms": ["Web", "macOS"],
      "tagline": "Turn a transcript into a rough cut.",
      "description": "One or two sentences.",
      "highlights": ["Up to three concrete capabilities"],
      "metrics": [{ "value": "1.2k", "label": "GitHub stars" }],
      "stack": ["SvelteKit", "Rust", "SQLite"],
      "url": "https://cutlist.app", "cta": "Open app",
      "links": [{ "label": "Source", "url": "https://github.com/ada/cutlist" }],
      "accent": "#7c5cff", "featured": true,
      "media": { "desktop": "media/cutlist/desktop.jpg", "mobile": "media/cutlist/mobile.jpg", "clip": "media/cutlist/clip.mp4", "shots": [], "frame": "browser" }
    }
  ]
}
```

- `*asterisks*` in `headline` and `cta` mark the words set in the accent colour.
- `status` is `Live`, `Beta`, `Building` or anything else; the first three get a coloured dot.
- The first `featuredCount` apps get full sections; the rest go in a compact grid. `featured` on an app overrides that.
- Media decides the layout: `desktop` or `clip` gives a browser frame, with `mobile` overlapping as a phone. Only `mobile` and `shots` gives a row of up to three phones, which is right for native mobile apps. `"frame": "none"` drops the browser chrome for desktop apps and terminal captures, and drops the phone bezel for store screenshots that already have a device drawn in. No media gives a monogram tile.
- `owner.site` is the final address if known; it makes link previews work with absolute URLs.
- Only `owner.name` and each app's `slug` and `name` are required.

### Styles

`theme.style` picks the look. Choose one that suits the developer and their apps, or use what they ask for; do not default everyone to the same one.

| Style | Feel | Suits |
|---|---|---|
| `editorial` | Big type on warm paper, each app tinted its own colour | The default; most portfolios |
| `genz` | White and orange, thick outlines, hard shadows, lowercase | Playful products, a loud personal brand |
| `professional` | Quiet, neutral, small radii | Job hunting, client work, B2B tools |
| `appstore` | White cards on soft grey, pill buttons | Mostly mobile apps |
| `apple` | Centred, huge headlines, lots of air, one column | A few polished apps with strong visuals |
| `glass` | Frosted panels over colour blooms; dark only | Design tools, anything visual |
| `neumorphism` | One soft surface, raised and pressed shapes; light only | Calm utilities, a small set of apps |

`genz`, `appstore` and `neumorphism` are light only and `glass` is dark only; the others follow `theme.mode`. Match the copy to the look: `genz` wants short, casual lines, `professional` wants complete, measured sentences. The rule against inventing anything holds in every voice.

### Freeform direction

A style is a starting point, not a limit. Record the direction as `theme.tone` in `portfolio.json` so a later rebuild or `--add` keeps the same voice. When the user gives direction in their own words ("make it feel like a zine", "dry, like release notes", "fake Series A energy"), let it shape the copy first: word choice, sentence length, the headline and the closing line. If it also implies a look no preset covers, copy `<skill-dir>/assets/page.css` to `<out>/page.css` and change the tokens there. Direction changes the voice, never the facts.

### Then look at the page

Open `<out>/index.html` and check it at desktop and phone width, light and dark. Fix copy that wraps badly, accents that clash, and any app whose section looks weaker than the rest. The default look is meant to be used as is. If the user asks for a different one, copy `<skill-dir>/assets/page.css` to `<out>/page.css` and edit the tokens at the top; the build picks up that copy.

## 5. Reel and share copy

**Share copy.** Always put a `"share"` string at the top level of `portfolio.json`: one to three sentences the developer can post as they are, with the page's link if `owner.site` is known. The build writes it to `<out>/share-copy.txt`. Specific to these apps, in the page's voice, addressed to the reader. No "excited to share", no hashtags unless asked.

**Reel.** When asked for a reel, a video, or something to post, or with `--reel`:

```bash
node <skill-dir>/scripts/reel.mjs <out>/portfolio.json                    # reel.mp4, 1920×1080
node <skill-dir>/scripts/reel.mjs <out>/portfolio.json --format vertical  # reel-vertical.mp4, 1080×1920
node <skill-dir>/scripts/reel.mjs <out>/portfolio.json --format square    # reel-square.mp4, 1080×1080
```

It needs the page to be built first, because it reuses each app's captured clip. The reel opens on the owner's headline, gives every app a beat with its name, tagline and clip (up to eight apps, in page order), and closes on `owner.cta` and the site address. It runs 12 to 22 seconds at 120 bpm with its own synthesized soundtrack; `--no-music` leaves it silent. A poster image is written beside it and baked in as the first frame.

Look at a few frames before handing it over (`ffmpeg -i reel.mp4 -vf "select='eq(n,45)+eq(n,150)+eq(n,400)',tile=3x1" -frames:v 1 sheet.jpg`): names that wrap badly or a tagline that is too long for the frame are fixed in `portfolio.json`, then re-run. Use vertical for Reels, Shorts and TikTok, landscape for X and LinkedIn. For a full launch video of a single app, the `brag` skill does that better.

## 6. Deliver

Tell the user where the page is, how many apps made it in, and which ones fell back to stills or were skipped and why. Point them to `share-copy.txt`, and to the reel if one was made. Then offer:

- **Hosting.** The folder is a static site. Any of these is free: GitHub Pages (push the folder, enable Pages), Cloudflare Pages or Netlify (drag the folder in), Vercel (`vercel deploy` from the folder). Deploy only when the user asks, since it makes the page public.
- **Updates.** `/flex --add <url or dir>` appends an app; re-running capture for one slug refreshes it. `portfolio.json` is theirs to edit by hand.
- **A reel.** If none was made, offer one: it takes under a minute from the clips already captured.
- **A launch video per app.** If the `brag` skill is installed, any app on the page can get one.
