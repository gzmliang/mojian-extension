/* ===== 墨笺 InkNote v2.0 — Reader Logic ===== */

// ==============================
// Debug Log
// ==============================
const _debugLogs = [];
function log(msg, level = 'I') {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
  _debugLogs.push({ t, msg, level });
  console.log('[InkNote] ' + msg);
  const body = document.getElementById('debugBody');
  if (body && body.style.display !== 'none') {
    const e = document.createElement('div');
    e.className = 'debug-entry';
    e.innerHTML = '<span class="t">' + t + '</span> <span class="l-' + level.toLowerCase() + '">[' + level + ']</span> ' + escapeHtml(msg);
    body.appendChild(e);
    body.scrollTop = body.scrollHeight;
  }
}
function logError(msg) { log(msg, 'E'); }
function logWarn(msg) { log(msg, 'W'); }

// Auto-capture runtime errors
window.addEventListener('error', function(e) {
  logError(e.message + ' at ' + (e.filename || '') + ':' + (e.lineno || ''));
  return false;
});
window.addEventListener('unhandledrejection', function(e) {
  logError('Promise: ' + (e.reason || '').toString().substring(0, 200));
});

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
function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}
function countStats(text) {
  const chars = text.length;
  const cnChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const enWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const lines = text.split('\n').length;
  const paras = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  return { chars, cnChars, enWords, lines, paras };
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
  editMode: 'read', // 'read' | 'wysiwyg' | 'source'
  isFullscreen: false,
  isTtsPlaying: false,
  ttsParagraphs: [],
  ttsCurrentIdx: 0,
  isSearchVisible: false,
  isTocVisible: false,
  searchMatches: [],
  searchCurrentIdx: -1,
};

// ==============================
// Settings
// ==============================
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
    state.fontSize = s.fontSize || 16;
    state.theme = s.theme || 'light';
    document.getElementById('settingApiEndpoint').value = s.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
    document.getElementById('settingApiKey').value = s.apiKey || '';
    document.getElementById('settingApiModel').value = s.apiModel || 'deepseek-chat';
    document.getElementById('settingTtsEndpoint').value = s.ttsEndpoint || 'http://powerplus.blogsyte.com:5001';
    document.getElementById('settingTtsVoice').value = s.ttsVoice || 'zh-CN-XiaoxiaoNeural';
    applyTheme(state.theme);
    applyFontSize(state.fontSize);
  } catch(e) { logWarn(__('log.settings_load', {msg: e.message})); }
}
function saveSettings() {
  const s = {
    fontSize: state.fontSize, theme: state.theme,
    apiEndpoint: document.getElementById('settingApiEndpoint').value,
    apiKey: document.getElementById('settingApiKey').value,
    apiModel: document.getElementById('settingApiModel').value,
    ttsEndpoint: document.getElementById('settingTtsEndpoint').value,
    ttsVoice: document.getElementById('settingTtsVoice').value,
  };
  localStorage.setItem('inknote_settings', JSON.stringify(s));
  log(__('log.settings_saved'));
}

// ==============================
// Theme
// ==============================
function applyTheme(theme) {
  state.theme = theme;
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  if (theme !== 'light') document.body.classList.add('theme-' + theme);
  document.getElementById('tbTheme').textContent = theme === 'dark' ? '☀️' : theme === 'sepia' ? '🌙' : '🌞';
  // Update mermaid theme
  const mermaidTheme = theme === 'dark' ? 'dark' : theme === 'sepia' ? 'neutral' : 'default';
  try { mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'strict' }); } catch(e) {}
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
  document.getElementById('wysiwygContent').style.fontSize = state.fontSize + 'px';
}
function decFont() { applyFontSize(state.fontSize - 1); saveSettings(); }
function incFont() { applyFontSize(state.fontSize + 1); saveSettings(); }

// ==============================
// Rendering engine
// ==============================
try { mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' }); } catch(e) { console.warn(e.message); }
try { marked.setOptions({ breaks: true, gfm: true }); } catch(e) { console.warn(e.message); }
try { hljs.configure({ ignoreUnescapedHTML: true }); } catch(e) {}

// ==============================
// Recent Files
// ==============================
function getRecentFiles() {
  try { return JSON.parse(localStorage.getItem('inknote_recent') || '[]'); } catch(e) { return []; }
}
function addRecentFile(name, path, content) {
  const stats = countStats(content || '');
  const entry = { name: name || 'untitled', path: path || name || '', time: Date.now(), size: (content || '').length, lines: stats.lines };
  let recent = getRecentFiles();
  recent = recent.filter(r => r.name !== name || r.path !== path);
  recent.unshift(entry);
  if (recent.length > 20) recent = recent.slice(0, 20);
  localStorage.setItem('inknote_recent', JSON.stringify(recent));
}
function removeRecentFile(index) {
  let recent = getRecentFiles();
  recent.splice(index, 1);
  localStorage.setItem('inknote_recent', JSON.stringify(recent));
  renderRecentFiles();
}
function renderRecentFiles() {
  const list = document.getElementById('recentFilesList');
  const recent = getRecentFiles();
  if (!list) return;
  list.innerHTML = '';
  if (recent.length === 0) {
    list.innerHTML = '<div class="recent-file-empty">' + __('recent_empty') + '</div>';
    return;
  }
  recent.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'recent-file-item';
    const timeStr = r.time ? new Date(r.time).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    const sizeStr = r.size ? (r.size > 1024 ? (r.size/1024).toFixed(1)+'KB' : r.size+'B') : '';
    item.innerHTML = '<span class="name">' + escapeHtml(r.name) + '</span>' +
      '<span class="time">' + timeStr + ' ' + sizeStr + '</span>' +
      '<button class="btn-icon-sm" style="font-size:10px;color:#ccc;" data-rec-del="' + i + '">✕</button>';
    item.addEventListener('click', function(e) {
      if (e.target.closest('[data-rec-del]')) return;
      const name = r.name;
      // Try to reload from path if it's a URL, or prompt the user
      if (r.path && (r.path.startsWith('http://') || r.path.startsWith('https://'))) {
        openUrl(r.path);
      } else {
        // For local files, can't re-open from path. Show file picker pre-selected.
        document.getElementById('fileInput').click();
      }
    });
    list.appendChild(item);
    // Wire delete button
    item.querySelector('[data-rec-del]').addEventListener('click', function(e) {
      e.stopPropagation();
      removeRecentFile(parseInt(this.dataset.recDel));
    });
  });
}

