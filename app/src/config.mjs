import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4400),
  baseUrl: (env.BASE_URL ?? `http://localhost:${env.PORT ?? 4400}`).replace(/\/$/, ''),
  dataDir: path.resolve(env.DATA_DIR ?? path.join(here, '..', 'data')),
  appDir: path.join(here, '..'),
  scriptsDir: path.resolve(env.FLEX_SCRIPTS_DIR ?? path.join(here, '..', '..', 'skills', 'flex', 'scripts')),
  isProduction: env.NODE_ENV === 'production',
  polar: {
    token: env.POLAR_ACCESS_TOKEN ?? '',
    productId: env.POLAR_PRODUCT_ID ?? '',
    webhookSecret: env.POLAR_WEBHOOK_SECRET ?? '',
    sandbox: env.POLAR_SANDBOX === 'true',
    api: env.POLAR_SANDBOX === 'true' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh',
  },
  // Who runs the service. Shown on the policy pages, so set these before going live.
  operator: { name: env.OPERATOR_NAME ?? 'Dashovia Innovations', location: env.OPERATOR_LOCATION ?? '', email: env.SUPPORT_EMAIL ?? '' },
  model: env.FLEX_MODEL ?? 'claude-opus-5-5',
  // The SDK also accepts ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile; this flag only gates the attempt.
  copywriting: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
  freePagesPerDay: Number(env.FREE_PAGES_PER_DAY ?? 3),
  captureTimeoutMs: 150_000,
};

export const PLANS = {
  free: { name: 'Hosted free', price: 0, apps: 3, video: false, refreshes: 0, zip: false, reel: false },
  pass: { name: 'Page Pass', price: 29, apps: 12, video: true, refreshes: 3, zip: true, reel: true, hostedDays: 365 },
};

// The webhook is optional: without it, an order is confirmed when the buyer returns from checkout.
export const paymentsLive = Boolean(config.polar.token && config.polar.productId);
