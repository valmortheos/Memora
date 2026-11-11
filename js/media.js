// media.js — validasi, konversi, render media (hash dihitung saat upload)

import { base64ToBytes, uuid, sha256Hex } from './crypto.js';

export const LIMITS = {
  image: { max: 2  * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  audio: { max: 10 * 1024 * 1024, mimes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'] },
  video: { max: 50 * 1024 * 1024, mimes: ['video/mp4', 'video/webm'] }
};

export function detectMediaType(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Gagal baca file'));
    reader.readAsDataURL(file);
  });
}

export async function processMediaFile(file) {
  const type = detectMediaType(file);
  if (!type) throw new Error(`Format file tidak didukung: ${file.name}`);
  const limits = LIMITS[type];
  if (!limits.mimes.includes(file.type)) {
    throw new Error(`Format ${file.type || 'tidak dikenal'} tidak didukung untuk ${type}`);
  }
  if (file.size > limits.max) {
    const mb = (limits.max / 1024 / 1024).toFixed(0);
    throw new Error(`${file.name}: melebihi batas ${mb} MB`);
  }
  const data = await fileToBase64(file);
  const dataHash = await sha256Hex(data);      // ← HASH DI SINI (sekali)
  return {
    id: uuid(),
    type,
    mime: file.type,
    name: file.name,
    size: file.size,
    addedAt: Date.now(),
    data,
    dataHash
  };
}

export function createMediaEl(m, { onOpen } = {}) {
  const el = document.createElement('div');
  el.className = `media-thumb media-${m.type}`;
  el.title = `${m.name} (${formatBytes(m.size)})`;

  if (m.type === 'image') {
    const img = document.createElement('img');
    img.src = `data:${m.mime};base64,${m.data}`;
    img.alt = m.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    el.appendChild(img);
  } else {
    const icon = document.createElement('div');
    icon.className = 'media-icon';
    const i = document.createElement('i');
    i.className = m.type === 'audio' ? 'fa-solid fa-music' : 'fa-solid fa-film';
    icon.appendChild(i);
    el.appendChild(icon);
  }

  const label = document.createElement('div');
  label.className = 'media-label';
  label.textContent = m.name;
  el.appendChild(label);

  if (onOpen) el.addEventListener('click', () => onOpen(m));
  return el;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function mediaToObjectURL(m) {
  const bytes = base64ToBytes(m.data);
  return URL.createObjectURL(new Blob([bytes], { type: m.mime }));
}