// ==============================
// File Info Bar
// ==============================
function updateFileInfo(content, name) {
  const bar = document.getElementById('fileInfoBar');
  bar.classList.remove('hidden');
  document.getElementById('fileInfoPath').textContent = name || '';
  const sizeStr = content ? (content.length > 1024 ? (content.length/1024).toFixed(1) + ' KB' : content.length + ' B') : '';
  document.getElementById('fileInfoSize').textContent = sizeStr;
  const stats = countStats(content || '');
  document.getElementById('fileInfoStats').textContent = __('label.file_info', {cn: stats.cnChars, en: stats.enWords, p: stats.paras, l: stats.lines});
  updateStatusBar(stats);
}
function updateStatusBar(stats) {
  const el = document.getElementById('statusBar');
  if (stats) {
    el.textContent = __('label.status_bar', {chars: stats.chars, paras: stats.paras});
  }
}

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
    addRecentFile(state.currentFileName, state.currentFilePath, state.currentContent);
    renderRecentFiles();
    log(__('log.opened_file', {name: file.name, chars: state.currentContent.length}));
  };
  reader.onerror = function() { logError(__('log.file_load_fail')); };
  reader.readAsText(file);
}

async function openUrl(url) {
  try {
    log(__('log.opened_url', {url: url}));
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    state.currentContent = text;
    state.currentFileName = url.split('/').pop() || 'untitled.md';
    state.currentFilePath = url;
    state.isHtmlFile = state.currentFileName.toLowerCase().endsWith('.html');
    loadContent();
    addRecentFile(state.currentFileName, state.currentFilePath, state.currentContent);
    renderRecentFiles();
    log(__('log.loaded_url', {name: state.currentFileName, chars: text.length}));
  } catch(e) {
    logError(__('log.url_load_fail', {msg: e.message}));
    alert(__('log.url_load_fail', {msg: e.message}));
  }
}

function loadContent() {
  // Hide welcome and enter read mode
  state.editMode = 'read';
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('readPanel').classList.remove('hidden');
  document.getElementById('wysiwygPanel').classList.add('hidden');
  document.getElementById('editPanel').classList.add('hidden');
  document.getElementById('wysiwygToolbar').classList.add('hidden');
  document.getElementById('floatingToolbar').classList.remove('hidden');
  document.getElementById('fileName').textContent = state.currentFileName;
  updateFileInfo(state.currentContent, state.currentFileName);
  updateModeButtons();

  if (state.isHtmlFile) {
    document.getElementById('content').innerHTML = state.currentContent;
    hljs.highlightAll();
  } else {
    renderMarkdown(state.currentContent);
  }
  clearHighlights();
  loadBookmarksForFile();
  loadHighlightsForFile();
}

// ==============================
// Markdown Rendering with Syntax Highlighting
// ==============================
function renderMarkdown(rawMd) {
  const readPanel = document.getElementById('readPanel');
  readPanel.classList.remove('hidden');
  state.currentContent = rawMd;
  try {
    // Extract and preserve mermaid blocks
    const mermaidBlocks = [];
    const preprocessed = rawMd.replace(/```mermaid\n([\s\S]*?)```/g, function(match, code) {
      const id = 'mermaid-' + mermaidBlocks.length;
      mermaidBlocks.push({ id: id, code: code });
      return '<div class="mermaid" id="' + id + '">' + code + '</div>';
    });
    const html = marked.parse(preprocessed);
    document.getElementById('content').innerHTML = html;
    log(__('log.rendered', {len: html.length}));

    // KaTeX math rendering
    try {
      renderMathInElement(document.getElementById('content'), {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false, strict: false,
      });
    } catch(e) { logWarn('KaTeX: ' + e.message); }

    // Syntax highlighting via highlight.js
    try {
      document.querySelectorAll('#content pre code').forEach(function(block) {
        if (!block.classList.contains('hljs')) {
          hljs.highlightElement(block);
        }
      });
    } catch(e) { logWarn('highlight.js: ' + e.message); }

    // Mermaid rendering
    if (mermaidBlocks.length > 0) {
      requestAnimationFrame(function() {
        mermaidBlocks.forEach(function(item) {
          const el = document.getElementById(item.id);
          if (el && el.textContent && el.textContent.trim()) {
            mermaid.render(item.id + '-' + Date.now(), el.textContent.trim())
              .then(function(result) { el.innerHTML = result.svg; })
              .catch(function(e) { el.innerHTML = '<pre style="color:red;">Mermaid Error: ' + escapeHtml(e.message) + '</pre>'; });
          }
        });
      });
    }
    reapplyHighlightsAfterRender();
  } catch(e) {
    document.getElementById('content').innerHTML = '<pre style="color:red;">' + __('log.render_error', {msg: escapeHtml(e.message)}) + '</pre>';
    logError(__('log.render_error', {msg: e.message}));
  }
}

// ==============================
// WYSIWYG Mode
// ==============================
function enterWysiwyg() {
  if (state.editMode === 'wysiwyg') return;
  log(__('log.wysiwyg_enter'));

  // Save source content from current mode
  if (state.editMode === 'source') {
    state.currentContent = getSourceEditorContent();
  }

  // Convert markdown to HTML
  const html = markdownToHtml(state.currentContent);
  const wysiwygContent = document.getElementById('wysiwygContent');
  wysiwygContent.innerHTML = html;

  // Switch panels
  document.getElementById('readPanel').classList.add('hidden');
  document.getElementById('editPanel').classList.add('hidden');
  document.getElementById('wysiwygPanel').classList.remove('hidden');
  document.getElementById('wysiwygToolbar').classList.remove('hidden');

  state.editMode = 'wysiwyg';
  updateModeButtons();
  wysiwygContent.focus();
  // Initialize undo stack
  wysiwygUndoStack = [html];
  wysiwygRedoStack = [];
  log(__('log.wysiwyg_undo_ready'));
}

function leaveWysiwyg(applyChanges) {
  if (state.editMode !== 'wysiwyg') return;
  log(__('log.wysiwyg_leave') + (applyChanges ? ' (' + __('log.wysiwyg_leave_save') + ')' : ''));

  if (applyChanges) {
    const html = document.getElementById('wysiwygContent').innerHTML;
    const md = htmlToMarkdown(html);
    state.currentContent = md;
    // Re-render
    renderMarkdown(md);
    updateFileInfo(md, state.currentFileName);
  }

  document.getElementById('wysiwygPanel').classList.add('hidden');
  document.getElementById('wysiwygToolbar').classList.add('hidden');
  document.getElementById('readPanel').classList.remove('hidden');
  state.editMode = 'read';
  updateModeButtons();
}

function enterSourceEdit() {
  if (state.editMode === 'source') return;
  log(__('log.source_enter'));

  // Save content from WYSIWYG if coming from there
  if (state.editMode === 'wysiwyg') {
    const html = document.getElementById('wysiwygContent').innerHTML;
    state.currentContent = htmlToMarkdown(html);
  }

  document.getElementById('readPanel').classList.add('hidden');
  document.getElementById('wysiwygPanel').classList.add('hidden');
  document.getElementById('wysiwygToolbar').classList.add('hidden');
  document.getElementById('editPanel').classList.remove('hidden');

  // Setup textarea
  const editor = document.getElementById('cmEditor');
  editor.innerHTML = '<textarea id="sourceTextarea" spellcheck="false" style="width:100%;height:100%;border:none;padding:16px;font-family:JetBrains Mono,monospace;font-size:14px;line-height:1.6;resize:none;outline:none;background:inherit;color:inherit;">' + escapeHtml(state.currentContent) + '</textarea>';

  state.editMode = 'source';
  updateModeButtons();
  document.getElementById('sourceTextarea').focus();
}

