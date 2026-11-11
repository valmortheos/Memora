// app.js — Logika Utama & State Management

import * as crypto   from './crypto.js';
import * as codec    from './codec.js';
import * as commits  from './commits.js';
import * as storage  from './storage.js';
import * as media    from './media.js';
import * as ui       from './ui.js';

// ─── State ────────────────────────────────────────────────
let state = null;
let cryptoKey = null;
let pendingMedia = [];
let previewMode = false;
let saveTextTimer = null;
let hasCrypto = false;
let pickerInsertAt = null;

// ─── Init ────────────────────────────────────────────────
function newState() {
  return {
    app: 'Memora', version: 1, noteId: crypto.uuid(), title: '', current: '', commits: [],
    meta: { createdAt: Date.now(), lastHash: 'GENESIS', totalCommits: 0, totalMedia: 0 }
  };
}

async function init() {
  ui.applyTheme(localStorage.getItem('memora-theme') || 'light');

  hasCrypto = crypto.hasWebCrypto();
  if (!hasCrypto) {
    const warn = document.createElement('div');
    warn.className = 'crypto-warning';
    warn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div><strong>Web Crypto tidak tersedia.</strong> Buka via HTTPS atau localhost.</div>`;
    document.body.insertBefore(warn, document.body.firstChild.nextSibling);
  }

  const draft = await storage.loadDraft();
  state = draft.state || newState();
  pendingMedia = draft.pendingMedia || [];
  ui.els.editor.value = state.current || '';

  updateAll();
  updatePassButton();

  if (!hasCrypto) {
    ui.els.btnCommit.disabled = true;
    ui.els.btnDownload.disabled = true;
    ui.els.passBtn.disabled = true;
    ui.showStatus('⚠️ Mode read-only: Web Crypto tidak tersedia.', 'error');
    return;
  }

  if (state.commits.length > 0) {
    ui.showStatus('Draft dipulihkan. Klik "Unlock" untuk verifikasi.', 'info');
  }
}

// ─── Passphrase ──────────────────────────────────────────
function updatePassButton() {
  if (!hasCrypto) { ui.els.passBtn.innerHTML = '<i class="fa-solid fa-lock"></i> <span class="btn-label">Tidak tersedia</span>'; return; }
  if (cryptoKey) { ui.els.passBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> <span class="btn-label">Passphrase OK</span>'; }
  else if (state.commits.length > 0) { ui.els.passBtn.innerHTML = '<i class="fa-solid fa-key"></i> <span class="btn-label">Unlock</span>'; }
  else { ui.els.passBtn.innerHTML = '<i class="fa-solid fa-lock"></i> <span class="btn-label">Set Passphrase</span>'; }
}

function askPassphrase({ title = 'Set Passphrase', desc } = {}) {
  return new Promise(resolve => {
    const modal = ui.els.passModal;
    const input = ui.els.passInput;
    const eye = ui.els.passEye;
    
    ui.els.passTitle.textContent = title;
    ui.els.passDesc.textContent = desc || 'Passphrase dipakai untuk HMAC signature. Tidak disimpan di file.';
    input.value = ''; input.type = 'password';
    eye.classList.remove('showing'); eye.innerHTML = '<i class="fa-solid fa-eye"></i>';
    modal.returnValue = '';

    const onClose = () => { modal.removeEventListener('close', onClose); resolve(modal.returnValue === 'ok' ? input.value : null); };
    modal.addEventListener('close', onClose);

    ui.els.passCancel.onclick = () => { modal.returnValue = 'cancel'; modal.close(); };
    ui.els.passForm.onsubmit = (e) => {
      if (input.value.length < 6) { e.preventDefault(); input.setCustomValidity('Minimal 6 karakter'); input.reportValidity(); return; }
      input.setCustomValidity(''); modal.returnValue = 'ok';
    };

    modal.showModal();
    setTimeout(() => input.focus(), 60);
  });
}

ui.els.passEye.addEventListener('click', (e) => {
  e.preventDefault();
  const input = ui.els.passInput;
  const eye = ui.els.passEye;
  if (input.type === 'password') {
    input.type = 'text'; eye.classList.add('showing'); eye.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  } else {
    input.type = 'password'; eye.classList.remove('showing'); eye.innerHTML = '<i class="fa-solid fa-eye"></i>';
  }
});

async function ensureKey(forcePrompt = false) {
  if (!hasCrypto) { ui.showStatus('❌ Web Crypto tidak tersedia.', 'error'); return false; }
  if (cryptoKey && !forcePrompt) return true;

  const isUnlock = state.commits.length > 0;
  const pass = await askPassphrase({
    title: isUnlock ? 'Unlock Passphrase' : 'Set Passphrase',
    desc: isUnlock ? 'Masukkan passphrase untuk memverifikasi integritas commit.' : 'Passphrase akan dipakai untuk menandatangani setiap commit.'
  });
  if (pass == null) return false;

  try {
    ui.showStatus('⏳ Menurunkan kunci (PBKDF2)…', 'info');
    const key = await crypto.deriveKey(pass, state.noteId);
    if (isUnlock) {
      const ok = await commits.verifyPassphrase(state, key);
      if (!ok) { ui.showStatus('❌ Passphrase salah atau data dimodifikasi.', 'error'); return false; }
    }
    cryptoKey = key;
    updatePassButton();
    if (isUnlock) await runFullVerify();
    else ui.showStatus('✅ Passphrase siap.', 'success');
    return true;
  } catch (err) {
    ui.showStatus(`❌ Gagal derive kunci: ${err.message}`, 'error');
    return false;
  }
}

// ─── Media Helper ────────────────────────────────────────
function getAllMediaMap() {
  const map = new Map();
  for (const m of pendingMedia) map.set(m.id, m);
  for (const c of state.commits) {
    for (const m of c.media) if (!map.has(m.id)) map.set(m.id, m);
  }
  return map;
}

function getAllMediaWithMeta() {
  const byId = new Map();
  for (let i = 0; i < state.commits.length; i++) {
    for (const m of state.commits[i].media) {
      if (!byId.has(m.id)) byId.set(m.id, { ...m, commitNums: [], isPending: false });
      byId.get(m.id).commitNums.push(i + 1);
    }
  }
  for (const m of pendingMedia) {
    if (!byId.has(m.id)) byId.set(m.id, { ...m, commitNums: [], isPending: true });
    else byId.get(m.id).isPending = true;
  }
  return [...byId.values()].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

// ─── Media Picker (Sidebar) ──────────────────────────────
function openMediaPicker(insertAt = null) {
  pickerInsertAt = (insertAt == null) ? ui.els.editor.selectionStart : insertAt;
  ui.els.pickerSearch.value = '';
  refreshPicker();
  
  ui.els.mediaSidebar.classList.add('open');
  ui.els.sidebarBackdrop.classList.add('open');
  
  if (getAllMediaWithMeta().length > 0) {
    setTimeout(() => ui.els.pickerSearch.focus(), 60);
  }
}

function closeMediaPicker() {
  ui.els.mediaSidebar.classList.remove('open');
  ui.els.sidebarBackdrop.classList.remove('open');
  pickerInsertAt = null;
}

function refreshPicker() {
  const items = getAllMediaWithMeta();
  ui.renderPickerList(items, ui.els.pickerSearch.value, {
    onInsert: (id) => { insertFromPicker(id); closeMediaPicker(); },
    onPreview: (m) => ui.openLightboxMedia(m),
    onDownload: (m) => downloadAsset(m),
    onDelete: async (id) => { await deleteAsset(id, refreshPicker); }
  });
}

function insertFromPicker(id) {
  const marker = `![[media:${id}]]`;
  const value = ui.els.editor.value;
  const pos = (pickerInsertAt == null) ? ui.els.editor.selectionStart : pickerInsertAt;

  const before = value.slice(0, pos);
  const after  = value.slice(pos);
  const prefix = (before === '' || before.endsWith('\n')) ? '' : '\n';
  const suffix = (after === '' || after.startsWith('\n')) ? '' : '\n';
  const insert = prefix + marker + suffix;

  ui.els.editor.value = before + insert + after;
  const newPos = pos + insert.length;
  ui.els.editor.selectionStart = ui.els.editor.selectionEnd = newPos;
  state.current = ui.els.editor.value;
  ui.els.editor.focus();
  ui.els.editor.dispatchEvent(new Event('input'));
  ui.showStatus('📎 Media disisipkan ke catatan.', 'success');
}

function downloadAsset(m) {
  try {
    const bytes = crypto.base64ToBytes(m.data);
    const blob = new Blob([bytes], { type: m.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = m.name || `media-${m.id.slice(0, 8)}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.showStatus(`⬇️ ${m.name} terunduh.`, 'success');
  } catch (err) {
    ui.showStatus(`❌ Gagal unduh media: ${err.message}`, 'error');
  }
}

