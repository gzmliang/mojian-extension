/* ===== 墨笺 InkNote — Reader Logic ===== */

// ==============================
// Debug Log
// ==============================
const _debugLogs = [];
function log(msg, level = 'I') {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
  _debugLogs.push({ t, msg, level });
  console.log(`[墨笺] ${msg}`);
  const body = document.getElementById('debugBody');
  if (body && body.style.display !== 'none') {
    const e = document.createElement('div');
    e.className = 'debug-entry';
    e.innerHTML = `<span class="t">${t}</span> <span class="l-${level.toLowerCase()}">[${level}]</span> ${escapeHtml(msg)}`;
    body.appendChild(e);
    body.scrollTop = body.scrollHeight;
  }
}
function logError(msg) { log(msg, 'E'); }
function logWarn(msg) { log(msg, 'W'); }

// ==============================
// Utils
// ==============================
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeJs(s) {
  return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g,'\\n');
}

// ==============================
// State
// ==============================
const state = {
  currentContent: '',
  currentFileName: '',
  currentFilePath: '',
  isHtmlFile: false,
  fontSize: 16,
  theme: 'light',
  isEditMode: false,
  isFullscreen: false,
  isTtsPlaying: false,
  ttsParagraphs: [],
  ttsCurrentIdx: 0,
  ttsEngine: 'browser', // 'browser' or 'edge'
  isSearchVisible: false,
  isTocVisible: false,
  searchMatches: [],
  searchCurrentIdx: -1,
  currentContentHash: '',
};

// ==============================
// Settings
// ==============================
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
    state.fontSize = s.fontSize || 16;
    state.theme = s.theme || 'light';
    state.ttsEngine = s.ttsEngine || 'browser';
    document.getElementById('settingApiEndpoint').value = s.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
    document.getElementById('settingApiKey').value = s.apiKey || '';
    document.getElementById('settingApiModel').value = s.apiModel || 'deepseek-chat';
    document.getElementById('settingTtsEndpoint').value = s.ttsEndpoint || 'http://powerplus.blogsyte.com:5001';
    document.getElementById('settingTtsVoice').value = s.ttsVoice || 'zh-CN-XiaoxiaoNeural';
    applyTheme(state.theme);
    applyFontSize(state.fontSize);
  } catch(e) { logWarn('加载设置失败: ' + e.message); }
}
function saveSettings() {
  const s = {
    fontSize: state.fontSize,
    theme: state.theme,
    ttsEngine: state.ttsEngine,
    apiEndpoint: document.getElementById('settingApiEndpoint').value,
    apiKey: document.getElementById('settingApiKey').value,
    apiModel: document.getElementById('settingApiModel').value,
    ttsEndpoint: document.getElementById('settingTtsEndpoint').value,
    ttsVoice: document.getElementById('settingTtsVoice').value,
  };
  localStorage.setItem('inknote_settings', JSON.stringify(s));
  log('设置已保存');
}

// ==============================
// Theme
// ==============================
function applyTheme(theme) {
  state.theme = theme;
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  if (theme !== 'light') document.body.classList.add('theme-' + theme);
  document.getElementById('tbTheme').textContent = theme === 'dark' ? '☀️' : theme === 'sepia' ? '🌙' : '🌞';
}
function cycleTheme() {
  const t = state.theme;
  const next = t === 'light' ? 'dark' : t === 'dark' ? 'sepia' : 'light';
  applyTheme(next);
  saveSettings();
}

// ==============================
// Font Size
// ==============================
function applyFontSize(size) {
  state.fontSize = Math.max(8, Math.min(36, size));
  document.getElementById('tbFontSize').textContent = state.fontSize;
  document.getElementById('readPanel').style.fontSize = state.fontSize + 'px';
  document.querySelectorAll('#readPanel pre code').forEach(el => el.style.fontSize = (state.fontSize * 0.9) + 'px');
}
function decFont() { applyFontSize(state.fontSize - 1); saveSettings(); }
function incFont() { applyFontSize(state.fontSize + 1); saveSettings(); }

// ==============================
// File Loading
// ==============================
function openLocalFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    state.currentContent = e.target.result;
    state.currentFileName = file.name;
    state.currentFilePath = '';
    state.isHtmlFile = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
    loadContent();
    log('已打开文件: ' + file.name + ' (' + state.currentContent.length + ' 字符)');
  };
  reader.onerror = function() { logError('读取文件失败'); };
  reader.readAsText(file);
}