function getSourceEditorContent() {
  const ta = document.getElementById('sourceTextarea');
  return ta ? ta.value : state.currentContent;
}

function markdownToHtml(md) {
  try {
    // Pre-process mermaid blocks to preserve them
    const mermaidBlocks = [];
    const preprocessed = md.replace(/```mermaid\n([\s\S]*?)```/g, function(match, code) {
      const id = 'mmd-' + mermaidBlocks.length;
      mermaidBlocks.push({ id: id, code: code });
      return '<pre data-mermaid-id="' + id + '" class="mermaid-placeholder">[' + id + ']</pre>';
    });
    let html = marked.parse(preprocessed);
    // Replace mermaid placeholders
    mermaidBlocks.forEach(function(item) {
      html = html.replace('<pre data-mermaid-id="' + item.id + '" class="mermaid-placeholder">[' + item.id + ']</pre>',
        '<pre class="mermaid-wysiwyg">' + escapeHtml('```mermaid\n' + item.code + '\n```') + '</pre>');
    });
    return html;
  } catch(e) {
    logWarn(__('log.md_to_html_fail', {msg: e.message}));
    return '<p>' + escapeHtml(md.substring(0, 200)) + '...</p>';
  }
}

function htmlToMarkdown(html) {
  try {
    if (typeof turndownService === 'undefined') {
      // Fallback: use text content
      logWarn(__('log.turndown_fallback'));
      return htmlToText(html);
    }
    return turndownService.turndown(html);
  } catch(e) {
    logWarn(__('log.html_to_md_fail', {msg: e.message}));
    return htmlToText(html);
  }
}

// Initialize turndown service
let turndownService = null;
try {
  if (typeof TurndownService !== 'undefined') {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
    });
    turndownService.addRule('strikethrough', {
      filter: ['s', 'del', 'strike'],
      replacement: function(content) { return '~~' + content + '~~'; }
    });
    // Table rule: clean table conversion
    turndownService.addRule('table', {
      filter: 'table',
      replacement: function(content, node) {
        var rows = node.querySelectorAll('tr');
        var md = '\n';
        rows.forEach(function(row, ri) {
          var cells = row.querySelectorAll('th, td');
          var sepRow = ri === 0;
          if (!sepRow) {
            md += '|';
            cells.forEach(function(cell) {
              var text = (cell.textContent || '').trim();
              md += ' ' + text + ' |';
            });
            md += '\n';
          } else {
            // Header row + separator
            md += '|';
            var sepCells = [];
            cells.forEach(function(cell) {
              var text = (cell.textContent || '').trim();
              md += ' ' + text + ' |';
              sepCells.push('---');
            });
            md += '\n| ' + sepCells.join(' | ') + ' |\n';
          }
        });
        return md;
      }
    });
    log(__('log.turndown_ready'));
  }
} catch(e) { logWarn(__('log.turndown_fail', {msg: e.message})); }

// WYSIWYG formatting commands
function wysiwygCommand(cmd) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) {
    // Insert placeholder or just apply
  }
  switch(cmd) {
    case 'bold': document.execCommand('bold', false, null); break;
    case 'italic': document.execCommand('italic', false, null); break;
    case 'underline': document.execCommand('underline', false, null); break;
    case 'heading1': document.execCommand('formatBlock', false, '<h1>'); break;
    case 'heading2': document.execCommand('formatBlock', false, '<h2>'); break;
    case 'heading3': document.execCommand('formatBlock', false, '<h3>'); break;
    case 'unorderedList': document.execCommand('insertUnorderedList', false, null); break;
    case 'orderedList': document.execCommand('insertOrderedList', false, null); break;
    case 'blockquote': document.execCommand('formatBlock', false, '<blockquote>'); break;
    case 'code': {
      const selText = sel.toString().trim();
      if (selText) {
        // Wrap selection in code
        document.execCommand('insertHTML', false, '<pre><code>' + escapeHtml(selText) + '</code></pre>');
      } else {
        // Insert code block
        document.execCommand('insertHTML', false, '<pre><code>' + __('code_placeholder') + '</code></pre>');
      }
      break;
    }
    case 'link': {
      const url = prompt(__('translate_prompt'), 'https://');
      if (url) document.execCommand('createLink', false, url);
      break;
    }
    case 'undo': wysiwygUndo(); break;
    case 'redo': wysiwygRedo(); break;
  }
  document.getElementById('wysiwygContent').focus();
}

// ==============================
// Mode Switching
// ==============================
function setMode(mode) {
  log(__('log.mode_switch', {mode: mode}));
  if (mode === 'read') {
    if (state.editMode === 'wysiwyg') leaveWysiwyg(true);
    else if (state.editMode === 'source') {
      state.currentContent = getSourceEditorContent();
      renderMarkdown(state.currentContent);
      document.getElementById('editPanel').classList.add('hidden');
      document.getElementById('readPanel').classList.remove('hidden');
      state.editMode = 'read';
      updateModeButtons();
    }
  } else if (mode === 'wysiwyg') {
    enterWysiwyg();
  } else if (mode === 'source') {
    enterSourceEdit();
  }
}

function updateModeButtons() {
  document.getElementById('tbModeRead').classList.toggle('mode-active', state.editMode === 'read');
  document.getElementById('tbModeWysiwyg').classList.toggle('mode-active', state.editMode === 'wysiwyg');
  document.getElementById('tbModeSource').classList.toggle('mode-active', state.editMode === 'source');
  // Show/hide font size controls (only in read mode)
  const fontGroup = document.querySelector('.tb-font-group');
  if (fontGroup) fontGroup.style.display = state.editMode === 'read' ? '' : 'none';
}

// ==============================
// Fullscreen
// ==============================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(function() {
      state.isFullscreen = true;
    }).catch(function(e) { logWarn(__('log.fullscreen_fail', {msg: e.message})); });
  } else {
    document.exitFullscreen().then(function() {
      state.isFullscreen = false;
    });
  }
}
document.addEventListener('fullscreenchange', function() {
  state.isFullscreen = !!document.fullscreenElement;
});

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
      return (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'MATH' || tag === 'NOSCRIPT')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
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
  document.getElementById('searchInfo').textContent = __('label.search_info_count', {n: allMatches.length});
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
  document.querySelectorAll('.search-match-active').forEach(function(s) { s.className = 'search-match'; });
  if (index >= 0 && index < state.searchMatches.length) {
    state.searchCurrentIdx = index;
    state.searchMatches[index].className = 'search-match-active';
    state.searchMatches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('searchInfo').textContent = __('label.search_info_pos', {cur: index+1, total: state.searchMatches.length});
  }
}
function nextSearch() { highlightSearchMatch((state.searchCurrentIdx + 1) % state.searchMatches.length); }
function prevSearch() { highlightSearchMatch(state.searchCurrentIdx <= 0 ? state.searchMatches.length - 1 : state.searchCurrentIdx - 1); }
function clearSearchHighlights() {
  document.querySelectorAll('.search-match, .search-match-active').forEach(function(span) {
    const parent = span.parentNode;
    if (parent) { parent.replaceChild(document.createTextNode(span.textContent), span); parent.normalize(); }
  });
  state.searchMatches = [];
  state.searchCurrentIdx = -1;
}

