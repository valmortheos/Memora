// storage.js — IndexedDB draft (split: full state, current text, pending media)

const DB_NAME = 'memora';
const STORE   = 'drafts';
const KEY_FULL    = 'current';   // full state (di-save saat commit/import)
const KEY_TEXT    = 'text';      // konten editor saja (di-save tiap ketik)
const KEY_PENDING = 'pending';   // media yang belum di-commit

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Simpan full state (commit/import). Sekaligus sinkronkan KEY_TEXT. */
export async function saveDraft(state) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const now = Date.now();
    store.put({ id: KEY_FULL, state, updatedAt: now });
    store.put({ id: KEY_TEXT, text: state.current || '', updatedAt: now });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Simpan konten editor saja — ringan, dipanggil saat ketik (debounce). */
export async function saveDraftText(text) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: KEY_TEXT, text, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Simpan pendingMedia (dipanggil saat tambah/hapus media). */
export async function saveDraftPending(list) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ id: KEY_PENDING, list, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load semua — kembalikan { state, pendingMedia }.
 * state.current diambil dari KEY_TEXT jika timestamp lebih baru.
 */
export async function loadDraft() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const fullReq = store.get(KEY_FULL);
      const textReq = store.get(KEY_TEXT);
      const pendingReq = store.get(KEY_PENDING);
      tx.oncomplete = () => {
        const full    = fullReq.result;
        const text    = textReq.result;
        const pending = pendingReq.result;

        let state = full?.state ?? null;
        if (state && text && text.text !== undefined) {
          if (!full || (text.updatedAt || 0) >= (full.updatedAt || 0)) {
            state = { ...state, current: text.text };
          }
        }
        const pendingMedia = (pending && Array.isArray(pending.list)) ? pending.list : [];
        resolve({ state, pendingMedia });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return { state: null, pendingMedia: [] };
  }
}

export async function clearDraft() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.delete(KEY_FULL);
      store.delete(KEY_TEXT);
      store.delete(KEY_PENDING);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}