async function openUrl(url) {
  try {
    log('正在从 URL 加载: ' + url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    state.currentContent = text;
    state.currentFileName = url.split('/').pop() || 'untitled.md';
    state.currentFilePath = url;
    state.isHtmlFile = state.currentFileName.toLowerCase().endsWith('.html');
    loadContent();
    log('已加载 URL: ' + state.currentFileName + ' (' + text.length + ' 字符)');
  } catch(e) {
    logError('URL 加载失败: ' + e.message);
    alert('无法加载 URL: ' + e.message);
  }
}

function loadContent() {
  hideWelcome();
  document.getElementById('fileName').textContent = state.currentFileName;
  if (state.isHtmlFile) {
    document.getElementById('content').innerHTML = state.currentContent;
  } else {
    renderMarkdown(state.currentContent);
  }
  showToolbar();
  clearHighlights();
  loadBookmarksForFile();
  loadHighlightsForFile();
  state.currentContentHash = simpleHash(state.currentContent);
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 1000); i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return h;
}

// ==============================
// Rendering engine (from mojian)
// ==============================
try {
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
} catch(e) {
  console.warn('[墨笺] Mermaid 初始化跳过:', e.message);
}
try {
  marked.setOptions({ breaks: true, gfm: true });
} catch(e) {
  console.warn('[墨笺] Marked 初始化跳过:', e.message);
}

function renderMarkdown(rawMd) {
  const readPanel = document.getElementById('readPanel');
  readPanel.classList.remove('hidden');
  state.currentContent = rawMd;
  try {
    const mermaidBlocks = [];
    const preprocessed = rawMd.replace(/```mermaid\n([\s\S]*?)```/g, (match, code) => {
      const id = 'mermaid-' + mermaidBlocks.length;
      mermaidBlocks.push({ id, code });
      return `<div class="mermaid" id="${id}">${code}</div>`;
    });
    const html = marked.parse(preprocessed);
    document.getElementById('content').innerHTML = html;
    log('渲染完成, HTML长度: ' + html.length);
    renderMathInElement(document.getElementById('content'), {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false, strict: false,
    });
    if (mermaidBlocks.length > 0) {
      requestAnimationFrame(() => {
        mermaidBlocks.forEach(({ id }) => {
          const el = document.getElementById(id);
          if (el && el.textContent && el.textContent.trim()) {
            mermaid.render(id + '-' + Date.now(), el.textContent.trim())
              .then(result => { el.innerHTML = result.svg; })
              .catch(e => { el.innerHTML = '<pre style="color:red;">Mermaid Error: ' + e.message + '</pre>'; });
          }
        });
      });
    }
    // Re-apply highlights
    reapplyHighlightsAfterRender();
  } catch(e) {
    document.getElementById('content').innerHTML = '<pre style="color:red;">渲染错误: ' + escapeHtml(e.message) + '</pre>';
    logError('渲染错误: ' + e.message);
  }
}

// ==============================
// Fullscreen
// ==============================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      state.isFullscreen = true;
      document.getElementById('tbFullscreen').textContent = '⛶';
    }).catch(e => logWarn('全屏: ' + e.message));
  } else {
    document.exitFullscreen().then(() => {
      state.isFullscreen = false;
      document.getElementById('tbFullscreen').textContent = '⛶';
    });
  }
}
document.addEventListener('fullscreenchange', () => {
  state.isFullscreen = !!document.fullscreenElement;
});

// ==============================
// Edit Mode (CM6)
// ==============================
let cmView = null;

async function ensureCm6() {
  if (cmView) return cmView;
  // CM6 无法在 MV3 扩展页加载（CDN ESM import 被 CSP 拦截）
  // 使用 textarea 回退作为编辑器
  log('[编辑器] 使用 textarea（MV3 限制无法加载 CM6）');
  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;height:100%;border:none;padding:16px;font-family:monospace;font-size:15px;line-height:1.6;resize:none;outline:none;background:inherit;color:inherit;';
  ta.value = state.currentContent;
  const editor = document.getElementById('cmEditor');
  editor.innerHTML = '';
  editor.appendChild(ta);
  cmView = {
    state: { doc: { toString: () => ta.value, length: ta.value.length } },
    dispatch: (obj) => {
      const insert = obj.changes ? obj.changes.insert : obj.insert;
      if (insert !== undefined) ta.value = insert;
    },
    focus: () => ta.focus(),
    _isTextarea: true,
  };
  return cmView;
}

function toggleEdit() {
  if (state.isEditMode) {
    // Edit → Read
    if (cmView) {
      const content = cmView.state.doc.toString();
      if (content !== state.currentContent) {
        state.currentContent = content;
        renderMarkdown(content);
        log('编辑内容已同步到阅读');
      }
    }
    state.isEditMode = false;
    document.getElementById('editPanel').classList.add('hidden');
    document.getElementById('readPanel').classList.remove('hidden');
    document.getElementById('tbEdit').textContent = '✏️';
  } else {
    // Read → Edit
    state.isEditMode = true;
    document.getElementById('readPanel').classList.add('hidden');
    document.getElementById('editPanel').classList.remove('hidden');
    document.getElementById('tbEdit').textContent = '📖';
    ensureCm6().then(v => {
      if (v && v.state.doc.toString() !== state.currentContent) {
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: state.currentContent } });
      }
    });
  }
}

