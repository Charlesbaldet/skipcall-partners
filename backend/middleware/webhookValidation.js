// SSRF guard for webhook URLs supplied by API clients. We resolve the
// hostname (IPv4 + IPv6) and reject any address that lives in private
// or loopback ranges so a tenant can't trick us into firing a POST
// against the metadata service or a sibling on the internal network.

const { URL } = require('url');
const dns = require('dns').promises;

function isPrivateIPv4(addr) {
  if (!addr) return false;
  return (
    addr.startsWith('10.') ||
    addr === '127.0.0.1' || addr.startsWith('127.') ||
    addr.startsWith('192.168.') ||
    addr.startsWith('169.254.') ||           // AWS / GCP metadata
    addr.startsWith('0.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(addr)  // 172.16.0.0/12
  );
}

function isPrivateIPv6(addr) {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return a === '::1' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80:');
}

async function validateWebhookUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL format.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS.');
  }

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw new Error('Webhook URL cannot point to localhost.');
  }

  // If the hostname IS already an IP literal, validate it directly —
  // the dns.resolve* call below would fail on that input.
  const isIPv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIPv4Literal) {
    if (isPrivateIPv4(host)) throw new Error('Webhook URL points to a private IP address.');
    return;
  }
  if (host.includes(':')) {
    if (isPrivateIPv6(host)) throw new Error('Webhook URL points to a private IPv6 address.');
    return;
  }

  let v4 = [], v6 = [];
  try { v4 = await dns.resolve4(host); } catch { /* ignore — host might be IPv6-only */ }
  try { v6 = await dns.resolve6(host); } catch { /* ignore — host might be IPv4-only */ }
  if (v4.length === 0 && v6.length === 0) {
    throw new Error('Cannot resolve webhook URL hostname.');
  }
  for (const a of v4) if (isPrivateIPv4(a)) throw new Error('Webhook URL resolves to a private IP address.');
  for (const a of v6) if (isPrivateIPv6(a)) throw new Error('Webhook URL resolves to a private IPv6 address.');
}

module.exports = { validateWebhookUrl };
