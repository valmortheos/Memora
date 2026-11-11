// commits.js — commit creation, payload hashing, chain verification

import { sha256Hex, hmacHex, uuid } from './crypto.js';

export function buildPayload(c) {
  return JSON.stringify({
    id: c.id,
    timestamp: c.timestamp,
    tz: c.tz,
    message: c.message,
    content: c.content,
    media: c.media.map(m => ({
      id: m.id, type: m.type, mime: m.mime,
      name: m.name, size: m.size, addedAt: m.addedAt,
      dataHash: m.dataHash
    })),
    prevHash: c.prevHash
  });
}

export async function makeCommit({ content, message, media, prevHash, key }) {
  const mediaWithHash = await Promise.all(media.map(async m => ({
    id: m.id, type: m.type, mime: m.mime,
    name: m.name, size: m.size, addedAt: m.addedAt,
    data: m.data,
    dataHash: m.dataHash || await sha256Hex(m.data)
  })));

  const commit = {
    id: uuid(),
    timestamp: Date.now(),
    tz: 'Asia/Jakarta',
    message: message || 'Auto-save',
    content,
    media: mediaWithHash,
    prevHash: prevHash || 'GENESIS'
  };

  const payload = buildPayload(commit);
  commit.hash = await sha256Hex(payload);
  commit.sig = await hmacHex(key, payload + '|' + commit.hash);
  return commit;
}

/** 
 * Digunakan untuk History Rewrite saat menghapus media.
 * Menghitung ulang hash dan signature untuk commit yang dimodifikasi.
 */
export async function resignCommit(c, prevHash, key) {
  c.prevHash = prevHash;
  const payload = buildPayload(c);
  c.hash = await sha256Hex(payload);
  c.sig = await hmacHex(key, payload + '|' + c.hash);
  return c;
}

export async function verifyChain(state, key) {
  let prev = 'GENESIS';
  for (let i = 0; i < state.commits.length; i++) {
    const c = state.commits[i];
    if (c.prevHash !== prev) {
      return { ok: false, at: i, reason: `Commit #${i + 1}: prevHash putus` };
    }
    const payload = buildPayload(c);
    if (await sha256Hex(payload) !== c.hash) {
      return { ok: false, at: i, reason: `Commit #${i + 1}: hash tidak cocok (data dimodifikasi)` };
    }
    if (await hmacHex(key, payload + '|' + c.hash) !== c.sig) {
      return { ok: false, at: i, reason: `Commit #${i + 1}: signature HMAC invalid` };
    }
    for (const m of c.media) {
      if (await sha256Hex(m.data) !== m.dataHash) {
        return { ok: false, at: i, reason: `Commit #${i + 1}: bytes media "${m.name}" rusak` };
      }
    }
    prev = c.hash;
  }
  return { ok: true };
}

export async function verifyPassphrase(state, key) {
  if (state.commits.length === 0) return true;
  const last = state.commits[state.commits.length - 1];
  const payload = buildPayload(last);
  return (await hmacHex(key, payload + '|' + last.hash)) === last.sig;
}