// ==============================
// Search
// ==============================
function showSearch() {
  state.isSearchVisible = true;
  document.getElementById('searchBar').classList.remove('hidden');
  document.getElementById('searchInput').focus();
  document.getElementById('tbSearch').classList.add('active');
}
function hideSearch() {
  state.isSearchVisible = false;
  document.getElementById('searchBar').classList.add('hidden');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchInfo').textContent = '';
  clearSearchHighlights();
  document.getElementById('tbSearch').classList.remove('active');
}

function doSearch(query) {
  clearSearchHighlights();
  if (!query) { document.getElementById('searchInfo').textContent = ''; return; }
  const contentEl = document.getElementById('content');
  if (!contentEl) return;
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      const tag = node.parentElement.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'MATH' || tag === 'NOSCRIPT')
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  if (textNodes.length === 0) { document.getElementById('searchInfo').textContent = '0'; return; }

  let fullText = '', offsets = [];
  for (let i = 0; i < textNodes.length; i++) {
    offsets.push(fullText.length);
    fullText += textNodes[i].textContent;
  }
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const allMatches = [...fullText.matchAll(regex)];
  if (allMatches.length === 0) { document.getElementById('searchInfo').textContent = '0'; return; }

  state.searchMatches = [];
  for (let m = allMatches.length - 1; m >= 0; m--) {
    const ms = allMatches[m].index, me = ms + allMatches[m][0].length;
    highlightTextRange(textNodes, offsets, ms, me);
  }
  state.searchMatches.reverse();
  document.getElementById('searchInfo').textContent = allMatches.length + ' 个';
  highlightSearchMatch(0);
}

function highlightTextRange(textNodes, offsets, start, end) {
  for (let i = 0; i < textNodes.length; i++) {
    const nodeStart = offsets[i];
    const nodeEnd = nodeStart + textNodes[i].textContent.length;
    if (end <= nodeStart) break;
    if (start >= nodeEnd) continue;
    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(textNodes[i].textContent.length, end - nodeStart);
    if (localStart >= localEnd) continue;
    const node = textNodes[i];
    const text = node.textContent;
    const frag = document.createDocumentFragment();
    if (localStart > 0) frag.appendChild(document.createTextNode(text.slice(0, localStart)));
    const span = document.createElement('span');
    span.className = 'search-match';
    span.textContent = text.slice(localStart, localEnd);
    span.dataset.matchIndex = state.searchMatches.length;
    frag.appendChild(span);
    state.searchMatches.push(span);
    if (localEnd < text.length) frag.appendChild(document.createTextNode(text.slice(localEnd)));
    node.parentNode.replaceChild(frag, node);
    textNodes[i] = span.childNodes[0];
  }
}

function highlightSearchMatch(index) {
  document.querySelectorAll('.search-match-active').forEach(s => s.className = 'search-match');
  if (index >= 0 && index < state.searchMatches.length) {
    state.searchCurrentIdx = index;
    state.searchMatches[index].className = 'search-match-active';
    state.searchMatches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('searchInfo').textContent = (index+1) + '/' + state.searchMatches.length;
  }
}
function nextSearch() { highlightSearchMatch((state.searchCurrentIdx + 1) % state.searchMatches.length); }
function prevSearch() { highlightSearchMatch(state.searchCurrentIdx <= 0 ? state.searchMatches.length - 1 : state.searchCurrentIdx - 1); }

function clearSearchHighlights() {
  document.querySelectorAll('.search-match, .search-match-active').forEach(span => {
    const parent = span.parentNode;
    if (parent) { parent.replaceChild(document.createTextNode(span.textContent), span); parent.normalize(); }
  });
  state.searchMatches = [];
  state.searchCurrentIdx = -1;
}