// ==============================
// TOC
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
  if (!headings) { container.innerHTML = '<div class="list-empty">' + __('toc_empty') + '</div>'; return; }
  headings.forEach(function(h) {
    const level = (h.match(/^#+/) || [''])[0].length;
    const title = h.replace(/^#+\s*/, '');
    const btn = document.createElement('button');
    btn.className = 'toc-item';
    btn.textContent = title;
    btn.style.paddingLeft = (14 + (level-1) * 14) + 'px';
    btn.style.fontSize = Math.max(11, 13 - level * 0.3) + 'px';
    btn.addEventListener('click', function() {
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
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}
function saveBookmarks(bm) {
  const key = 'inknote_bookmarks_' + (state.currentFileName || 'default');
  localStorage.setItem(key, JSON.stringify(bm));
}
function addBookmark() {
  const panel = document.getElementById('readPanel');
  if (!panel) { log('书签: 无内容'); return; }
  const paras = document.querySelectorAll('#content p, #content h1, #content h2, #content h3, #content h4, #content h5, #content h6, #content pre, #content blockquote, #content li');
  let closestIdx = 0, closestDist = Infinity;
  const viewTop = panel.scrollTop;
  paras.forEach(function(p, i) {
    const dist = Math.abs(p.offsetTop - viewTop);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });
  const snippet = (paras[closestIdx]?.textContent || '').trim().substring(0, 80);
  const bm = getBookmarks();
  bm.push({ idx: closestIdx, snippet: snippet, time: Date.now() });
  saveBookmarks(bm);
  log(__('log.bookmark_added', {idx: closestIdx}));
  highlightAndScroll(closestIdx);
}
function loadBookmarksForFile() {
  log(__('log.bookmark_count', {n: getBookmarks().length}));
}
function showBookmarks() {
  const bm = getBookmarks();
  const list = document.getElementById('bookmarkList');
  list.innerHTML = '';
  if (bm.length === 0) {
    list.innerHTML = '<div class="list-empty">' + __('bookmark_empty') + '<br><span style="font-size:12px;color:#aaa;">' + __('bookmark_hint') + '</span></div>';
  } else {
    bm.forEach(function(b, i) {
      const item = document.createElement('div');
      item.className = 'list-item';
      const timeStr = b.time ? new Date(b.time).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      item.innerHTML = '<div class="list-item-text" data-para-idx="' + b.idx + '">📍 #' + b.idx + ' ' + escapeHtml(b.snippet) +
        '<br><span style="font-size:11px;color:#999;">' + timeStr + '</span></div>' +
        '<div class="list-item-actions"><button class="list-item-action" data-del="' + i + '" title="删除">🗑</button></div>';
      item.querySelector('.list-item-text').addEventListener('click', function(e) {
        const btn = e.currentTarget;
        const paraIdx = parseInt(btn.dataset.paraIdx);
        closeBookmarkPanel();
        scrollToParagraph(paraIdx);
        highlightAndScroll(paraIdx);
      });
      item.querySelector('[data-del]').addEventListener('click', function(e) {
        e.stopPropagation();
        const idx = parseInt(this.dataset.del);
        bm.splice(idx, 1);
        saveBookmarks(bm);
        showBookmarks();
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
  try { return JSON.parse(localStorage.getItem('inknote_highlights_' + state.currentFileName) || '[]'); } catch(e) { return []; }
}
function saveHighlights(hl) { localStorage.setItem('inknote_highlights_' + state.currentFileName, JSON.stringify(hl)); }
function loadHighlightsForFile() {
  getHighlights().forEach(function(h) { applyHighlight(h.paraIdx, h.startOffset, h.endOffset, '#FFE082'); });
}
function reapplyHighlightsAfterRender() {
  setTimeout(function() {
    getHighlights().forEach(function(h) { applyHighlight(h.paraIdx, h.startOffset, h.endOffset, '#FFE082'); });
  }, 150);
}
function clearHighlights() {
  document.querySelectorAll('.user-highlight').forEach(function(sp) {
    while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
    sp.parentNode.removeChild(sp); sp.parentNode.normalize();
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
    while (walker.nextNode()) { const n = walker.currentNode; textNodes.push({node:n, start:charCount, end:charCount + n.textContent.length}); charCount += n.textContent.length; }
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
    span.appendChild(frag);
    range.insertNode(span);
  } catch(e) { logWarn(__('log.highlight_warn', {msg: e.message})); }
}
function removeHighlightByRange(paraIdx, startOffset, endOffset) {
  const all = document.getElementById('content').querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  if (paraIdx < 0 || paraIdx >= all.length) return;
  all[paraIdx].querySelectorAll('.user-highlight').forEach(function(sp) {
    if (parseInt(sp.dataset.hlStart) === startOffset && parseInt(sp.dataset.hlEnd) === endOffset) {
      while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
      sp.parentNode.removeChild(sp); sp.parentNode.normalize();
    }
  });
}
function showHighlights() {
  const hls = getHighlights();
  const list = document.getElementById('highlightList');
  list.innerHTML = '';
  if (hls.length === 0) { list.innerHTML = '<div class="list-empty">' + __('highlight_empty') + '</div>'; }
  else {
    hls.forEach(function(h, i) {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = '<div class="list-item-text">⭐ ' + escapeHtml(h.text.substring(0, 80)) + '</div><div class="list-item-actions"><button class="list-item-action" data-del="' + i + '">✕</button></div>';
      item.querySelector('.list-item-text').addEventListener('click', function() { closeHighlightPanel(); highlightAndScroll(h.paraIdx); });
      item.querySelector('[data-del]').addEventListener('click', function() {
        removeHighlightByRange(h.paraIdx, h.startOffset, h.endOffset);
        hls.splice(i, 1); saveHighlights(hls); showHighlights();
      });
      list.appendChild(item);
    });
  }
  document.getElementById('highlightOverlay').classList.add('show');
}
function closeHighlightPanel() { document.getElementById('highlightOverlay').classList.remove('show'); }

// Selection handling
document.addEventListener('selectionchange', function() {
  clearTimeout(window._selTimer);
  window._selTimer = setTimeout(function() {
    const s = window.getSelection();
    if (s && !s.isCollapsed && s.toString().trim()) {
      const rect = s.getRangeAt(0).getBoundingClientRect();
      const bar = document.getElementById('selectionToolbar');
      if (bar) {
        bar.style.top = Math.max(rect.top - 42, 8) + 'px';
        bar.style.left = Math.min(rect.left + rect.width/2 - 80, window.innerWidth - 180) + 'px';
        bar.classList.remove('hidden');
      }
    } else {
      const bar = document.getElementById('selectionToolbar');
      if (bar) bar.classList.add('hidden');
    }
  }, 400);
});
document.addEventListener('mousedown', function(e) {
  if (!e.target.closest('.selection-toolbar')) {
    const bar = document.getElementById('selectionToolbar');
    if (bar) bar.classList.add('hidden');
  }
});

// Selection toolbar actions
document.getElementById('selHighlight').addEventListener('click', function() {
  const s = window.getSelection();
  if (!s || s.isCollapsed) return;
  const info = getSelectionInfo();
  const hls = getHighlights();
  hls.push(info);
  saveHighlights(hls);
  applyHighlight(info.paraIdx, info.startOffset, info.endOffset, '#FFE082');
  s.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
});
document.getElementById('selTranslate').addEventListener('click', function() {
  const s = window.getSelection();
  if (s) doTranslate(s.toString());
  document.getElementById('selectionToolbar').classList.add('hidden');
});
document.getElementById('selTts').addEventListener('click', function() {
  const s = window.getSelection();
  if (s && s.toString().trim()) speakText(s.toString().trim(), null);
  s?.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
});
document.getElementById('selCopy').addEventListener('click', function() {
  const s = window.getSelection();
  if (s) navigator.clipboard.writeText(s.toString()).catch(function() {});
  s?.removeAllRanges();
  document.getElementById('selectionToolbar').classList.add('hidden');
});

function getSelectionInfo() {
  const s = window.getSelection();
  const text = s.toString().trim();
  const all = document.getElementById('content').querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  const range = s.getRangeAt(0);
  let startParaIdx = -1, startOffset = range.startOffset;
  for (let i = 0; i < all.length; i++) {
    if (all[i].contains(range.startContainer)) {
      startParaIdx = i;
      const walker = document.createTreeWalker(all[i], NodeFilter.SHOW_TEXT);
      let charCount = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === range.startContainer) { startOffset = charCount + range.startOffset; break; }
        else charCount += walker.currentNode.textContent.length;
      }
      break;
    }
  }
  let endOffset = range.endOffset;
  for (let i = 0; i < all.length; i++) {
    if (all[i].contains(range.endContainer)) {
      const walker = document.createTreeWalker(all[i], NodeFilter.SHOW_TEXT);
      let charCount = 0;
      while (walker.nextNode()) {
        if (walker.currentNode === range.endContainer) { endOffset = charCount + range.endOffset; break; }
        else charCount += walker.currentNode.textContent.length;
      }
      break;
    }
  }
  return { text: text, paraIdx: startParaIdx, startOffset: startOffset, endOffset: endOffset };
}

// Paragraph helpers
function scrollToParagraph(index) {
  const blocks = document.querySelectorAll('#content p, #content h1, #content h2, #content h3, #content h4, #content h5, #content h6, #content pre, #content blockquote, #content li');
  if (index >= 0 && index < blocks.length) blocks[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function highlightAndScroll(index) {
  const blocks = document.querySelectorAll('#content p, #content h1, #content h2, #content h3, #content h4, #content h5, #content h6, #content pre, #content blockquote, #content li');
  if (index >= 0 && index < blocks.length) {
    const el = blocks[index];
    el.style.transition = 'background-color 0.3s';
    el.style.backgroundColor = 'rgba(26, 115, 232, 0.15)';
    el.style.borderRadius = '4px';
    el.style.padding = '4px 8px';
    el.style.margin = '2px -4px';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() {
      el.style.backgroundColor = ''; el.style.borderRadius = ''; el.style.padding = ''; el.style.margin = '';
    }, 1500);
  }
}
function getParagraphsText() {
  const content = document.getElementById('content');
  if (!content) return '[]';
  const blocks = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, pre, blockquote, li');
  const texts = [];
  blocks.forEach(function(el) { const t = el.textContent.trim(); if (t) texts.push(t); });
  return JSON.stringify(texts);
}

// ==============================
// TTS
// ==============================
function getCleanText(text) {
  return text.replace(/([\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff])\s+(?=[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff])/g, '$1');
}
function startTts() {
  const paraText = JSON.parse(getParagraphsText());
  if (paraText.length === 0) { log(__('log.tts_empty')); return; }
  state.ttsParagraphs = paraText.map(function(t) { return getCleanText(t); });
  state.ttsCurrentIdx = 0;
  state.isTtsPlaying = true;
  document.getElementById('tbTts').style.display = 'none';
  document.getElementById('tbTtsStop').style.display = '';
  log(__('log.tts_start', {n: paraText.length}));
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
  log(__('log.tts_stop'));
}
function playNext(idx) {
  if (idx >= state.ttsParagraphs.length) { stopTts(); return; }
  const text = state.ttsParagraphs[idx];
  if (!text || text.trim().length === 0) { playNext(idx + 1); return; }
  state.ttsCurrentIdx = idx;
  ttsHighlight(idx);
  speakText(text, function() { playNext(idx + 1); });
}
function speakText(text, onDone) {
  const settings = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
  const endpoint = settings.ttsEndpoint || 'http://powerplus.blogsyte.com:5001';
  fetch(endpoint + '/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, voice: settings.ttsVoice || 'zh-CN-XiaoxiaoNeural', rate: '-10%' })
  }).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.blob();
  }).then(function(blob) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = function() { URL.revokeObjectURL(url); if (onDone) onDone(); };
    audio.onerror = function() { URL.revokeObjectURL(url); if (onDone) onDone(); };
    audio.play().catch(function() { if (onDone) onDone(); });
  }).catch(function() {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    utter.onend = function() { if (onDone) onDone(); };
    utter.onerror = function() { if (onDone) onDone(); };
    window.speechSynthesis.speak(utter);
  });
}
function ttsHighlight(idx) {
  clearTtsHighlight();
  const blocks = document.querySelectorAll('#content p, #content h1, #content h2, #content h3, #content h4, #content h5, #content h6, #content pre, #content blockquote, #content li');
  if (idx >= 0 && idx < blocks.length) {
    const el = blocks[idx];
    el.style.backgroundColor = 'rgba(26, 115, 232, 0.15)';
    el.style.borderRadius = '4px';
    el.style.padding = '4px 8px';
    el.style.margin = '2px -4px';
    el.dataset.ttsHighlight = '1';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function clearTtsHighlight() {
  document.querySelectorAll('[data-tts-highlight]').forEach(function(el) {
    el.style.backgroundColor = ''; el.style.borderRadius = ''; el.style.padding = ''; el.style.margin = '';
    el.removeAttribute('data-tts-highlight');
  });
}

// ==============================
// Translation
// ==============================
function doTranslate(text) {
  const settings = JSON.parse(localStorage.getItem('inknote_settings') || '{}');
  const endpoint = settings.apiEndpoint || 'https://api.deepseek.com/v1/chat/completions';
  const apiKey = settings.apiKey;
  const model = settings.apiModel || 'deepseek-chat';
  if (!apiKey) {
    alert(__('log.translate_api_needed'));
    document.getElementById('settingsOverlay').classList.add('show');
    return;
  }
  log(__('log.translate', {text: text.substring(0, 50)}));
  fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are a translation assistant. Translate the following text to Chinese. Return only the translation, no explanation.' },
        { role: 'user', content: text }
      ],
      max_tokens: 1024,
    })
  }).then(function(resp) { return resp.json(); })
  .then(function(data) {
    const result = data.choices?.[0]?.message?.content || '翻译失败';
    document.getElementById('translateResult').textContent = result;
    document.getElementById('translateOverlay').classList.add('show');
  }).catch(function(err) {
    logError(__('log.translate_fail', {msg: err.message}));
    document.getElementById('translateResult').textContent = __('log.translate_fail', {msg: err.message});
    document.getElementById('translateOverlay').classList.add('show');
  });
}
function closeTranslateResult() { document.getElementById('translateOverlay').classList.remove('show'); }

// ==============================
// Export
// ==============================
function showExportMenu() {
  const choice = confirm(__('export_confirm'));
  if (choice) {
    exportHtml();
  } else {
    navigator.clipboard.writeText(state.currentContent).then(function() {
      log(__('log.export_md'));
    }).catch(function() {});
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
  log(__('log.export_html'));
}

// ==============================
// PDF Export
// ==============================
function exportPdf() {
  if (!state.currentContent) {
    log(__('log.export_pdf_empty'));
    return;
  }
  log(__('log.export_pdf_start'));
  document.body.classList.add('printing');
  window.print();
  setTimeout(function() {
    document.body.classList.remove('printing');
    log(__('log.export_pdf_done'));
  }, 1000);
}

// ==============================
// Event Bindings (DOMContentLoaded)
// ==============================
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  renderRecentFiles();

  // File operations
  document.getElementById('btnOpenFile').addEventListener('click', function() { document.getElementById('fileInput').click(); });
  document.getElementById('btnOpenUrl').addEventListener('click', showUrlDialog);
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('welcomeOpenFile').addEventListener('click', function() { document.getElementById('fileInput').click(); });
  document.getElementById('welcomeOpenUrl').addEventListener('click', showUrlDialog);
  document.getElementById('welcomePasteText').addEventListener('click', showPasteDialog);
  document.getElementById('fileInput').addEventListener('change', function(e) {
    if (e.target.files[0]) openLocalFile(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btnUrlConfirm').addEventListener('click', function() {
    const url = document.getElementById('urlInput').value.trim();
    if (url) { openUrl(url); closeUrlDialog(); }
  });
  document.getElementById('urlInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('btnUrlConfirm').click();
  });

  // Paste dialog
  document.getElementById('btnPasteConfirm').addEventListener('click', confirmPaste);
  document.getElementById('pasteTextarea').addEventListener('keydown', function(e) {
    // Ctrl+Enter or Cmd+Enter to confirm
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      confirmPaste();
    }
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
  document.getElementById('tbSearch').addEventListener('click', function() { state.isSearchVisible ? hideSearch() : showSearch(); });
  document.getElementById('searchInput').addEventListener('input', function(e) { doSearch(e.target.value); });
  document.getElementById('searchInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') e.shiftKey ? prevSearch() : nextSearch(); });
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

  // Mode switching
  document.getElementById('tbModeRead').addEventListener('click', function() { setMode('read'); });
  document.getElementById('tbModeWysiwyg').addEventListener('click', function() { setMode('wysiwyg'); });
  document.getElementById('tbModeSource').addEventListener('click', function() { setMode('source'); });

  // Fullscreen
  document.getElementById('tbFullscreen').addEventListener('click', toggleFullscreen);

  // Export
  document.getElementById('tbExport').addEventListener('click', showExportMenu);
  document.getElementById('tbExportPdf').addEventListener('click', exportPdf);

  // Translate
  document.getElementById('tbTranslate').addEventListener('click', function() {
    const s = window.getSelection();
    if (s && s.toString().trim()) doTranslate(s.toString());
    else log(__('log.translate_no_sel'));
  });

  // Shortcuts help
  document.getElementById('tbShortcuts').addEventListener('click', function() {
    document.getElementById('shortcutsOverlay').classList.add('show');
  });

  document.getElementById('tbStats').addEventListener('click', showStats);
  document.getElementById('tbExportLog').addEventListener('click', exportLogs);
  document.getElementById('btnSettingsSave').addEventListener('click', function() { saveSettings(); closeSettings(); });

  // Debug
  document.getElementById('debugToggle').addEventListener('click', function() {
    const body = document.getElementById('debugBody');
    const show = body.style.display === 'none';
    body.style.display = show ? 'block' : 'none';
    if (show) {
      body.innerHTML = '';
      _debugLogs.forEach(function(e) {
        const entry = document.createElement('div');
        entry.className = 'debug-entry';
        entry.innerHTML = '<span class="t">' + e.t + '</span> <span class="l-' + e.level.toLowerCase() + '">[' + e.level + ']</span> ' + escapeHtml(e.msg);
        body.appendChild(entry);
      });
      body.scrollTop = body.scrollHeight;
    }
  });
  document.getElementById('debugCopy').addEventListener('click', function() {
    const text = _debugLogs.map(function(e) { return e.t + ' [' + e.level + '] ' + e.msg; }).join('\n');
    navigator.clipboard.writeText(text).then(function() { log(__('log.copy_done')); }).catch(function() {});
  });
  document.getElementById('debugClear').addEventListener('click', function() {
    _debugLogs.length = 0;
    document.getElementById('debugBody').innerHTML = '';
    log(__('log.clear_done'));
  });

  // WYSIWYG formatting toolbar
  document.querySelectorAll('.btn-wysiwyg').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const cmd = this.dataset.cmd;
      if (cmd) wysiwygCommand(cmd);
    });
  });

  // WYSIWYG table/image/hr commands
  document.querySelectorAll('.btn-wysiwyg[data-cmd="table"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const rows = parseInt(prompt(__('table_rows_prompt'), '3')) || 3;
      const cols = parseInt(prompt(__('table_cols_prompt'), '4')) || 4;
      if (rows > 0 && cols > 0) wysiwygInsertTable(rows, cols);
    });
  });
  document.querySelectorAll('.btn-wysiwyg[data-cmd="image"]').forEach(function(btn) {
    btn.addEventListener('click', wysiwygInsertImage);
  });
  document.querySelectorAll('.btn-wysiwyg[data-cmd="hr"]').forEach(function(btn) {
    btn.addEventListener('click', wysiwygInsertHr);
  });

  // Auto-save when entering edit modes
  const origSetMode = setMode;
  setMode = function(mode) {
    if (mode === 'wysiwyg' || mode === 'source') startAutoSave();
    else stopAutoSave();
    origSetMode(mode);
  };

  // WYSIWYG undo/redo keyboard shortcuts
  document.getElementById('wysiwygContent').addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); wysiwygCommand('bold'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); wysiwygCommand('italic'); }
    if (e.ctrlKey && e.key === 'u') { e.preventDefault(); wysiwygCommand('underline'); }
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); e.shiftKey ? wysiwygRedo() : wysiwygUndo(); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); leaveWysiwyg(true); }
  });
  // Auto-save WYSIWYG state on input (debounced)
  document.getElementById('wysiwygContent').addEventListener('input', function() {
    clearTimeout(wysiwygUndoTimer);
    wysiwygUndoTimer = setTimeout(saveWysiwygState, 500);
  });

  // Dialog actions
  document.addEventListener('click', function(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'closeUrlDialog') closeUrlDialog();
    else if (action === 'closeSettings') closeSettings();
    else if (action === 'closeBookmarkPanel') closeBookmarkPanel();
    else if (action === 'closeHighlightPanel') closeHighlightPanel();
    else if (action === 'closeTranslateResult') closeTranslateResult();
    else if (action === 'closeShortcuts') document.getElementById('shortcutsOverlay').classList.remove('show');
    else if (action === 'closeStats') closeStats();
    else if (action === 'closePasteDialog') closePasteDialog();
  });

  // Click overlay background to close
  document.querySelectorAll('.overlay').forEach(function(o) {
    o.addEventListener('click', function(e) {
      if (e.target === o) o.classList.remove('show');
    });
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Skip if in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        if (state.isSearchVisible) hideSearch();
        if (state.editMode === 'source') { setMode('read'); }
      }
      return;
    }

    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); showSearch(); }
    if (e.ctrlKey && e.key === 'e') { e.preventDefault(); setMode(state.editMode === 'read' ? 'wysiwyg' : 'read'); }
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); if (state.editMode === 'wysiwyg') leaveWysiwyg(true); }
    if (e.key === 'Escape') {
      if (state.isSearchVisible) hideSearch();
      if (state.isTocVisible) toggleToc();
      document.querySelectorAll('.overlay.show').forEach(function(o) { o.classList.remove('show'); });
    }
    if (e.key === '?') {
      document.getElementById('shortcutsOverlay').classList.toggle('show');
    }
    if (e.key === 'j' || e.key === 'ArrowDown') scrollPage('down');
    if (e.key === 'k' || e.key === 'ArrowUp') scrollPage('up');
  });

  // Handle URL params
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('url');
  const textParam = params.get('text');
  if (urlParam) openUrl(urlParam);
  else if (textParam) {
    state.currentContent = textParam;
    state.currentFileName = __('app.untitled') + '.md';
    loadContent();
  }

  log(__('log.startup'));
  log(__('log.shortcut_hint'));

  // Language switcher
  window._onLangChange = function() {
    if (state.currentContent) {
      updateFileInfo(state.currentContent, state.currentFileName);
    }
    renderRecentFiles();
    if (state.searchMatches.length > 0) {
      document.getElementById('searchInfo').textContent = __('label.search_info_count', {n: state.searchMatches.length});
    }
    document.querySelectorAll('#settingTtsVoice option').forEach(function(opt) {
      if (opt.dataset.i18n) opt.textContent = __(opt.dataset.i18n);
    });
    // Update lang button highlights
    document.querySelectorAll('.btn-lang').forEach(function(b) {
      b.style.borderColor = '#ddd'; b.style.color = ''; b.style.fontWeight = '';
    });
    document.querySelectorAll('.btn-lang[data-lang="' + getLang() + '"]').forEach(function(b) {
      b.style.borderColor = '#1a73e8'; b.style.color = '#1a73e8'; b.style.fontWeight = 'bold';
    });
  };
  document.querySelectorAll('.btn-lang').forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.setLang(this.dataset.lang);
    });
  });
  // Init lang button highlight
  document.querySelectorAll('.btn-lang[data-lang="' + getLang() + '"]').forEach(function(btn) {
    btn.style.borderColor = '#1a73e8';
    btn.style.color = '#1a73e8';
    btn.style.fontWeight = 'bold';
  });
  // Handle lang URL param
  var langParam = params.get('lang');
  if (langParam && (langParam === 'zh' || langParam === 'en')) {
    window.setLang(langParam);
  }
});

