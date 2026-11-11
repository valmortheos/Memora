// markdown.js — lightweight markdown+media parser (safe, no innerHTML)

const HEADING_RE      = /^(#{1,6})\s+(.*)$/;
// Regex baru: Mendukung format ![[media:ID]], ![[media:ID]size=small], ![[media:ID|size=small]], ![[media:ID|small]]
const MEDIA_MARKER_RE = /^\s*!\[\[media:([\w-]+)(?:[|\]]\s*(?:size=)?([\w-]+))?\]\]?\s*$/;
const INLINE_RE       = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;

export function renderContent(text, mediaMap = new Map()) {
  const root = document.createDocumentFragment();
  if (!text) return root;

  const lines = text.split('\n');
  let textBuf = [];

  const flushText = () => {
    if (textBuf.length === 0) return;
    const p = document.createElement('p');
    p.appendChild(renderInline(textBuf.join('\n')));
    root.appendChild(p);
    textBuf = [];
  };

  for (const line of lines) {
    const hMatch = line.match(HEADING_RE);
    if (hMatch) {
      flushText();
      const level = Math.min(hMatch[1].length + 1, 6);
      const h = document.createElement('h' + level);
      h.appendChild(renderInline(hMatch[2]));
      root.appendChild(h);
      continue;
    }

    const mMatch = line.match(MEDIA_MARKER_RE);
    if (mMatch) {
      flushText();
      const id = mMatch[1];
      const size = mMatch[2] || 'normal';
      const m = mediaMap.get(id);
      root.appendChild(m ? createInlineMediaEl(m, size) : createMissingMediaEl(id));
      continue;
    }

    if (line.trim() === '') { flushText(); continue; }
    textBuf.push(line);
  }
  flushText();
  return root;
}

function renderInline(text) {
  const frag = document.createDocumentFragment();
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[2] !== undefined) {
      const el = document.createElement('strong'); el.textContent = m[2]; frag.appendChild(el);
    } else if (m[3] !== undefined) {
      const el = document.createElement('em'); el.textContent = m[3]; frag.appendChild(el);
    } else if (m[4] !== undefined) {
      const el = document.createElement('code'); el.textContent = m[4]; frag.appendChild(el);
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function createInlineMediaEl(m, size) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-media inline-media-' + m.type;
  
  // Tambahkan class ukuran jika bukan normal
  if ((m.type === 'image' || m.type === 'video') && size !== 'normal') {
    wrap.classList.add(`media-size-${size}`);
  }
  
  wrap.dataset.mediaId = m.id;

  if (m.type === 'image') {
    const img = document.createElement('img');
    img.src = 'data:' + m.mime + ';base64,' + m.data;
    img.alt = m.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    wrap.appendChild(img);
  } else if (m.type === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = 'data:' + m.mime + ';base64,' + m.data;
    wrap.appendChild(audio);
    wrap.appendChild(makeMediaLabel('fa-music', m.name));
  } else if (m.type === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'none';
    video.playsInline = true;
    video.src = 'data:' + m.mime + ';base64,' + m.data;
    wrap.appendChild(video);
    wrap.appendChild(makeMediaLabel('fa-film', m.name));
  }
  return wrap;
}

function makeMediaLabel(iconClass, name) {
  const label = document.createElement('div');
  label.className = 'inline-media-name';
  const icon = document.createElement('i');
  icon.className = 'fa-solid ' + iconClass;
  label.appendChild(icon);
  label.appendChild(document.createTextNode(' ' + name));
  return label;
}

function createMissingMediaEl(id) {
  const ph = document.createElement('div');
  ph.className = 'media-missing';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-triangle-exclamation';
  ph.appendChild(icon);
  ph.appendChild(document.createTextNode(' Media '));
  const code = document.createElement('code');
  code.textContent = id.slice(0, 8);
  ph.appendChild(code);
  ph.appendChild(document.createTextNode(' tidak ditemukan'));
  return ph;
}