// ─── HAPUS ASSET (Hard Delete + Rewrite History) ─────────
async function deleteAsset(id, onDone) {
  if (!hasCrypto) {
    ui.showStatus('❌ Web Crypto tidak tersedia untuk menghapus.', 'error');
    return;
  }

  // 1. Peringatan Ekstra
  const msg = `⚠️ PERINGATAN KERAS ⚠️\n\nAnda akan menghapus aset ini secara PERMANEN dari SELURUH riwayat commit.\n\nTindakan ini akan:\n1. Menulis ulang seluruh riwayat commit (Hash Chain dihitung ulang).\n2. Menandatangani ulang semua commit dengan passphrase Anda.\n3. Menghapus semua teks ![[media:...]] yang merujuk ke media ini.\n\nFile .memento lama Anda tidak akan cocok lagi dengan catatan ini.\n\nLanjutkan?`;
  if (!confirm(msg)) return;

  // 2. Minta passphrase jika belum unlock
  if (!cryptoKey) {
    const ok = await ensureKey();
    if (!ok) return;
  }

  ui.showStatus('⏳ Menghapus aset dari seluruh riwayat…', 'info');
  ui.els.btnCommit.disabled = true;

  try {
    // 3. Hapus dari Editor & Pending
    // Gunakan regex global yang mendeteksi format marker dengan atau tanpa size
    const markerRegex = new RegExp(`!\\[\\[media:${id}(?:[|\\]]\\s*(?:size=)?[\\w-]+)?\\]\\]?`, 'g');
    
    if (markerRegex.test(ui.els.editor.value)) {
      ui.els.editor.value = ui.els.editor.value.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n').trim();
      ui.els.editor.dispatchEvent(new Event('input'));
    }
    
    pendingMedia = pendingMedia.filter(m => m.id !== id);

    // 4. Tulis Ulang (Rewrite) Seluruh Commit
    let prevHash = 'GENESIS';

    for (let i = 0; i < state.commits.length; i++) {
      const c = state.commits[i];
      
      // Hapus media dari array commit
      c.media = c.media.filter(m => m.id !== id);
      
      // Hapus marker dari teks konten
      if (c.content) {
        c.content = c.content.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n').trim();
      }

      // Re-sign commit (menghitung ulang hash dan HMAC)
      await commits.resignCommit(c, prevHash, cryptoKey);
      prevHash = c.hash;
    }

    // 5. Perbarui Metadata State
    state.meta.lastHash = prevHash;
    state.meta.totalCommits = state.commits.length;
    state.meta.totalMedia = state.commits.reduce((s, c) => s + c.media.length, 0);

    // Jika commit terakhir berubah, update current text di editor
    if (state.commits.length > 0) {
      state.current = state.commits[state.commits.length - 1].content;
      ui.els.editor.value = state.current;
    }

    // 6. Simpan & Render Ulang
    await Promise.all([storage.saveDraft(state), storage.saveDraftPending(pendingMedia)]);
    
    updateAll();
    ui.setVerifyBadge('ok');
    ui.showStatus('🗑 Aset berhasil dihapus dari seluruh riwayat.', 'success');
    
    if (typeof onDone === 'function') onDone();

  } catch (err) {
    console.error(err);
    ui.showStatus(`❌ Gagal menghapus: ${err.message}`, 'error');
  } finally {
    ui.els.btnCommit.disabled = false;
  }
}

