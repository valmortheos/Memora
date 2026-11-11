// ui.js — Formatting & DOM Rendering Layer
import * as markdown from './markdown.js';
import { formatBytes, createMediaEl } from './media.js';

const $ = id => document.getElementById(id);

export const els = {
  editor: $('editor'),
  previewPane: $('previewPane'),
  btnPreview: $('btnPreview'),
  btnMediaPicker: $('btnMediaPicker'),
  editorToolbar: document.querySelector('.editor-toolbar'),
  commitMsg: $('commitMsg'),
  btnCommit: $('btnCommit'),
  mediaInput: $('mediaInput'),
  mediaPreview: $('mediaPreview'),
  btnDownload: $('btnDownload'),
  btnImport: $('btnImport'),
  importInput: $('importInput'),
  passBtn: $('passBtn'),
  btnNew: $('btnNew'),
  btnTheme: $('btnTheme'),
  commitToggle: $('commitToggle'),
  commitList: $('commitList'),
  commitCount: $('commitCount'),
  verifyBadge: $('verifyBadge'),
  statusBar: $('status'),
  statsSection: $('statsSection'),
  statCommits: $('statCommits'),
  statMedia: $('statMedia'),
  statSize: $('statSize'),
  passModal: $('passModal'),
  passInput: $('passInput'),
  passEye: $('passEye'),
  passForm: $('passForm'),
  passTitle: $('passTitle'),
  passDesc: $('passDesc'),
  passCancel: $('passCancel'),
  diffModal: $('diffModal'),
  diffBody: $('diffBody'),
  diffClose: $('diffClose'),
  lightbox: $('lightbox'),
  lightboxContent: $('lightboxContent'),
  lightboxClose: $('lightboxClose'),
  mediaSidebar: $('mediaSidebar'),
  sidebarBackdrop: $('sidebarBackdrop'),
  sidebarClose: $('sidebarClose'),
  pickerSearch: $('pickerSearch'),
  pickerList: $('pickerList'),
  pickerEmpty: $('pickerEmpty')
};

// ─── Formatting ─────────────────────────────────────────
export function formatWIB(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(timestamp)) + ' WIB';
}

export function shortHash(h) { return h ? h.slice(0, 10) + '…' : 'GENESIS'; }

export function showStatus(msg, type = 'info') {
  els.statusBar.textContent = msg;
  els.statusBar.className = `status status-${type}`;
  if (type !== 'error') {
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { els.statusBar.textContent = ''; els.statusBar.className = 'status'; }, 4000);
  }
}

export function diffLines(oldText, newText) {
  const a = oldText.split('\n'); const b = newText.split('\n');
  const m = a.length, n = b.length;
  if (m * n > 4000000) return [{ type: 'same', text: '⚠️ Diff terlalu besar.' }];
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out = []; let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      out.unshift({ type: 'same', text: a[i - 1], oldLine: i, newLine: j }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      out.unshift({ type: 'add', text: b[j - 1], newLine: j }); j--;
    } else {
      out.unshift({ type: 'del', text: a[i - 1], oldLine: i }); i--;
    }
  }
  return out;
}

