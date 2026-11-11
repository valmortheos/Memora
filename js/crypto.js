// crypto.js — SHA-256, HMAC-SHA256, PBKDF2, UUID fallback

export function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * UUID v4 dengan fallback kompatibel:
 *  1. crypto.randomUUID()  → modern secure context
 *  2. crypto.getRandomValues() → luas, secure context
 *  3. Math.random() → last resort (WebView minim, tidak kriptografis)
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* fallthrough */ }
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant RFC 4122
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  console.warn('[Memora] crypto.getRandomValues tidak tersedia — memakai fallback lemah (Math.random).');
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Cek apakah Web Crypto (crypto.subtle) tersedia. */
export function hasWebCrypto() {
  return typeof crypto !== 'undefined' && !!crypto.subtle &&
         typeof crypto.subtle.digest === 'function';
}

function requireSubtle() {
  if (!hasWebCrypto()) {
    throw new Error('Web Crypto (crypto.subtle) tidak tersedia. Gunakan HTTPS/localhost dan browser modern.');
  }
}

export async function sha256Hex(data) {
  requireSubtle();
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function deriveKey(passphrase, salt) {
  requireSubtle();
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign']
  );
}

export async function hmacHex(key, data) {
  requireSubtle();
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = await crypto.subtle.sign('HMAC', key, buffer);
  return bytesToHex(new Uint8Array(sig));
}