// ==============================
// TOC (Table of Contents)
// ==============================
function toggleToc() {
  state.isTocVisible = !state.isTocVisible;
  document.getElementById('tocSidebar').classList.toggle('hidden', !state.isTocVisible);
  if (state.isTocVisible) buildToc();
}
function buildToc() {
  const container = document.getElementById('tocItems');
  const headings = state.currentContent.match(/^#{1,6}\s+.+$/gm);
  container.innerHTML = '';
  if (!headings) { container.innerHTML = '<div class="list-empty">暂无标题</div>'; return; }
  headings.forEach(h => {
    const level = (h.match(/^#+/) || [''])[0].length;
    const title = h.replace(/^#+\s*/, '');
    const btn = document.createElement('button');
    btn.className = 'toc-item';
    btn.textContent = title;
    btn.style.paddingLeft = (16 + (level-1) * 16) + 'px';
    btn.style.fontSize = (13 - level * 0.3) + 'px';
    btn.addEventListener('click', () => {
      scrollToHeading(title);
      toggleToc();
    });
    container.appendChild(btn);
  });
}
function scrollToHeading(headingText) {
  const headings = document.querySelectorAll('#readPanel h1, #readPanel h2, #readPanel h3, #readPanel h4, #readPanel h5, #readPanel h6');
  for (const h of headings) {
    if (h.textContent.trim() === headingText) { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  }
}

// ==============================
// Bookmarks
// ==============================
function getBookmarks() {
  const key = 'inknote_bookmarks_' + (state.currentFileName || 'default');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch(e) { return []; }
}
function saveBookmarks(bm) {
  const key = 'inknote_bookmarks_' + (state.currentFileName || 'default');
  localStorage.setItem(key, JSON.stringify(bm));
}
function addBookmark() {
  // Use the actual paragraph from current scroll position
  const panel = document.getElementById('readPanel');
  if (!panel) { log('书签: 无法添加（无内容）'); return; }
  // Find which paragraph is at the top of the viewport
  const paras = document.querySelectorAll('#content p, #content h1, #content h2, #content h3, #content h4, #content h5, #content h6, #content pre, #content blockquote, #content li');
  let closestIdx = 0;
  let closestDist = Infinity;
  const viewTop = panel.scrollTop;
  paras.forEach((p, i) => {
    const dist = Math.abs(p.offsetTop - viewTop);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });
  const snippet = (paras[closestIdx]?.textContent || '').trim().substring(0, 80);
  const bm = getBookmarks();
  bm.push({ idx: closestIdx, snippet, time: Date.now() });
  saveBookmarks(bm);
  log('书签已添加: #' + closestIdx + ' ' + snippet.substring(0, 30));
  highlightAndScroll(closestIdx);
}
function loadBookmarksForFile() {
  // Re-apply visual highlights for saved bookmarks? No need—bookmarks are panel-only
  log('书签已加载: ' + getBookmarks().length + ' 条');
}
function showBookmarks() {
  const bm = getBookmarks();
  const list = document.getElementById('bookmarkList');
  list.innerHTML = '';
  if (bm.length === 0) {
    list.innerHTML = '<div class="list-empty">暂无书签<br><span style="font-size:12px;color:#aaa;">滚动到目标段落 → 点击 🔖 添加书签</span></div>';
  } else {
    bm.forEach((b, i) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const timeStr = b.time ? new Date(b.time).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      item.innerHTML = `<div class="list-item-text" data-bm-idx="${i}" data-para-idx="${b.idx}">📍 #${b.idx} ${escapeHtml(b.snippet)}<br><span style="font-size:11px;color:#999;">${timeStr}</span></div>` +
        '<div class="list-item-actions"><button class="list-item-action" data-del="' + i + '" title="删除">🗑</button></div>';
      // Jump to bookmark
      item.querySelector('.list-item-text').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const paraIdx = parseInt(btn.dataset.paraIdx);
        closeBookmarkPanel();
        scrollToParagraph(paraIdx);
        highlightAndScroll(paraIdx);
      });
      // Delete bookmark
      item.querySelector('[data-del]').addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.currentTarget.dataset.del);
        bm.splice(idx, 1);
        saveBookmarks(bm);
        showBookmarks();
        log('书签已删除');
      });
      list.appendChild(item);
    });
  }
  document.getElementById('bookmarkOverlay').classList.add('show');
}
function closeBookmarkPanel() { document.getElementById('bookmarkOverlay').classList.remove('show'); }