// ─── Commit Logic ────────────────────────────────────────
async function doCommit() {
  if (!state || !hasCrypto) return;
  if (!(await ensureKey())) return;

  ui.els.btnCommit.disabled = true;
  try {
    const content = ui.els.editor.value;
    const message = ui.els.commitMsg.value.trim();
    const prevHash = state.commits.at(-1)?.hash || 'GENESIS';

    ui.showStatus('⏳ Membuat commit…', 'info');
    const commit = await commits.makeCommit({ content, message, media: pendingMedia, prevHash, key: cryptoKey });

    state.commits.push(commit);
    state.current = content;
    state.meta.lastHash = commit.hash;
    state.meta.totalCommits = state.commits.length;
    state.meta.totalMedia = state.commits.reduce((s, c) => s + c.media.length, 0);

    pendingMedia = [];
    ui.els.commitMsg.value = '';
    updateAll();
    updatePassButton();
    ui.setVerifyBadge('ok');

    await Promise.all([storage.saveDraft(state), storage.saveDraftPending([])]);
    ui.showStatus(`✅ Commit #${state.commits.length} tersimpan (${commit.message})`, 'success');
  } catch (err) {
    ui.showStatus(`❌ Gagal commit: ${err.message}`, 'error');
  } finally {
    ui.els.btnCommit.disabled = false;
  }
}

