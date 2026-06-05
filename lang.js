/* ===== InkNote i18n Engine ===== */
(function() {
  'use strict';

  const SUPPORTED_LANGS = ['zh', 'en'];
  const FALLBACK_LANG = 'zh';

  let _currentLang = localStorage.getItem('inknote_lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
  if (!SUPPORTED_LANGS.includes(_currentLang)) _currentLang = 'en';
  let _localeData = {};

  // Load locale JSON (sync XHR)
  function _load(lang) {
    try {
      const req = new XMLHttpRequest();
      req.open('GET', 'locales/' + lang + '.json', false);
      req.send(null);
      if (req.status === 200) {
        _localeData = JSON.parse(req.responseText);
        _currentLang = lang;
        localStorage.setItem('inknote_lang', lang);
        return true;
      }
    } catch(e) {
      console.warn('[i18n] Failed to load locale:', lang);
    }
    if (lang !== FALLBACK_LANG) return _load(FALLBACK_LANG);
    return false;
  }

  // Public API: get a translated string
  window.__ = function(key, vals) {
    if (!key) return '';
    let str = _localeData[key];
    if (str === undefined) str = key;
    if (vals) {
      for (const k in vals) {
        str = str.split('{' + k + '}').join(vals[k]);
      }
    }
    return str;
  };
  window._t = window.__;

  // Public API: get current language
  window.getLang = function() { return _currentLang; };

  // Public API: switch language
  window.setLang = function(lang) {
    if (!SUPPORTED_LANGS.includes(lang) || lang === _currentLang) return false;
    if (!_load(lang)) return false;

    // Update HTML lang attribute
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

    // Re-translate all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      const key = el.dataset.i18n;
      const val = window.__(key);
      if (val && val !== key) {
        const tag = el.tagName.toLowerCase();
        if ((tag === 'input' || tag === 'textarea') && (el.type === 'text' || el.type === 'url' || el.type === 'search' || el.type === 'password' || !el.type)) {
          el.placeholder = val;
        } else {
          el.textContent = val;
        }
      }
    });

    // Re-translate titles
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      el.title = window.__(el.dataset.i18nTitle);
    });

    // Update page title
    const titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = window.__('app.title');

    // Re-translate select options
    document.querySelectorAll('option[data-i18n]').forEach(function(opt) {
      opt.textContent = window.__(opt.dataset.i18n);
    });

    // Notify app to refresh dynamic content
    if (window._onLangChange) window._onLangChange();

    return true;
  };

  // Initialize
  _load(_currentLang);
  document.documentElement.lang = _currentLang === 'zh' ? 'zh-CN' : 'en';
})();