// ==============================
// Highlights
// ==============================
function getHighlights() {
  try { return JSON.parse(localStorage.getItem('inknote_highlights_' + state.currentFileName) || '[]'); }
  catch(e) { return []; }
}
function saveHighlights(hl) {
  localStorage.setItem('inknote_highlights_' + state.currentFileName, JSON.stringify(hl));
}
function loadHighlightsForFile() {
  const hls = getHighlights();
  hls.forEach(h => applyHighlight(h.paraIdx, h.startOffset, h.endOffset, '#FFE082'));
}
function reapplyHighlightsAfterRender() {
  setTimeout(() => {
    const hls = getHighlights();
    hls.forEach(h => applyHighlight(h.paraIdx, h.startOffset, h.endOffset, '#FFE082'));
  }, 100);
}
function clearHighlights() {
  document.querySelectorAll('.user-highlight').forEach(sp => {
    while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
    sp.parentNode.removeChild(sp);
    sp.parentNode.normalize();
  });
}
function applyHighlight(paraIdx, startOffset, endOffset, color) {
  try {
    const all = document.getElementById('content').querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
    if (paraIdx < 0 || paraIdx >= all.length) return;
    const el = all[paraIdx];
    const text = el.textContent;
    if (startOffset < 0 || endOffset > text.length || startOffset >= endOffset) return;
    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      textNodes.push({ node, start: charCount, end: charCount + node.textContent.length });
      charCount += node.textContent.length;
    }
    let startTN = null, startOff = 0, endTN = null, endOff = 0;
    for (const tn of textNodes) {
      if (!startTN && tn.start <= startOffset && tn.end > startOffset) { startTN = tn.node; startOff = startOffset - tn.start; }
      if (tn.start < endOffset && tn.end >= endOffset) { endTN = tn.node; endOff = endOffset - tn.start; }
    }
    if (!startTN || !endTN) return;
    const range = document.createRange();
    range.setStart(startTN, startOff);
    range.setEnd(endTN, endOff);
    const frag = range.extractContents();
    const span = document.createElement('span');
    span.className = 'user-highlight';
    span.style.background = color + ' !important';
    span.dataset.hlStart = startOffset;
    span.dataset.hlEnd = endOffset;
    span.dataset.hlPara = paraIdx;
    span.appendChild(frag);
    range.insertNode(span);
  } catch(e) { logWarn('高亮错误: ' + e.message); }
}
function removeHighlightByRange(paraIdx, startOffset, endOffset) {
  const all = document.getElementById('content').querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (paraIdx < 0 || paraIdx >= all.length) return;
  const el = all[paraIdx];
  const spans = el.querySelectorAll('.user-highlight');
  for (const sp of spans) {
    if (parseInt(sp.dataset.hlStart) === startOffset && parseInt(sp.dataset.hlEnd) === endOffset) {
      while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
      sp.parentNode.removeChild(sp);
      sp.parentNode.normalize();
      return;
    }
  }
}
function showHighlights() {
  const hls = getHighlights();
  const list = document.getElementById('highlightList');
  list.innerHTML = '';
  if (hls.length === 0) {
    list.innerHTML = '<div class="list-empty">暂无高亮</div>';
  } else {
    hls.forEach((h, i) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = '<div class="list-item-text" data-idx="' + i + '">⭐ ' + escapeHtml(h.text.substring(0, 80)) + '</div>' +
        '<div class="list-item-actions"><button class="list-item-action" data-del="' + i + '">✕</button></div>';
      item.querySelector('.list-item-text').addEventListener('click', () => {
        closeHighlightPanel();
        highlightAndScroll(h.paraIdx);
      });
      item.querySelector('[data-del]').addEventListener('click', () => {
        removeHighlightByRange(h.paraIdx, h.startOffset, h.endOffset);
        hls.splice(i, 1);
        saveHighlights(hls);
        showHighlights();
      });
      list.appendChild(item);
    });
  }
  document.getElementById('highlightOverlay').classList.add('show');
}
function closeHighlightPanel() { document.getElementById('highlightOverlay').classList.remove('show'); }

// Selection → add highlight
document.addEventListener('selectionchange', () => {
  clearTimeout(window._selTimer);
  window._selTimer = setTimeout(() => {
    const s = window.getSelection();
    if (s && !s.isCollapsed && s.toString().trim()) {
      const rect = s.getRangeAt(0).getBoundingClientRect();
      const bar = document.getElementById('selectionToolbar');
      bar.style.top = Math.max(rect.top - 44, 8) + 'px';
      bar.style.left = Math.min(rect.left + rect.width/2 - 80, window.innerWidth - 180) + 'px';
      bar.classList.remove('hidden');
    } else {
      document.getElementById('selectionToolbar').classList.add('hidden');
    }
  }, 400);
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.selection-toolbar')) {
    document.getElementById('selectionToolbar').classList.add('hidden');
  }
});

// ==============================
// Selection Toolbar Actions
// ==============================
document.getElementById('selHighlight').addEventListener('click', () => {
  const s = window.getSelection();
  if (!s || s.isCollapsed) return;
  const info = getSelectionInfo();
  const hls = getHighlights();
  hls.push(info);
  saveHighlights(hls);
  applyHighlight(info.paraIdx, info.startOffset, info.endOffset, '#FFE082');
  s.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
  log('高亮已添加: ' + info.text.substring(0, 30));
});
document.getElementById('selTranslate').addEventListener('click', () => {
  const s = window.getSelection();
  if (s) doTranslate(s.toString());
  document.getElementById('selectionToolbar').classList.add('hidden');
});
document.getElementById('selTts').addEventListener('click', () => {
  const s = window.getSelection();
  if (s && s.toString().trim()) speakText(s.toString().trim());
  s?.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
});
document.getElementById('selCopy').addEventListener('click', () => {
  const s = window.getSelection();
  if (s) navigator.clipboard.writeText(s.toString()).catch(() => {});
  s?.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
});

