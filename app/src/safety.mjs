// This service loads URLs supplied by strangers, so every one is checked before a browser goes near it.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class UrlError extends Error {}

function privateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return privateAddress(v6.slice(7));
  return v6 === '::1' || v6 === '::' || /^(fc|fd|fe[89ab])/.test(v6);
}

export async function checkUrl(input) {
  let raw = String(input ?? '').trim();
  if (!raw) throw new UrlError('Empty URL');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlError(`Not a valid URL: ${input}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new UrlError(`Only http and https links work: ${input}`);
  if (url.username || url.password) throw new UrlError(`Links with a username or password are not accepted: ${url.host}`);
  if (url.port && !['80', '443'].includes(url.port)) throw new UrlError(`Links on a custom port are not accepted: ${url.host}`);
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.')) throw new UrlError(`Use the app's public domain, not ${url.hostname}`);

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new UrlError(`Could not find ${url.hostname}. Is the address right?`);
  }
  if (!addresses.length || addresses.some((a) => privateAddress(a.address))) throw new UrlError(`${url.hostname} is not a public address`);
  url.hash = '';
  return url.href;
}

export const appStoreId = (url) => {
  const parsed = new URL(url);
  const match = parsed.hostname === 'apps.apple.com' && parsed.pathname.match(/\/id(\d{6,12})/);
  return match ? { id: match[1], country: parsed.pathname.split('/')[1]?.length === 2 ? parsed.pathname.split('/')[1] : 'us' } : null;
};
