// Polar checkout for the one-time Page Pass. Without Polar keys the app runs in dev mode with a simulated payment.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, paymentsLive } from './config.mjs';

async function polar(method, pathname, body) {
  const response = await fetch(`${config.polar.api}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${config.polar.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Polar ${method} ${pathname} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

export async function createCheckout(order) {
  if (!paymentsLive) return { url: `${config.baseUrl}/dev/pay/${order.id}`, checkoutId: null };
  const checkout = await polar('POST', '/v1/checkouts/', {
    products: [config.polar.productId],
    success_url: `${config.baseUrl}/o/${order.id}/paid?checkout_id={CHECKOUT_ID}`,
    return_url: `${config.baseUrl}/`,
    metadata: { order_id: order.id },
    ...(order.email && { customer_email: order.email }),
  });
  return { url: checkout.url, checkoutId: checkout.id };
}

// Used when the buyer lands back on the site before the webhook has arrived, and for checkouts started from a shared link.
export async function checkoutSucceeded(checkoutId) {
  if (!paymentsLive || !/^[0-9a-f-]{36}$/i.test(checkoutId ?? '')) return false;
  const checkout = await polar('GET', `/v1/checkouts/${checkoutId}`);
  const product = checkout.product_id ?? checkout.product?.id;
  return checkout.status === 'succeeded' && (!product || product === config.polar.productId);
}

// Give the money back for an order that produced nothing. Returns what happened so the order can record it.
export async function refundOrder(order) {
  if (!paymentsLive) return { refund: 'not-needed' };
  try {
    let polarOrderId = order.polarOrderId;
    let amount = null;
    if (order.checkoutId) {
      const found = (await polar('GET', `/v1/orders/?checkout_id=${order.checkoutId}&limit=1`)).items?.[0];
      polarOrderId ??= found?.id;
      amount = found?.total_amount ?? null;
    }
    if (!polarOrderId) return { refund: 'manual', refundNote: 'no Polar order found for this checkout' };
    amount ??= (await polar('GET', `/v1/orders/${polarOrderId}`)).total_amount;
    await polar('POST', '/v1/refunds/', { order_id: polarOrderId, reason: 'service_disruption', amount, comment: `flex order ${order.slug}: no page could be made` });
    return { refund: 'refunded', refundedAt: new Date().toISOString(), polarOrderId };
  } catch (error) {
    console.error(`refund for ${order.slug} needs doing by hand: ${error.message}`);
    return { refund: 'manual', refundNote: error.message.slice(0, 200) };
  }
}

// Standard Webhooks: HMAC-SHA256 over "id.timestamp.body", sent as "v1,<base64>".
// Polar secrets made before 8 Sep 2026 key the HMAC with the whole secret string; newer ones with the decoded part after "whsec_".
export function verifyWebhook(headers, rawBody) {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = (headers.get('webhook-signature') ?? '').split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  if (!id || !timestamp || !signatures.length || !config.polar.webhookSecret) return null;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;

  const secret = config.polar.webhookSecret;
  const keys = [Buffer.from(secret, 'utf8'), Buffer.from(secret.replace(/^whsec_/, ''), 'base64')];
  const valid = keys.some((key) => {
    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
    return signatures.some((signature) => {
      const given = Buffer.from(signature, 'base64');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  });
  if (!valid) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