function getSelectionInfo() {
  const s = window.getSelection();
  const text = s.toString().trim();
  const all = document.getElementById('content').querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  const range = s.getRangeAt(0);
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  let startParaIdx = -1, startOffset = range.startOffset;
  for (let i = 0; i < all.length; i++) {
    if (all[i].contains(startNode)) {
      startParaIdx = i;
      const walker = document.createTreeWalker(all[i], NodeFilter.SHOW_TEXT);
      let charCount = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === startNode) { startOffset = charCount + range.startOffset; break; }
        else charCount += walker.currentNode.textContent.length;
      }
      break;
    }
  }
  let endParaIdx = startParaIdx, endOffset = range.endOffset;
  for (let i = 0; i < all.length; i++) {
    if (all[i].contains(endNode)) {
      endParaIdx = i;
      const walker = document.createTreeWalker(all[i], NodeFilter.SHOW_TEXT);
      let charCount = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === endNode) { endOffset = charCount + range.endOffset; break; }
        else charCount += walker.currentNode.textContent.length;
      }
      break;
    }
  }
  return { text, paraIdx: startParaIdx, startOffset, endOffset };
}

// ==============================
// Paragraph helpers
// ==============================
function getCurrentParagraphIndex() {
  const content = document.getElementById('content');
  if (!content) return 0;
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 3;
  const el = document.elementFromPoint(cx, cy);
  if (!el) return 0;
  let target = el;
  while (target && target !== content) {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] === target || blocks[i].contains(target)) return i;
    }
    target = target.parentElement;
  }
  return 0;
}
function getParagraphAt(index) {
  const content = document.getElementById('content');
  if (!content) return '';
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (index >= 0 && index < blocks.length) return blocks[index].textContent.trim().substring(0, 80);
  return '';
}
function scrollToParagraph(index) {
  const content = document.getElementById('content');
  if (!content) return;
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (index >= 0 && index < blocks.length) blocks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function highlightAndScroll(index) {
  const content = document.getElementById('content');
  if (!content) return;
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (index >= 0 && index < blocks.length) {
    const el = blocks[index];
    el.style.transition = 'background-color 0.3s';
    el.style.backgroundColor = 'rgba(26, 115, 232, 0.15)';
    el.style.borderRadius = '4px';
    el.style.padding = '4px 8px';
    el.style.margin = '2px -4px';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      el.style.backgroundColor = '';
      el.style.borderRadius = '';
      el.style.padding = '';
      el.style.margin = '';
    }, 1500);
  }
}
function getParagraphsText() {
  const content = document.getElementById('content');
  if (!content) return '[]';
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  const texts = [];
  blocks.forEach(el => { const t = el.textContent.trim(); if (t) texts.push(t); });
  return JSON.stringify(texts);
}

// ==============================
// TTS (Text To Speech)
// ==============================
function getCleanText(text) {
  // Simplified — for paragraph text we already have clean text
  // Remove CJK spaces for Edge TTS
  return text.replace(/([\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff])\s+(?=[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff])/g, '$1');
}

function startTts() {
  const paraText = JSON.parse(getParagraphsText());
  if (paraText.length === 0) { log('TTS: 无段落可朗读'); return; }
  state.ttsParagraphs = paraText.map(t => getCleanText(t));
  state.ttsCurrentIdx = 0;
  state.isTtsPlaying = true;
  document.getElementById('tbTts').style.display = 'none';
  document.getElementById('tbTtsStop').style.display = '';
  log('TTS 开始, 共 ' + paraText.length + ' 段落');
  playNext(0);
}

function stopTts() {
  window.speechSynthesis.cancel();
  state.isTtsPlaying = false;
  state.ttsParagraphs = [];
  state.ttsCurrentIdx = 0;
  document.getElementById('tbTts').style.display = '';
  document.getElementById('tbTtsStop').style.display = 'none';
  clearTtsHighlight();
  log('TTS 已停止');
}

function playNext(idx) {
  if (idx >= state.ttsParagraphs.length) {
    log('TTS 完毕');
    stopTts();
    return;
  }
  const text = state.ttsParagraphs[idx];
  if (!text || text.trim().length === 0) { playNext(idx + 1); return; }
  state.ttsCurrentIdx = idx;
  ttsHighlight(idx);
  speakText(text, () => playNext(idx + 1));
}

function speakText(text, onDone) {
  // Try Edge TTS first, fallback to browser TTS
  const settings = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
  const endpoint = settings.ttsEndpoint || 'http://powerplus.blogsyte.com:5001';

  // Try Edge TTS
  fetch(endpoint + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      voice: settings.ttsVoice || 'zh-CN-XiaoxiaoNeural',
      rate: '-10%',
    })
  })
  .then(resp => {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.blob();
  })
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); if (onDone) onDone(); };
    audio.onerror = () => { URL.revokeObjectURL(url); if (onDone) onDone(); };
    audio.play().catch(() => { if (onDone) onDone(); });
  })
  .catch(() => {
    // Fallback to Browser TTS
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    utter.onend = () => { if (onDone) onDone(); };
    utter.onerror = () => { if (onDone) onDone(); };
    window.speechSynthesis.speak(utter);
  });
}