// ==============================
// Dialog Helpers
// ==============================
function showUrlDialog() {
  document.getElementById('urlOverlay').classList.add('show');
  document.getElementById('urlInput').value = '';
  document.getElementById('urlInput').focus();
}
function closeUrlDialog() { document.getElementById('urlOverlay').classList.remove('show'); }
function openSettings() { document.getElementById('settingsOverlay').classList.add('show'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('show'); }

// ==============================
// Paste Dialog
// ==============================
function showPasteDialog() {
  document.getElementById('pasteOverlay').classList.add('show');
  document.getElementById('pasteTextarea').value = '';
  document.getElementById('pasteAsFormula').checked = false;
  document.getElementById('pasteTextarea').focus();
}
function closePasteDialog() {
  document.getElementById('pasteOverlay').classList.remove('show');
}
function confirmPaste() {
  const textarea = document.getElementById('pasteTextarea');
  let text = textarea.value.trim();
  if (!text) { logWarn(__('log.paste_empty')); return; }

  const asFormula = document.getElementById('pasteAsFormula').checked;
  if (asFormula) {
    // Wrap in $$...$$ for display math — but if it already has them, don't double-wrap
    const trimmed = text.trim();
    if (!trimmed.startsWith('$$') || !trimmed.endsWith('$$')) {
      text = '$$\n' + trimmed + '\n$$';
    }
  }

  closePasteDialog();
  state.currentContent = text;
  state.currentFileName = __('btn.paste_text');
  state.currentFilePath = '';
  state.isHtmlFile = false;
  loadContent();
  log(__('log.pasted_text', {chars: text.length}));
}

// ==============================
// Drag & Drop
// ==============================
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop', function(e) {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.name.match(/\.(md|markdown|txt|html?)$/i)) {
      openLocalFile(file);
    } else {
      logWarn(__('log.unsupported_format', {name: file.name}));
    }
  } else {
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (url && url.match(/\.(md|markdown|txt)$/i)) openUrl(url);
  }
});

