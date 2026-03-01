// Shared Clerk JWT verification for Cloudflare Workers
// Uses the JWKS endpoint directly instead of @clerk/backend

const JWKS_URL = 'https://skilled-skylark-78.clerk.accounts.dev/.well-known/jwks.json';

let cachedJWKS = null;
let cachedAt = 0;

async function getJWKS() {
  const now = Date.now();
  // Cache JWKS for 10 minutes
  if (cachedJWKS && now - cachedAt < 600_000) return cachedJWKS;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  const data = await res.json();
  cachedJWKS = data;
  cachedAt = now;
  return data;
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

async function importKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyClerkToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');

  // Get the signing key
  const jwks = await getJWKS();
  const key = jwks.keys.find(k => k.kid === header.kid);
  if (!key) throw new Error('Signing key not found');

  // Verify signature
  const cryptoKey = await importKey(key);
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const signature = base64urlDecode(parts[2]);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signature,
    data
  );

  if (!valid) throw new Error('Invalid signature');

  return payload;
}
