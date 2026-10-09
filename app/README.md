# /flex hosted service

Paste app links, get a portfolio page. This is the paid half of /flex: it runs the same capture and build scripts as the free skill, on a server, behind a checkout.

## What works today

- Landing page with the pricing table, the paste form and a Pro waitlist
- **Hosted free:** up to 3 apps, screenshots only, 3 pages a day per IP
- **Page Pass:** up to 12 apps, video clips, zip download, 3 re-captures; paid through Polar
- A private status link per order (`/o/<id>`) and a public page (`/p/<slug>/`)
- App Store links: the listing's own screenshots are used
- Links are checked before a browser opens them: public http(s) hosts only

Also in place: seven page styles chosen on the form, automatic click-through of intro screens, automatic refunds when a paid order produces nothing, page expiry 12 months after a Page Pass page is first ready, and terms, acceptable use, refund and privacy pages.

Not built yet: Pro (accounts, custom domains, monthly refresh, analytics) and email.

## Run it locally

```bash
npm install --prefix skills/flex/scripts
npm install --prefix app
node app/src/server.mjs
```

Open http://localhost:4400. With no Polar keys, choosing Page Pass leads to a "simulate payment" page instead of a real checkout, so the whole flow can be tried without money. With no Claude credentials, the copy falls back to each site's own title and description.

Settings are environment variables; see [.env.example](.env.example). Node does not read `.env` by itself: use `node --env-file=app/.env app/src/server.mjs`.

## Switching on payments (Polar)

Put a Polar organization access token in `app/.env` as `POLAR_ACCESS_TOKEN`, then:

```bash
node --env-file=app/.env app/scripts/polar-setup.mjs --links --write-env
```

That creates the Flex Page Pass product ($29, one-time) and a shareable checkout link, and saves the product id. It is safe to re-run: existing products and links are reused. `--plans all` also creates Pro monthly, Pro yearly and the Founding lifetime plan; `--dry-run` shows what would happen. Token scopes needed: `products:read`, `products:write`, `checkouts:read`, `checkouts:write`, `checkout_links:write`, `orders:read`, `refunds:write`, and `webhooks:write` for `--webhook`.

Two ways a customer pays:

- **From the site form.** A checkout session is created for that order, and Polar sends the buyer back to `/o/<id>/paid`, where the payment is confirmed with Polar before capture starts.
- **From the shared checkout link.** Polar sends the buyer to `/thanks`, where they paste their links. Each payment can be exchanged for one page. The link's return address is fixed when the link is created, so re-create it once `BASE_URL` is the real domain.

Once the site has a public address, add the webhook so payment is confirmed even if the buyer closes the tab:

```bash
node --env-file=app/.env app/scripts/polar-setup.mjs --webhook https://your-domain/api/webhooks/polar --write-env
```

Not yet verified with a real payment: the return-from-checkout confirmation, the webhook, and the automatic refund. Buy one pass yourself (a 100% discount code in Polar makes that free) and watch the order move from "waiting for payment" to capturing.

## Switching on copywriting (Claude)

Set `ANTHROPIC_API_KEY`. One request per order reads every app's captured text and a screenshot and returns the headline, bio and each app's copy. `FLEX_MODEL` defaults to `claude-opus-5-5`; `claude-haiku-5-5` costs a fraction of that and is worth comparing on real orders.

## Deploy

The service needs Chromium, ffmpeg and a disk, so it runs as a Docker container. [render.yaml](../render.yaml) is a Render blueprint: a web service built from [Dockerfile](Dockerfile) with a persistent disk at `/data`. Render's free plan has no disks, so this needs a paid instance.

```bash
docker build -f app/Dockerfile -t flex-app .
```

## How an order moves

`awaiting_payment` → `queued` → `capturing` → `writing` → `building` → `ready` (or `failed`).

Orders are JSON files under `DATA_DIR/orders`, pages under `DATA_DIR/pages/<slug>`. One order is processed at a time; interrupted orders resume on restart. That is right for one instance and wrong for two: move to a database and a real queue before scaling out.

## Known gaps

- **Intro screens** are clicked through automatically. When that misses, the customer can add `click: <text>` after a link. Neither helps with a multi-step intro.
- **Refunds** are attempted automatically when a paid order produces no page. If the Polar call fails the order is marked `refund: manual` with the reason; check for those.
- **Policy pages** are a starting draft, not legal advice. Set `OPERATOR_NAME`, `OPERATOR_LOCATION` and `SUPPORT_EMAIL`, and have them reviewed.
- **Private-address protection** checks DNS at submit time and blocks private hosts in the browser, but does not defend against DNS rebinding. Run the container with no access to internal networks.
