// codec.js — encode/decode .memento (XOR + Base64 + envelope)

import { bytesToBase64, base64ToBytes } from './crypto.js';

const MAGIC = 'MEMENTOv1::';
const XOR_KEY = 'Memora-Obfuscation-Key-v1::do-not-rely-on-this-for-security';
const enc = new TextEncoder();
const dec = new TextDecoder();

function xorBytes(bytes, key) {
  const keyBytes = enc.encode(key);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  return out;
}

/** Serialize state → string envelope MEMENTOv1::<b64> */
export function encodeMemento(state) {
  const json = JSON.stringify(state);
  const bytes = enc.encode(json);
  const xored = xorBytes(bytes, XOR_KEY);
  return MAGIC + bytesToBase64(xored);
}

/** Parse envelope → state object (throws on invalid format) */
export function decodeMemento(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith(MAGIC)) {
    throw new Error('Format file tidak valid (bukan .memento)');
  }
  const b64 = trimmed.slice(MAGIC.length).replace(/\s+/g, '');
  const xored = base64ToBytes(b64);
  const bytes = xorBytes(xored, XOR_KEY);
  const json = dec.decode(bytes);
  const state = JSON.parse(json);
  if (state?.app !== 'Memora') throw new Error('Bukan file Memora');
  if (!state.noteId) throw new Error('File rusak: noteId tidak ada');
  if (!Array.isArray(state.commits)) throw new Error('File rusak: commits bukan array');
  return state;
}