// ─── Media Upload ────────────────────────────────────────
async function handleMediaFiles(files) {
  if (!files || files.length === 0) return;
  ui.showStatus(`⏳ Memproses ${files.length} file…`, 'info');
  let added = 0;
  for (const file of files) {
    try {
      const m = await media.processMediaFile(file);
      pendingMedia.push(m);
      ui.insertMediaMarker(m.id);
      added++;
    } catch (err) {
      ui.showStatus(`⚠️ ${err.message}`, 'warning');
    }
  }
  ui.els.mediaInput.value = '';
  updateMediaPreview();
  storage.saveDraftPending(pendingMedia).catch(() => {});
  if (added > 0) ui.showStatus(`📎 ${added} media ditambahkan.`, 'success');
}

function removeMediaById(id) {
  pendingMedia = pendingMedia.filter(x => x.id !== id);
  ui.stripMarkers(id);
  updateMediaPreview();
  storage.saveDraftPending(pendingMedia).catch(() => {});
}

// ─── Download / Import ───────────────────────────────────
async function doDownload() {
  if (!state || !hasCrypto) return;
  try {
    ui.showStatus('⏳ Meng-encode .memento…', 'info');
    state.current = ui.els.editor.value;
    state.meta.totalCommits = state.commits.length;
    state.meta.totalMedia = state.commits.reduce((s, c) => s + c.media.length, 0);
    state.meta.lastHash = state.commits.at(-1)?.hash || 'GENESIS';

    const text = codec.encodeMemento(state);
    const blob = new Blob([text], { type: 'application/octet-stream' });
    const date = new Date().toISOString().slice(0, 10);
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `memora-${date}-${state.noteId.slice(0, 8)}.memento`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    ui.showStatus(`✅ File .memento terunduh (${media.formatBytes(blob.size)})`, 'success');
  } catch (err) {
    ui.showStatus(`❌ Gagal unduh: ${err.message}`, 'error');
  }
}