export function setVerifyBadge(status) {
  if (status === 'ok') { els.verifyBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> terverifikasi'; els.verifyBadge.className = 'verify-badge ok'; }
  else if (status === 'bad') { els.verifyBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> rusak'; els.verifyBadge.className = 'verify-badge bad'; }
  else if (status === 'checking') { els.verifyBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> verifikasi…'; els.verifyBadge.className = 'verify-badge'; }
  else { els.verifyBadge.innerHTML = '<i class="fa-solid fa-lock"></i> belum diset'; els.verifyBadge.className = 'verify-badge'; }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.btnTheme.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  els.btnTheme.title = theme === 'dark' ? 'Mode terang' : 'Mode gelap';
  localStorage.setItem('memora-theme', theme);
}

// ─── Editor Actions ─────────────────────────────────────
export function wrapText(before, after = before, placeholder = '') {
  const start = els.editor.selectionStart, end = els.editor.selectionEnd;
  const value = els.editor.value;
  const selected = value.slice(start, end) || placeholder;
  els.editor.value = value.slice(0, start) + before + selected + after + value.slice(end);
  if (end - start === 0 && placeholder) {
    els.editor.selectionStart = start + before.length;
    els.editor.selectionEnd = start + before.length + placeholder.length;
  } else {
    els.editor.selectionStart = start + before.length;
    els.editor.selectionEnd = start + before.length + selected.length;
  }
  els.editor.focus();
  els.editor.dispatchEvent(new Event('input'));
}

export function applyHeading(level) {
  const value = els.editor.value, cursor = els.editor.selectionStart;
  const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
  let lineEnd = value.indexOf('\n', lineStart);
  if (lineEnd === -1) lineEnd = value.length;
  const line = value.slice(lineStart, lineEnd);
  const prefix = '#'.repeat(level) + ' ';
  const stripped = line.replace(/^#{1,6}\s+/, '');
  const newLine = prefix + stripped;
  els.editor.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
  els.editor.selectionStart = lineStart + prefix.length;
  els.editor.selectionEnd = els.editor.selectionStart + stripped.length;
  els.editor.focus();
  els.editor.dispatchEvent(new Event('input'));
}

export function insertMediaMarker(mediaId) {
  const start = els.editor.selectionStart, end = els.editor.selectionEnd;
  const value = els.editor.value;
  const marker = `![[media:${mediaId}]]`;
  const before = (start > 0 && value[start - 1] !== '\n') ? '\n' : '';
  const after  = (end < value.length && value[end] !== '\n') ? '\n' : '';
  const insert = before + marker + after;
  els.editor.value = value.slice(0, start) + insert + value.slice(end);
  els.editor.selectionStart = els.editor.selectionEnd = start + insert.length;
  els.editor.focus();
  els.editor.dispatchEvent(new Event('input'));
}

export function stripMarkers(id) {
  const marker = `![[media:${id}]]`;
  if (!els.editor.value.includes(marker)) return false;
  els.editor.value = els.editor.value.split(marker).join('').replace(/\n{3,}/g, '\n\n').trim();
  els.editor.dispatchEvent(new Event('input'));
  return true;
}

// ─── Preview & Media Renders ────────────────────────────
export function renderPreview(content, mediaMap) {
  els.previewPane.innerHTML = '';
  if (!content.trim()) {
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Belum ada isi. Kembali ke editor untuk menulis.';
    els.previewPane.appendChild(p); return;
  }
  const frag = markdown.renderContent(content, mediaMap);
  els.previewPane.appendChild(frag);
  els.previewPane.querySelectorAll('.inline-media img').forEach(img => {
    img.onclick = () => openLightboxSrc(img.src);
  });
}

export function setPreviewMode(enabled, content, mediaMap) {
  if (enabled) {
    renderPreview(content, mediaMap);
    els.editor.hidden = true; els.previewPane.hidden = false;
    els.btnPreview.classList.add('active'); els.btnPreview.setAttribute('aria-pressed', 'true'); els.btnPreview.title = 'Kembali ke editor';
    els.editorToolbar.querySelectorAll('.fmt-btn:not(#btnPreview)').forEach(b => b.disabled = true);
  } else {
    els.editor.hidden = false; els.previewPane.hidden = true;
    els.btnPreview.classList.remove('active'); els.btnPreview.setAttribute('aria-pressed', 'false'); els.btnPreview.title = 'Pratinjau';
    els.editorToolbar.querySelectorAll('.fmt-btn').forEach(b => b.disabled = false);
    els.editor.focus();
  }
}

export function renderMediaPreview(pendingMedia, onRemove, onOpen) {
  if (pendingMedia.length === 0) { els.mediaPreview.hidden = true; els.mediaPreview.innerHTML = ''; return; }
  els.mediaPreview.hidden = false; els.mediaPreview.innerHTML = '';
  for (const m of pendingMedia) {
    const el = createMediaEl(m, { onOpen });
    const rm = document.createElement('button');
    rm.className = 'remove-media'; rm.innerHTML = '<i class="fa-solid fa-xmark"></i>'; rm.title = 'Hapus media';
    rm.onclick = (e) => { e.stopPropagation(); onRemove(m.id); };
    el.appendChild(rm); els.mediaPreview.appendChild(el);
  }
}

// ─── Timeline ───────────────────────────────────────────
export function renderTimeline(state, globalMediaMap) {
  els.commitList.innerHTML = '';
  if (state.commits.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 24px 20px; text-align: center; color: var(--text-dim); font-size: 0.85rem;';
    empty.innerHTML = '<i class="fa-solid fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.5"></i>Belum ada commit. Tulis catatan dan klik "Commit".';
    els.commitList.appendChild(empty); return;
  }

  const frag = document.createDocumentFragment();
  for (let i = state.commits.length - 1; i >= 0; i--) {
    const c = state.commits[i];
    const item = document.createElement('div');
    item.className = 'commit-item'; item.dataset.commitIndex = String(i);

    const meta = document.createElement('div'); meta.className = 'commit-meta';
    const time = document.createElement('span'); time.className = 'commit-time'; time.textContent = formatWIB(c.timestamp);
    const hash = document.createElement('span'); hash.className = 'commit-hash';
    hash.innerHTML = `<i class="fa-solid fa-fingerprint"></i> ${shortHash(c.hash)}`;
    meta.append(time, hash);

    const msg = document.createElement('div'); msg.className = 'commit-msg'; msg.textContent = c.message;

    const contentEl = document.createElement('div'); contentEl.className = 'commit-content rendered';
    if (c.content && c.content.trim()) contentEl.appendChild(markdown.renderContent(c.content, globalMediaMap));
    else contentEl.textContent = '(kosong)';
    
    contentEl.onclick = (e) => { if (!e.target.closest('.inline-media')) contentEl.classList.toggle('expanded'); };
    contentEl.querySelectorAll('.inline-media img').forEach(img => {
      img.onclick = (e) => { e.stopPropagation(); openLightboxSrc(img.src); };
    });

    item.append(meta, msg, contentEl);

    const referencedIds = new Set();
    const re = /!\[\[media:([\w-]+)\]\]/g; let mm;
    while ((mm = re.exec(c.content || ''))) referencedIds.add(mm[1]);
    const unreferenced = c.media.filter(m => !referencedIds.has(m.id));
    if (unreferenced.length > 0) {
      const gal = document.createElement('div'); gal.className = 'commit-media';
      for (const m of unreferenced) gal.appendChild(createMediaEl(m, { onOpen: openLightboxMedia }));
      item.appendChild(gal);
    }

    const actions = document.createElement('div'); actions.className = 'commit-actions';
    actions.innerHTML = `
      <button class="btn" data-action="diff"><i class="fa-solid fa-code-compare"></i> Diff</button>
      <button class="btn" data-action="restore"><i class="fa-solid fa-rotate-left"></i> Restore</button>
      <button class="btn" data-action="export"><i class="fa-solid fa-file-export"></i> Export</button>`;
    item.appendChild(actions);

    frag.appendChild(item);
  }
  els.commitList.appendChild(frag);
}

// ─── Picker Render (Sidebar dengan Preview) ─────────────
export function renderPickerList(items, query, callbacks) {
  els.pickerList.innerHTML = '';
  const q = (query || '').trim().toLowerCase();

  if (items.length === 0) {
    els.pickerList.hidden = true; els.pickerEmpty.hidden = false; return;
  }

  const filtered = q ? items.filter(it => (it.name || '').toLowerCase().includes(q) || (it.id || '').toLowerCase().includes(q) || (it.type || '').toLowerCase().includes(q)) : items;

  if (filtered.length === 0) {
    els.pickerList.hidden = false; els.pickerEmpty.hidden = true;
    const p = document.createElement('p'); p.style.cssText = 'padding: 32px; text-align: center; color: var(--text-dim); font-size: .85rem;';
    p.textContent = 'Tidak ada media yang cocok.'; els.pickerList.appendChild(p); return;
  }

  els.pickerList.hidden = false; els.pickerEmpty.hidden = true;

  for (const m of filtered) {
    const row = document.createElement('div'); row.className = 'picker-item';
    
    const thumb = document.createElement('div'); thumb.className = 'picker-thumb';
    if (m.type === 'image') { const img = document.createElement('img'); img.src = `data:${m.mime};base64,${m.data}`; img.loading = 'lazy'; thumb.appendChild(img); }
    else { const i = document.createElement('i'); i.className = m.type === 'audio' ? 'fa-solid fa-music' : 'fa-solid fa-film'; thumb.appendChild(i); }
    thumb.onclick = (e) => { e.stopPropagation(); callbacks.onPreview(m); };

    const info = document.createElement('div'); info.className = 'picker-info';
    info.onclick = () => callbacks.onPreview(m);
    const name = document.createElement('div'); name.className = 'picker-name'; name.textContent = m.name;
    const meta = document.createElement('div'); meta.className = 'picker-meta';
    const parts = [formatBytes(m.size)];
    if (m.commitNums.length > 0) parts.push('commit #' + m.commitNums.join(', #'));
    if (m.isPending) parts.push('baru');
    meta.textContent = parts.join(' · ');
    info.append(name, meta);

    const actions = document.createElement('div'); actions.className = 'picker-actions';
    
    const btnInsert = document.createElement('button'); 
    btnInsert.type = 'button'; 
    btnInsert.className = 'btn btn-sm btn-primary picker-btn';
    btnInsert.innerHTML = '<i class="fa-solid fa-arrow-right"></i>'; 
    btnInsert.title = 'Sisipkan ke catatan';
    btnInsert.onclick = (e) => { e.stopPropagation(); callbacks.onInsert(m.id); };
    
    const btnDownload = document.createElement('button'); 
    btnDownload.type = 'button'; 
    btnDownload.className = 'btn btn-sm btn-outline picker-btn';
    btnDownload.innerHTML = '<i class="fa-solid fa-download"></i>'; 
    btnDownload.onclick = (e) => { e.stopPropagation(); callbacks.onDownload(m); };
    
    const btnDelete = document.createElement('button'); 
    btnDelete.type = 'button'; 
    btnDelete.className = 'btn btn-sm btn-outline picker-btn picker-btn-danger';
    btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>'; 
    btnDelete.onclick = async (e) => { e.stopPropagation(); await callbacks.onDelete(m.id); };
    
    actions.append(btnInsert, btnDownload, btnDelete);

    row.append(thumb, info, actions);
    els.pickerList.appendChild(row);
  }
}

// ─── Stats & Lightbox ───────────────────────────────────
export function renderStats(state) {
  const totalCommits = state.commits.length;
  const totalMedia = state.commits.reduce((acc, c) => acc + c.media.length, 0);
  els.statsSection.hidden = totalCommits === 0;
  if (totalCommits === 0) return;
  els.statCommits.textContent = totalCommits; els.statMedia.textContent = totalMedia;
  let bytes = 500 + (state.current || '').length * 2;
  for (const c of state.commits) {
    bytes += (c.content || '').length * 2 + 400;
    for (const m of c.media) bytes += (m.data || '').length + 200;
  }
  els.statSize.textContent = formatBytes(Math.ceil(bytes * 1.34) + 13);
}

export function openLightboxMedia(m) {
  els.lightboxContent.innerHTML = '';
  
  if (m.type === 'image') { 
    const img = document.createElement('img'); 
    img.src = `data:${m.mime};base64,${m.data}`; 
    els.lightboxContent.appendChild(img); 
  } 
  else if (m.type === 'audio') { 
    const audio = document.createElement('audio'); 
    audio.controls = true; 
    audio.autoplay = true;
    audio.src = `data:${m.mime};base64,${m.data}`; 
    els.lightboxContent.appendChild(audio); 
  } 
  else if (m.type === 'video') { 
    const video = document.createElement('video'); 
    video.controls = true; 
    video.autoplay = true;
    video.src = `data:${m.mime};base64,${m.data}`; 
    els.lightboxContent.appendChild(video); 
  }
  
  els.lightbox.showModal();
}

export function openLightboxSrc(src) {
  els.lightboxContent.innerHTML = '';
  const img = document.createElement('img'); img.src = src; els.lightboxContent.appendChild(img);
  els.lightbox.showModal();
}