// ==============================
// Statistics Dialog
// ==============================
function showStats() {
  const stats = countStats(state.currentContent || '');
  const md = state.currentContent || '';
  const cnChars = (md.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const enWords = (md.match(/[a-zA-Z]+/g) || []).length;
  const numbers = (md.match(/\d+/g) || []).length;
  const spaces = (md.match(/\s/g) || []).length;
  const puncts = (md.match(/[，。！？、；：""''（）【】《》—…·,.!?;:\"'()\[\]{}<>\/\\\-=+@#$%^&*|~`]/g) || []).length;
  const codeBlocks = (md.match(/```[\s\S]*?```/g) || []).length;
  const formulas = (md.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) || []).length;
  const images = (md.match(/!\[.*?\]\(.*?\)/g) || []).length;
  const links = (md.match(/\[.*?\]\(.*?\)/g) || []).length;
  const tables = (md.match(/^\|.+\|$/gm) || []).length > 0 ? (md.match(/^\|[^|]+\|[^|]+\|$/gm) || []).length : 0;
  const headings = (md.match(/^#{1,6}\s+.+$/gm) || []).length;

  const total = stats.chars + enWords;
  const msg = [
    __('stats.header'),
    '─────────────',
    __('stats.total_chars', {n: stats.chars}),
    __('stats.cn_chars', {n: cnChars}),
    __('stats.en_words', {n: enWords}),
    __('stats.numbers', {n: numbers}),
    __('stats.punct', {n: puncts}),
    '─────────────',
    __('stats.paras', {n: stats.paras}),
    __('stats.lines', {n: stats.lines}),
    __('stats.code_blocks', {n: codeBlocks}),
    __('stats.formulas', {n: formulas}),
    __('stats.images', {n: images}),
    __('stats.links', {n: links}),
    __('stats.headings', {n: headings}),
    __('stats.table_rows', {n: tables}),
    '─────────────',
    __('stats.read_time', {n: Math.max(1, Math.round(total / 500))}),
  ].join('\n');
  document.getElementById('statsResult').textContent = msg;
  document.getElementById('statsOverlay').classList.add('show');
}

function closeStats() { document.getElementById('statsOverlay').classList.remove('show'); }

// ==============================
// WYSIWYG Table & Image Insert
// ==============================
let tableSize = { rows: 3, cols: 3 };

function wysiwygInsertTable(rows, cols) {
  // Use execCommand to insert at cursor position
  var html = '<table style="width:100%;border-collapse:collapse;margin:8px 0;">';
  html += '<thead><tr>';
  for (var c = 0; c < cols; c++) html += '<th style="padding:8px 10px;border:1px solid #ddd;text-align:left;min-height:32px;">&nbsp;</th>';
  html += '</tr></thead><tbody>';
  for (var r = 1; r < rows; r++) {
    html += '<tr>';
    for (var c = 0; c < cols; c++) html += '<td style="padding:8px 10px;border:1px solid #ddd;min-height:32px;">&nbsp;</td>';
    html += '</tr>';
  }
  html += '</tbody></table><br>';
  document.execCommand('insertHTML', false, html);
  document.getElementById('wysiwygContent').focus();
}

let savedRange = null;
let wysiwygUndoStack = [];
let wysiwygRedoStack = [];
const MAX_UNDO = 50;
let wysiwygUndoTimer = null;

function saveWysiwygState() {
  var el = document.getElementById('wysiwygContent');
  if (!el) return;
  var html = el.innerHTML;
  if (wysiwygUndoStack.length === 0 || wysiwygUndoStack[wysiwygUndoStack.length - 1] !== html) {
    wysiwygUndoStack.push(html);
    if (wysiwygUndoStack.length > MAX_UNDO) wysiwygUndoStack.shift();
    wysiwygRedoStack = [];
  }
}

function wysiwygUndo() {
  if (wysiwygUndoStack.length < 2) return;
  var el = document.getElementById('wysiwygContent');
  if (!el) return;
  // Save current state to redo stack
  wysiwygRedoStack.push(el.innerHTML);
  // Pop current state
  wysiwygUndoStack.pop();
  // Restore previous state
  el.innerHTML = wysiwygUndoStack[wysiwygUndoStack.length - 1];
  el.focus();
  log(__('log.undo'));
}

function wysiwygRedo() {
  if (wysiwygRedoStack.length === 0) return;
  var el = document.getElementById('wysiwygContent');
  if (!el) return;
  var state = wysiwygRedoStack.pop();
  wysiwygUndoStack.push(state);
  el.innerHTML = state;
  el.focus();
  log(__('log.redo'));
}
function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
}
function restoreSelection() {
  if (savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    savedRange = null;
  }
}

function wysiwygInsertImage() {
  const url = prompt(__('image_url_prompt'), 'https://');
  if (!url) return;
  saveSelection();
  const img = document.createElement('img');
  img.src = url;
  img.style.maxWidth = '100%';
  img.style.borderRadius = '6px';
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    // Move cursor after image
    const span = document.createElement('span');
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function wysiwygInsertHr() {
  saveSelection();
  const hr = document.createElement('hr');
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(hr);
    // Move cursor after hr
    const span = document.createElement('span');
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ==============================
// Auto-save in edit mode
// ==============================
let autoSaveTimer = null;
function startAutoSave() {
  stopAutoSave();
  autoSaveTimer = setInterval(function() {
    if (state.editMode === 'wysiwyg') {
      const html = document.getElementById('wysiwygContent').innerHTML;
      const md = htmlToMarkdown(html);
      if (md !== state.currentContent) {
        state.currentContent = md;
        log(__('log.auto_save'));
      }
    } else if (state.editMode === 'source') {
      const ta = document.getElementById('sourceTextarea');
      if (ta && ta.value !== state.currentContent) {
        state.currentContent = ta.value;
        log(__('log.auto_save'));
      }
    }
  }, 30000);
}
function stopAutoSave() {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
}
// ==============================
// Export Logs
// ==============================
function exportLogs() {
  var text = __('export_log.header') + '\n';
  text += __('export_log.time', {time: new Date().toLocaleString('zh-CN')}) + '\n';
  text += __('export_log.version') + '\n';
  text += __('export_log.file', {name: state.currentFileName || __('no_file')}) + '\n';
  text += __('export_log.mode', {mode: state.editMode}) + '\n';
  text += __('export_log.theme', {theme: state.theme}) + '\n';
  text += __('export_log.lines', {n: state.currentContent.split('\n').length}) + '\n';
  text += __('export_log.status', {status: state.isTtsPlaying ? __('export_log.status_tts') : __('export_log.status_normal')}) + '\n';
  text += '================================\n\n';
  _debugLogs.forEach(function(e) {
    text += e.t + ' [' + e.level + '] ' + e.msg + '\n';
  });
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inknote-log-' + new Date().toISOString().slice(0, 19).replace(/[:-]/g, '') + '.txt';
  a.click();
  URL.revokeObjectURL(blob);
  log(__('log.export_log', {n: _debugLogs.length}));
}

function scrollPage(direction) {
  const panel = document.getElementById('readPanel');
  if (!panel) return;
  const amount = panel.clientHeight * 0.85;
  panel.scrollBy({ top: direction === 'down' ? amount : -amount, behavior: 'smooth' });
}