async function importFile(file) {
  if (!file || !hasCrypto) return;
  try {
    ui.showStatus('⏳ Membaca file .memento…', 'info');
    const text = await file.text();
    const imported = codec.decodeMemento(text);

    const pass = await askPassphrase({ title: 'Verifikasi Impor', desc: 'Masukkan passphrase untuk verifikasi.' });
    if (pass == null) return;

    ui.showStatus('⏳ Menurunkan kunci (PBKDF2)…', 'info');
    const key = await crypto.deriveKey(pass, imported.noteId);

    ui.showStatus(`⏳ Verifikasi ${imported.commits.length} commit…`, 'info');
    const res = await commits.verifyChain(imported, key);
    if (!res.ok) {
      ui.showStatus(`❌ Verifikasi GAGAL — ${res.reason}`, 'error');
      alert(`Verifikasi gagal:\n\n${res.reason}`);
      return;
    }

    state = imported;
    cryptoKey = key;
    state.current = state.current || (state.commits.at(-1)?.content ?? '');
    ui.els.editor.value = state.current;
    pendingMedia = [];

    updateAll();
    updatePassButton();
    ui.setVerifyBadge('ok');
    await Promise.all([storage.saveDraft(state), storage.saveDraftPending([])]);
    ui.showStatus(`✅ Impor sukses — ${imported.commits.length} commit terverifikasi.`, 'success');
  } catch (err) {
    ui.showStatus(`❌ Gagal impor: ${err.message}`, 'error');
    alert(`Gagal impor:\n${err.message}`);
  }
}

// ─── Actions (Diff, Restore, Export) ─────────────────────
function showDiff(index) {
  const current = state.commits[index];
  const previous = index > 0 ? state.commits[index - 1] : null;
  const oldText = previous ? previous.content : '';
  const newText = current.content;

  const body = ui.els.diffBody;
  body.innerHTML = '';
  
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: 8px; color: var(--text-dim); font-size: 0.78rem;';
  header.textContent = previous ? `Commit #${index} → #${index + 1}` : `(kosong) → Commit #1`;
  body.appendChild(header);

  const lines = ui.diffLines(oldText, newText);
  for (const l of lines) {
    const row = document.createElement('div');
    row.className = `diff-line diff-${l.type}`;
    const ln = document.createElement('span');
    ln.className = 'ln';
    ln.textContent = l.type === 'add' ? (l.newLine || '') : (l.oldLine || '');
    const txt = document.createElement('span');
    txt.textContent = l.text || ' ';
    row.append(ln, txt);
    body.appendChild(row);
  }
  ui.els.diffModal.showModal();
}