function ttsHighlight(idx) {
  clearTtsHighlight();
  const content = document.getElementById('content');
  if (!content) return;
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (idx >= 0 && idx < blocks.length) {
    const el = blocks[idx];
    el.style.transition = 'background-color 0.3s';
    el.style.backgroundColor = 'rgba(26, 115, 232, 0.15)';
    el.style.borderRadius = '4px';
    el.style.padding = '4px 8px';
    el.style.margin = '2px -4px';
    el.dataset.ttsHighlight = '1';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function clearTtsHighlight() {
  document.querySelectorAll('[data-tts-highlight]').forEach(el => {
    el.style.backgroundColor = '';
    el.style.borderRadius = '';
    el.style.padding = '';
    el.style.margin = '';
    el.removeAttribute('data-tts-highlight');
  });
}

// ==============================
// Translation (DeepSeek API)
// ==============================
function doTranslate(text) {
  const settings = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
  const endpoint = settings.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
  const apiKey = settings.apiKey;
  const model = settings.apiModel || 'deepseek-chat';

  if (!apiKey) {
    alert('请先设置翻译 API Key（⚙️ 设置）');
    document.getElementById('settingsOverlay').classList.add('show');
    return;
  }

  log('翻译: ' + text.substring(0, 50) + '...');
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are a translation assistant. Translate the following text to Chinese. Return only the translation, no explanation.' },
        { role: 'user', content: text }
      ],
      max_tokens: 1024,
    })
  })
  .then(resp => resp.json())
  .then(data => {
    const result = data.choices?.[0]?.message?.content || '翻译失败';
    document.getElementById('translateResult').textContent = result;
    document.getElementById('translateOverlay').classList.add('show');
  })
  .catch(err => {
    logError('翻译失败: ' + err.message);
    document.getElementById('translateResult').textContent = '翻译失败: ' + err.message;
    document.getElementById('translateOverlay').classList.add('show');
  });
}
function closeTranslateResult() { document.getElementById('translateOverlay').classList.remove('show'); }

// ==============================
// Export
// ==============================
function showExportMenu() {
  const choice = confirm('导出格式选项:\n确定 → 导出 HTML\n取消 → 复制 Markdown 原文');
  if (choice) {
    exportHtml();
  } else {
    navigator.clipboard.writeText(state.currentContent).then(() => {
      log('Markdown 已复制到剪贴板');
    }).catch(() => {});
  }
}

function exportHtml() {
  const html = document.getElementById('content').innerHTML;
  const fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">' +
    '<style>body{max-width:800px;margin:0 auto;padding:20px;font-family:-apple-system,sans-serif;line-height:1.8;}' +
    'pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto;}' +
    'table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ddd;padding:8px 12px;}' +
    'blockquote{border-left:4px solid #1a73e8;padding:8px 16px;background:#f0f4ff;}' +
    'img{max-width:100%;}</style></head><body>' + html + '</body></html>';
  const blob = new Blob([fullHtml], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = state.currentFileName.replace(/\.\w+$/, '') + '.html';
  a.click();
  URL.revokeObjectURL(blob);
  log('HTML 已导出');
}

// ==============================
// Page scroll
// ==============================
function scrollPage(direction) {
  const panel = document.getElementById('readPanel');
  if (!panel) return;
  const amount = panel.clientHeight * 0.85;
  panel.scrollBy({ top: direction === 'down' ? amount : -amount, behavior: 'smooth' });
}

// ==============================
// UI helpers
// ==============================
function hideWelcome() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('readPanel').classList.remove('hidden');
  document.getElementById('floatingToolbar').classList.remove('hidden');
}
function showToolbar() {
  document.getElementById('floatingToolbar').classList.remove('hidden');
}

// ==============================
// Open file dialog
// ==============================
function showOpenFileDialog() {
  document.getElementById('fileInput').click();
}
function showUrlDialog() {
  document.getElementById('urlOverlay').classList.add('show');
  document.getElementById('urlInput').value = '';
  document.getElementById('urlInput').focus();
}
function closeUrlDialog() { document.getElementById('urlOverlay').classList.remove('show'); }

// Settings
function openSettings() { document.getElementById('settingsOverlay').classList.add('show'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('show'); }

// ==============================
// Drag & Drop
// ==============================
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt') || file.name.endsWith('.html')) {
      openLocalFile(file);
    } else {
      logWarn('不支持的格式: ' + file.name);
    }
  } else {
    // Check for URL from drag
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && (url.endsWith('.md') || url.endsWith('.markdown') || url.endsWith('.txt'))) {
      openUrl(url);
    }
  }
});

