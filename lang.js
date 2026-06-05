/* ===== InkNote i18n Engine ===== */
(function() {
  'use strict';

  const SUPPORTED_LANGS = ['zh', 'en'];
  const FALLBACK_LANG = 'zh';

  let currentLang = localStorage.getItem('inknote_lang') || navigator.language.startsWith('zh') ? 'zh' : 'en';
  if (!SUPPORTED_LANGS.includes(currentLang)) currentLang = 'en';
  let localeData = {};

  // Load locale JSON (sync XHR — simple, works in extension)
  function loadLocale(lang) {
    try {
      const req = new XMLHttpRequest();
      req.open('GET', 'locales/' + lang + '.json', false);
      req.send(null);
      if (req.status === 200) {
        localeData = JSON.parse(req.responseText);
        currentLang = lang;
        localStorage.setItem('inknote_lang', lang);
        document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
        return true;
      }
    } catch(e) {
      console.warn('[i18n] Failed to load locale:', lang, e.message);
    }
    // Fallback
    if (lang !== FALLBACK_LANG) return loadLocale(FALLBACK_LANG);
    return false;
  }

  // Translate a key with optional interpolation values
  // __('label.file_info', {cn:5, en:10, p:3, l:20})
  // __('hello {name}', {name:'World'})
  window.__ = function(key, vals) {
    if (!key) return '';
    // Look up in locale data, or use key itself as fallback
    let str = localeData[key];
    if (str === undefined) str = key;
    // Interpolate {placeholder} values
    if (vals) {
      for (const k in vals) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vals[k]);
      }
    }
    return str;
  };

  // Short alias (same as __)
  window._t = window.__;

  // Get current language
  window.getLang = function() { return currentLang; };

  // Switch language and re-translate the page
  window.setLang = function(lang) {
    if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
    if (loadLocale(lang)) {
      // Re-translate all data-i18n elements
      document.querySelectorAll('[data-i18n]').forEach(function(el) {
        const key = el.dataset.i18n;
        const translation = __(key);
        if (translation && translation !== key) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'input' || tag === 'textarea') {
            if (el.type === 'text' || el.type === 'url' || el.type === 'search' || el.type === 'password') {
              el.placeholder = translation;
            }
          } else {
            el.textContent = translation;
          }
        }
      });
      // Re-translate titles
      document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        el.title = __(el.dataset.i18nTitle);
      });
      // Update page title
      const titleEl = document.querySelector('title');
      if (titleEl) titleEl.textContent = __('app.title');
      // Update status bar text
      if (window._onLangChange) window._onLangChange();
      // Re-render dynamic elements
      if (window.updateFileInfo && window.state && window.state.currentContent) {
        window.updateFileInfo(window.state.currentContent, window.state.currentFileName);
      }
      if (window.renderRecentFiles) window.renderRecentFiles();
    }
  };

  // Initialize
  loadLocale(currentLang);

})();