function restoreCommit(index) {
  const c = state.commits[index];
  ui.els.editor.value = c.content;
  state.current = c.content;
  pendingMedia = c.media.map(m => ({ ...m }));
  ui.els.commitMsg.value = `restore ke #${index + 1}`;
  updateMediaPreview();
  storage.saveDraftText(c.content).catch(() => {});
  storage.saveDraftPending(pendingMedia).catch(() => {});
  ui.showStatus(`↩️ Editor diisi dari commit #${index + 1}.`, 'info');
  if (previewMode) ui.renderPreview(ui.els.editor.value, getAllMediaMap());
  ui.els.editor.focus();
  ui.els.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportSingleCommit(index) {
  const c = state.commits[index];
  const lines = [
    '════════════════════════════════════════════════════════════',
    'MEMORA COMMIT EXPORT',
    '════════════════════════════════════════════════════════════',
    `Commit ID  : ${c.id}`,
    `Timestamp  : ${ui.formatWIB(c.timestamp)}`,
    `Message    : ${c.message}`,
    `Hash       : ${c.hash}`,
    `Signature  : ${c.sig}`,
    `Prev Hash  : ${c.prevHash}`,
    '════════════════════════════════════════════════════════════',
    '',
    'CONTENT',
    '───────',
    c.content || '(kosong)',
    '',
    '════════════════════════════════════════════════════════════',
    `MEDIA (${c.media.length} item)`,
    '════════════════════════════════════════════════════════════',
    ''
  ];
  c.media.forEach((m, i) => {
    lines.push(`--- Media ${i + 1} ---`);
    lines.push(`ID     : ${m.id}`);
    lines.push(`Name   : ${m.name}`);
    lines.push(`Type   : ${m.mime}`);
    lines.push(`Size   : ${m.size} bytes`);
    lines.push(`Hash   : ${m.dataHash}`);
    lines.push(`Base64 : ${m.data.slice(0, 100)}… (${m.data.length} chars)`);
    lines.push('');
  });
  
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `memora-commit-${index + 1}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Verify ──────────────────────────────────────────────
async function runFullVerify() {
  if (!cryptoKey || !hasCrypto || state.commits.length === 0) return;
  ui.setVerifyBadge('checking');
  try {
    const res = await commits.verifyChain(state, cryptoKey);
    if (res.ok) {
      ui.setVerifyBadge('ok');
      ui.showStatus(`✅ Semua ${state.commits.length} commit terverifikasi.`, 'success');
    } else {
      ui.setVerifyBadge('bad');
      ui.showStatus(`❌ ${res.reason}`, 'error');
    }
  } catch (err) {
    ui.setVerifyBadge('bad');
    ui.showStatus(`❌ Verifikasi error: ${err.message}`, 'error');
  }
}

// ─── UI Updates ──────────────────────────────────────────
function updateTimeline() { ui.renderTimeline(state, getAllMediaMap()); }
function updateMediaPreview() { ui.renderMediaPreview(pendingMedia, removeMediaById, ui.openLightboxMedia); }
function updateStats() { ui.renderStats(state); }
function updateAll() {
  updateTimeline();
  updateMediaPreview();
  updateStats();
  ui.els.commitCount.textContent = state.commits.length;
}

// ─── New Note ────────────────────────────────────────────
async function doNewNote() {
  if (state.commits.length > 0 || ui.els.editor.value.trim()) {
    if (!confirm('Buat catatan baru? Pastikan Anda sudah mengunduh .memento jika perlu.')) return;
  }
  await storage.clearDraft();
  state = newState(); cryptoKey = null; pendingMedia = [];
  ui.els.editor.value = ''; ui.els.commitMsg.value = '';
  updateAll(); updatePassButton(); ui.setVerifyBadge('unset');
  if (previewMode) ui.setPreviewMode(false);
  previewMode = false;
  await storage.saveDraft(state);
  ui.showStatus('🆕 Catatan baru siap.', 'success');
}

// ─── Event Bindings ──────────────────────────────────────
ui.els.btnCommit.addEventListener('click', doCommit);
ui.els.mediaInput.addEventListener('change', e => handleMediaFiles(e.target.files));
ui.els.btnDownload.addEventListener('click', doDownload);
ui.els.btnImport.addEventListener('click', () => ui.els.importInput.click());
ui.els.importInput.addEventListener('change', e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (f) importFile(f);
});

ui.els.passBtn.addEventListener('click', async () => {
  if (cryptoKey && state.commits.length === 0) {
    if (!confirm('Ganti passphrase? (boleh karena belum ada commit)')) return;
    cryptoKey = null; updatePassButton(); await ensureKey();
  } else if (cryptoKey) {
    ui.showStatus('ℹ️ Passphrase tidak bisa diubah saat sudah ada commit.', 'info');
  } else await ensureKey();
});

ui.els.btnNew.addEventListener('click', doNewNote);
ui.els.btnTheme.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  ui.applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// Sidebar (Media Picker) Events
ui.els.btnMediaPicker.addEventListener('click', () => openMediaPicker());
ui.els.sidebarClose.addEventListener('click', closeMediaPicker);
ui.els.sidebarBackdrop.addEventListener('click', closeMediaPicker);
ui.els.pickerSearch.addEventListener('input', refreshPicker);

// Editor
ui.els.editor.addEventListener('input', () => {
  state.current = ui.els.editor.value;
  clearTimeout(saveTextTimer);
  saveTextTimer = setTimeout(() => storage.saveDraftText(ui.els.editor.value).catch(()=>{}), 600);
  if (previewMode) ui.renderPreview(ui.els.editor.value, getAllMediaMap());
});

ui.els.editor.addEventListener('keydown', (e) => {
  if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const pos = ui.els.editor.selectionStart;
    const before = ui.els.editor.value.slice(0, pos);
    if (pos === 0 || /\s$/.test(before)) {
      e.preventDefault();
      openMediaPicker(pos);
    }
  }
});

// Toolbar
ui.els.editorToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || (previewMode && btn.dataset.action !== 'preview')) return;
  const action = btn.dataset.action;
  
  if (action === 'bold') ui.wrapText('**', '**', 'bold');
  else if (action === 'italic') ui.wrapText('*', '*', 'italic');
  else if (action === 'h1') ui.applyHeading(1);
  else if (action === 'h2') ui.applyHeading(2);
  else if (action === 'preview') {
    previewMode = !previewMode;
    ui.setPreviewMode(previewMode, ui.els.editor.value, getAllMediaMap());
  }
});

// Timeline
ui.els.commitToggle.addEventListener('click', () => {
  const expanded = ui.els.commitToggle.getAttribute('aria-expanded') === 'true';
  ui.els.commitToggle.setAttribute('aria-expanded', String(!expanded));
  ui.els.commitList.hidden = expanded;
});

ui.els.commitList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const item = btn.closest('[data-commit-index]');
  if (!item) return;
  const idx = parseInt(item.dataset.commitIndex, 10);
  if (Number.isNaN(idx)) return;
  switch (btn.dataset.action) {
    case 'diff': showDiff(idx); break;
    case 'restore': restoreCommit(idx); break;
    case 'export': exportSingleCommit(idx); break;
  }
});

// Modals
ui.els.diffClose.addEventListener('click', () => ui.els.diffModal.close());
ui.els.lightboxClose.addEventListener('click', () => ui.els.lightbox.close());
ui.els.diffModal.addEventListener('click', e => { if (e.target === ui.els.diffModal) ui.els.diffModal.close(); });
ui.els.lightbox.addEventListener('click', e => { if (e.target === ui.els.lightbox) ui.els.lightbox.close(); });

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') { e.preventDefault(); if (!ui.els.btnCommit.disabled) doCommit(); }
  else if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); if (!ui.els.btnDownload.disabled) doDownload(); }
  else if (ctrl && e.key.toLowerCase() === 'm') { e.preventDefault(); ui.els.mediaSidebar.classList.contains('open') ? closeMediaPicker() : openMediaPicker(); }
  else if (ctrl && e.key.toLowerCase() === 'b' && document.activeElement === ui.els.editor) { e.preventDefault(); ui.wrapText('**', '**', 'bold'); }
  else if (ctrl && e.key.toLowerCase() === 'i' && document.activeElement === ui.els.editor) { e.preventDefault(); ui.wrapText('*', '*', 'italic'); }
  else if (e.key === 'Escape') {
    if (ui.els.mediaSidebar.classList.contains('open')) {
      e.preventDefault(); closeMediaPicker();
    } else if (previewMode && !document.querySelector('dialog[open]')) {
      previewMode = false; ui.setPreviewMode(false);
    }
  }
});

// Drag & Drop
document.addEventListener('dragover', e => { e.preventDefault(); document.body.style.outline = '2px dashed var(--accent)'; });
document.addEventListener('dragleave', () => { document.body.style.outline = ''; });
document.addEventListener('drop', e => {
  e.preventDefault(); document.body.style.outline = '';
  const f = e.dataTransfer.files?.[0];
  if (f && f.name.endsWith('.memento')) importFile(f);
});

// Unload
window.addEventListener('beforeunload', () => {
  if (state) {
    state.current = ui.els.editor.value;
    storage.saveDraft(state).catch(() => {});
    storage.saveDraftPending(pendingMedia).catch(() => {});
  }
});

// Boot
init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div style="padding:16px;background:#f87171;color:#fff;font-weight:600">⚠️ Gagal inisialisasi: ${err.message}</div>`);
});