// ==============================
// Event Bindings
// ==============================
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();

  // File operations
  document.getElementById('btnOpenFile').addEventListener('click', showOpenFileDialog);
  document.getElementById('btnOpenUrl').addEventListener('click', showUrlDialog);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('welcomeOpenFile').addEventListener('click', showOpenFileDialog);
  document.getElementById('welcomeOpenUrl').addEventListener('click', showUrlDialog);
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) openLocalFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btnUrlConfirm').addEventListener('click', () => {
    const url = document.getElementById('urlInput').value.trim();
    if (url) { openUrl(url); closeUrlDialog(); }
  });
  document.getElementById('urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnUrlConfirm').click();
  });

  // Theme
  document.getElementById('tbTheme').addEventListener('click', cycleTheme);

  // Font
  document.getElementById('tbFontDec').addEventListener('click', decFont);
  document.getElementById('tbFontInc').addEventListener('click', incFont);

  // TTS
  document.getElementById('tbTts').addEventListener('click', startTts);
  document.getElementById('tbTtsStop').addEventListener('click', stopTts);

  // Search
  document.getElementById('tbSearch').addEventListener('click', () => { if (state.isSearchVisible) hideSearch(); else showSearch(); });
  document.getElementById('searchInput').addEventListener('input', (e) => doSearch(e.target.value));
  document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.shiftKey ? prevSearch() : nextSearch(); });
  document.getElementById('searchNext').addEventListener('click', nextSearch);
  document.getElementById('searchPrev').addEventListener('click', prevSearch);
  document.getElementById('searchClose').addEventListener('click', hideSearch);

  // TOC
  document.getElementById('tbToc').addEventListener('click', toggleToc);
  document.getElementById('btnTocClose').addEventListener('click', toggleToc);

  // Bookmarks
  document.getElementById('tbBookmarkAdd').addEventListener('click', addBookmark);
  document.getElementById('tbBookmarkList').addEventListener('click', showBookmarks);
  document.getElementById('tbHighlights').addEventListener('click', showHighlights);

  // Edit
  document.getElementById('tbEdit').addEventListener('click', toggleEdit);

  // Fullscreen
  document.getElementById('tbFullscreen').addEventListener('click', toggleFullscreen);

  // Export
  document.getElementById('tbExport').addEventListener('click', showExportMenu);

  // Translate
  document.getElementById('tbTranslate').addEventListener('click', () => {
    const s = window.getSelection();
    if (s && s.toString().trim()) doTranslate(s.toString());
    else log('翻译: 请先选中文字');
  });

  // Settings save
  document.getElementById('btnSettingsSave').addEventListener('click', () => { saveSettings(); closeSettings(); });

  // Debug
  document.getElementById('debugToggle').addEventListener('click', () => {
    const body = document.getElementById('debugBody');
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
    if (body.style.display === 'block') {
      body.innerHTML = '';
      _debugLogs.forEach(e => {
        const entry = document.createElement('div');
        entry.className = 'debug-entry';
        entry.innerHTML = `<span class="t">${e.t}</span> <span class="l-${e.level.toLowerCase()}">[${e.level}]</span> ${escapeHtml(e.msg)}`;
        body.appendChild(entry);
      });
      body.scrollTop = body.scrollHeight;
    }
  });
  document.getElementById('debugCopy').addEventListener('click', () => {
    const text = _debugLogs.map(e => `${e.t} [${e.level}] ${e.msg}`).join('\n');
    navigator.clipboard.writeText(text).then(() => log('日志已复制')).catch(() => {});
  });
  document.getElementById('debugClear').addEventListener('click', () => {
    _debugLogs.length = 0;
    document.getElementById('debugBody').innerHTML = '';
    log('日志已清空');
  });

  // Dialog action buttons (data-action)
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'closeUrlDialog') closeUrlDialog();
    else if (action === 'closeSettings') closeSettings();
    else if (action === 'closeBookmarkPanel') closeBookmarkPanel();
    else if (action === 'closeHighlightPanel') closeHighlightPanel();
    else if (action === 'closeTranslateResult') closeTranslateResult();
  });

  // Click overlay background to close
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', (e) => {
      if (e.target === o) { o.classList.remove('show'); }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S: save (no-op in extension, but toggle edit)
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (state.isEditMode) toggleEdit(); }
    // Ctrl+F: search
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); showSearch(); }
    // Escape: close modals / search / sidebar
    if (e.key === 'Escape') {
      if (state.isSearchVisible) hideSearch();
      if (state.isTocVisible) toggleToc();
      document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show'));
    }
  });

  // Keyboard nav for page (u/d)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'j' || e.key === 'ArrowDown') scrollPage('down');
    if (e.key === 'k' || e.key === 'ArrowUp') scrollPage('up');
  });

  // Handle URL params (from context menu)
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('url');
  const textParam = params.get('text');
  if (urlParam) {
    openUrl(urlParam);
  } else if (textParam) {
    state.currentContent = textParam;
    state.currentFileName = '选中文本.md';
    loadContent();
  }

  log('墨笺 InkNote 已启动');
  log('💡 拖拽 .md 文件、右键 .md 链接打开');
});
