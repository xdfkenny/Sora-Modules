/* xdfkenny modules — unified SPA (landing + library)
 *
 * Adapted from the anime-module-library reference:
 *  - hash router (#/ + #/library), single-file app
 *  - manual dark/light theme toggle (localStorage + prefers-color-scheme)
 *  - EN/ES i18n for UI chrome (localStorage + navigator.language)
 *  - animated stat counters, debounced search, drag-to-scroll chips,
 *    multi-select app filters, skeleton + empty states, toast feedback
 *  - manifest hydration with concurrency cap + localStorage cache (TTL)
 *
 * Data model (ours): modules.json -> [{id,name,iconUrl,category,
 *   manifestUrl,sampleQuery,discontinued}] then one manifest fetch each for
 *   {sourceName,version,language,quality,streamType,description,type,
 *   supportsSora,supportsLuna,supportsShirox,supportsEclipse,...}.
 */

'use strict';

var RAW_REPO = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules';
var MANIFEST_TTL = 10 * 60 * 1000;
var CONCURRENCY = 8;

/* ---------------- tiny helpers ---------------- */

function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function cssEsc(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

function debounce(fn, ms) {
  var timer = 0;
  return function () {
    var args = arguments, self = this;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

function allSettled(promises) {
  if (Promise.allSettled) return Promise.allSettled(promises);
  return Promise.all(promises.map(function (p) {
    return Promise.resolve(p).then(
      function (v) { return { status: 'fulfilled', value: v }; },
      function (e) { return { status: 'rejected', reason: e }; }
    );
  }));
}

/* ---------------- theme (manual override + system) ---------------- */

var themeToggle = $('themeToggle'), themeIcon = $('themeIcon');
var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function effectiveTheme() {
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
  if (saved === 'dark' || saved === 'light') return saved;
  return (mqDark && mqDark.matches) ? 'dark' : 'light';
}

function applyTheme(th) {
  document.documentElement.dataset.theme = th;
  if (themeIcon) themeIcon.textContent = th === 'dark' ? 'light_mode' : 'dark_mode';
  if (themeToggle) themeToggle.setAttribute('aria-label', th === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}

function initTheme() {
  applyTheme(effectiveTheme());
  if (themeToggle) themeToggle.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
    applyTheme(next);
  });
  if (mqDark && mqDark.addEventListener) {
    mqDark.addEventListener('change', function (e) {
      var saved = null;
      try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light');
    });
  }
}

/* ---------------- i18n (EN default, ES secondary) ---------------- */

var I18N = {
  en: {
    'nav.home': 'Home', 'nav.library': 'Library',
    'hero.eyebrow': 'Soft Cryo Modules',
    'hero.sub': 'Streaming modules for anime, movies, manga and novels.',
    'hero.desc': 'A collection of JavaScript modules for Sora, Luna and Shirox — clean, reusable and focused on reliability.',
    'hero.addAll': 'Add All to Sora', 'hero.browse': 'Browse Library',
    'stat.modules': 'Modules', 'stat.authors': 'Authors',
    'cat.all': 'All', 'cat.anime': 'Anime', 'cat.movie': 'Movies',
    'cat.manga': 'Manga', 'cat.novel': 'Novels', 'cat.torrent': 'Torrents',
    'lib.title': 'Module Library',
    'lib.sub': 'Explore and install modular anime, manga, and stream resolution providers for Sora, Luna, and Shirox.',
    'lib.sub-note': 'You can also browse the original library at <a class="og-lib-btn" href="https://library.cufiy.net/library" target="_blank" rel="noopener noreferrer"><iconify-icon icon="mdi:open-in-new" aria-hidden="true"></iconify-icon> cufiy.net/library</a>',
    'search.ph': 'Search modules by name, language, or tags...',
    'card.add': 'Add to Sora', 'card.copy': 'Copy JSON link', 'card.by': 'by',
    'footer.tag': 'Built with frost and curiosity.',
    'toast.copied': 'Manifest URL copied', 'toast.copyFail': 'Copy failed',
    'results': '{n} modules', 'results.one': '1 module',
    'lib.donate': 'Support this library and the ongoing development & maintenance of modules. Your donations help keep everything alive.',
    'filter.clear': 'Clear',
    'empty.t': 'No modules found', 'empty.d': 'Try a different search or filter.',
    'state.loading': 'Loading module index…', 'state.fail': 'Could not load modules.json. Serve over HTTP or check GitHub Pages.'
  },
  es: {
    'nav.home': 'Inicio', 'nav.library': 'Librería',
    'hero.eyebrow': 'Módulos Soft Cryo',
    'hero.sub': 'Módulos de streaming para anime, películas, manga y novelas.',
    'hero.desc': 'Una colección de módulos JavaScript para Sora, Luna y Shirox — limpios, reutilizables y enfocados en fiabilidad.',
    'hero.addAll': 'Agregar todo a Sora', 'hero.browse': 'Explorar librería',
    'stat.modules': 'Módulos', 'stat.authors': 'Autores',
    'cat.all': 'Todo', 'cat.anime': 'Anime', 'cat.movie': 'Películas',
    'cat.manga': 'Manga', 'cat.novel': 'Novelas', 'cat.torrent': 'Torrents',
    'lib.title': 'Librería de módulos',
    'lib.sub': 'Explora e instala proveedores de anime, manga y streams para Sora, Luna y Shirox.',
    'lib.sub-note': 'También puedes explorar la librería original en <a class="og-lib-btn" href="https://library.cufiy.net/library" target="_blank" rel="noopener noreferrer"><iconify-icon icon="mdi:open-in-new" aria-hidden="true"></iconify-icon> cufiy.net/library</a>',
    'search.ph': 'Buscar por nombre, idioma o etiquetas...',
    'card.add': 'Agregar a Sora', 'card.copy': 'Copiar enlace JSON', 'card.by': 'por',
    'footer.tag': 'Hecho con escarcha y curiosidad.',
    'toast.copied': 'URL copiada', 'toast.copyFail': 'No se pudo copiar',
    'results': '{n} módulos', 'results.one': '1 módulo',
    'lib.donate': 'Apoya esta librería y el desarrollo y mantenimiento continuo de módulos. Tus donaciones ayudan a mantener todo funcionando.',
    'filter.clear': 'Limpiar',
    'empty.t': 'Sin resultados', 'empty.d': 'Prueba con otra búsqueda o filtro.',
    'state.loading': 'Cargando índice…', 'state.fail': 'No se pudo cargar modules.json. Sirve por HTTP o revisa GitHub Pages.'
  }
};
var LANG_LABELS = { en: 'EN', es: 'ES' };
var lang = 'en';
try {
  lang = localStorage.getItem('lang') ||
    (((navigator.language || 'en').slice(0, 2) in I18N) ? (navigator.language || 'en').slice(0, 2) : 'en');
} catch (e) { /* ignore */ }
if (!(lang in I18N)) lang = 'en';

function t(k, vars) {
  var s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  return String(s).replace(/\{(\w+)\}/g, function (_, v) {
    return (vars && vars[v] != null) ? vars[v] : '';
  });
}

function renderLangSwitch() {
  var w = $('langSwitch');
  if (!w) return;
  w.textContent = '';
  Object.keys(I18N).forEach(function (l) {
    var b = el('button', 'lang-btn' + (l === lang ? ' active' : ''), LANG_LABELS[l] || l.toUpperCase());
    b.type = 'button';
    b.dataset.lang = l;
    b.setAttribute('aria-pressed', l === lang ? 'true' : 'false');
    b.addEventListener('click', function () {
      lang = l;
      try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
      applyI18n();
      renderGrid();
    });
    w.appendChild(b);
  });
}

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(function (n) {
    n.textContent = t(n.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (n) {
    n.innerHTML = t(n.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
    n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph')));
  });
  renderLangSwitch();
  updateResultCount();
}

/* ---------------- nav ---------------- */

function initNav() {
  var toggle = $('navToggle'), links = $('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (ev) {
      if (ev.target.closest('.nav-link')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/* ---------------- hero snow ---------------- */

function makeSnow() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var host = document.querySelector('.hero-snow');
  if (!host) return;
  for (var i = 0; i < 26; i++) {
    var f = el('span', 'snowflake');
    var size = 3 + Math.random() * 4;
    f.style.width = size + 'px';
    f.style.height = size + 'px';
    f.style.left = (Math.random() * 100) + '%';
    f.style.animationDuration = (9 + Math.random() * 12) + 's';
    f.style.animationDelay = (-Math.random() * 18) + 's';
    host.appendChild(f);
  }
}

/* ---------------- router (#/ + #/library) ---------------- */

var viewLanding = $('viewLanding'), viewLibrary = $('viewLibrary');

function isLibraryRoute() {
  return (location.hash || '').indexOf('#/library') === 0;
}

function syncNav() {
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    var on = (a.getAttribute('data-nav') === 'library') === isLibraryRoute();
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function route() {
  var lib = isLibraryRoute();
  if (viewLanding) viewLanding.hidden = lib;
  if (viewLibrary) viewLibrary.hidden = !lib;
  syncNav();
  window.scrollTo(0, 0);
  if (lib) bootLibrary();
}
window.addEventListener('hashchange', route);

/* ---------------- data: index + manifest cache ---------------- */

var entries = [];          // modules.json rows
var manifests = {};        // id -> manifest
var cards = {};            // id -> {card, meta, links, ver, desc}
var booted = false, loading = false;
var grid = $('grid');

function cacheKey(id) { return 'xdf.manifest.' + id; }

function cacheRead(id) {
  try {
    var raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    var o = JSON.parse(raw);
    if (!o || !o.t || (Date.now() - o.t) > MANIFEST_TTL) return null;
    return o.m;
  } catch (e) { return null; }
}

function cacheWrite(id, m) {
  try { localStorage.setItem(cacheKey(id), JSON.stringify({ t: Date.now(), m: m })); }
  catch (e) { /* quota — ignore */ }
}

function fetchJson(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function loadIndex() {
  return fetchJson('modules.json').catch(function () {
    return fetchJson(RAW_REPO + '/main/modules.json');
  }).then(function (data) {
    if (!data || !Array.isArray(data.modules)) throw new Error('bad index');
    return data.modules;
  });
}

function loadManifest(entry) {
  var hit = cacheRead(entry.id);
  if (hit) return Promise.resolve(hit);
  return fetchJson(entry.manifestUrl).then(function (m) {
    cacheWrite(entry.id, m);
    return m;
  });
}

/* Run fn over items with at most N in flight. */
function mapLimit(items, n, fn) {
  var i = 0, inflight = 0;
  return new Promise(function (resolve) {
    var results = new Array(items.length);
    if (!items.length) return resolve(results);
    function next() {
      while (inflight < n && i < items.length) {
        (function (idx) {
          inflight++;
          Promise.resolve(fn(items[idx], idx)).then(function (v) { results[idx] = v; })
            .catch(function (e) { results[idx] = e; })
            .then(function () {
              inflight--;
              if (++done === items.length) resolve(results);
              else next();
            });
        })(i++);
      }
    }
    var done = 0;
    next();
  });
}

/* ---------------- stats ---------------- */

function countUp(node, target) {
  if (!node) return;
  if (!('requestAnimationFrame' in window)) { node.textContent = target; return; }
  var dur = 900, start = performance.now();
  (function tick(now) {
    var p = Math.min(1, (now - start) / dur);
    node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

function updateStats() {
  var anime = entries.filter(function (e) {
    return String(e.category || manifests[e.id]?.type || '').toLowerCase().includes('anime');
  }).length;
  var manga = entries.filter(function (e) {
    var c = String(e.category || manifests[e.id]?.type || '').toLowerCase();
    return c.includes('manga') || c === 'mangas';
  }).length;
  var authors = new Set(entries.map(function (e) {
    return (manifests[e.id] && manifests[e.id].author && manifests[e.id].author.name) || e.name;
  })).size;
  countUp($('statTotal'), entries.length);
  countUp($('statAnime'), anime);
  countUp($('statManga'), manga);
  countUp($('statAuthors'), authors);
}

/* ---------------- filters ---------------- */

var state = { q: '', cat: 'all', apps: {} };

function rawCategory(entry) {
  var m = manifests[entry.id] || {};
  return String(entry.category || m.category || m.type || '').toLowerCase();
}

function matchCat(entry) {
  if (state.cat === 'all') return true;
  var c = rawCategory(entry);
  if (state.cat === 'anime') return c.includes('anime');
  if (state.cat === 'movie') return c.includes('movie') || c.includes('show') || c.includes('film');
  if (state.cat === 'manga') return c === 'mangas' || c.includes('manga');
  if (state.cat === 'novel') return c === 'novels' || c.includes('novel');
  if (state.cat === 'torrent') return c.includes('torrent') || c.includes('debrid');
  return true;
}

function matchApp(entry) {
  var active = Object.keys(state.apps).filter(function (k) { return state.apps[k]; });
  if (!active.length) return true;
  var m = manifests[entry.id];
  if (!m) return true; // not hydrated yet — don't hide
  for (var i = 0; i < active.length; i++) {
    var a = active[i];
    if (a === 'sora' && m.supportsSora === false) return false;
    if (a === 'luna' && m.supportsLuna === false) return false;
    if (a === 'shirox' && m.supportsShirox !== true) return false;
  }
  return true;
}

function matchSearch(entry) {
  if (!state.q) return true;
  var m = manifests[entry.id] || {};
  var authorName = (m.author && m.author.name) || entry.name;
  var hay = [entry.name, entry.id, m.sourceName, m.description, m.language, m.type, m.quality, m.streamType, authorName]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.indexOf(state.q) !== -1;
}

function filtered() {
  return entries.filter(function (e) { return matchCat(e) && matchApp(e) && matchSearch(e); });
}

function updateResultCount() {
  var n = $('resultCount');
  if (!n) return;
  var list = entries.length ? filtered() : [];
  n.textContent = list.length === 1 ? t('results.one') : t('results', { n: list.length });
}

/* ---------------- cards ---------------- */

/* Language detection -> Passport Index flags (SVG <img>, renders everywhere
 * including Windows where emoji flags show as letter pairs).
 * Manifest values look like "Spanish (DUB/SUB)", "English (SUB/DUB)",
 * "Russian (HARDSUB)", "Multi (SUB/DUB)" or
 * "Asian (SUB) - Korean, Chinese, Japanese, Thai". */
var PASSPORT_FLAGS = 'https://img.passportindex.org/flags/4x3/';
var LANG_TABLE = [
  { names: ['english'], label: 'English', code: 'gb' },
  { names: ['spanish', 'español'], label: 'Spanish', code: 'es' },
  { names: ['french', 'français'], label: 'French', code: 'fr' },
  { names: ['german', 'deutsch'], label: 'German', code: 'de' },
  { names: ['italian'], label: 'Italian', code: 'it' },
  { names: ['portuguese'], label: 'Portuguese', code: 'pt' },
  { names: ['russian'], label: 'Russian', code: 'ru' },
  { names: ['ukrainian'], label: 'Ukrainian', code: 'ua' },
  { names: ['arabic'], label: 'Arabic', code: 'sa' },
  { names: ['chinese'], label: 'Chinese', code: 'cn' },
  { names: ['japanese'], label: 'Japanese', code: 'jp' },
  { names: ['korean'], label: 'Korean', code: 'kr' },
  { names: ['thai'], label: 'Thai', code: 'th' },
  { names: ['indonesian'], label: 'Indonesian', code: 'id' },
  { names: ['malay'], label: 'Malay', code: 'my' },
  { names: ['greek'], label: 'Greek', code: 'gr' },
  { names: ['polish'], label: 'Polish', code: 'pl' },
  { names: ['serbian'], label: 'Serbian', code: 'rs' },
  { names: ['turkish'], label: 'Turkish', code: 'tr' },
  { names: ['tamil'], label: 'Tamil', code: 'in' },
  { names: ['hindi'], label: 'Hindi', code: 'in' },
  { names: ['dutch'], label: 'Dutch', code: 'nl' }
];

function parseLanguage(raw) {
  var s = String(raw || '').trim();
  var low = s.toLowerCase();
  var qual = (s.match(/\(([^)]+)\)/) || [])[1] || '';
  qual = qual.toUpperCase();
  if (low.indexOf('multi') !== -1) {
    return { label: qual ? 'Multi (' + qual + ')' : 'Multi', codes: [], multi: true };
  }
  var found = [];
  LANG_TABLE.forEach(function (L) {
    for (var i = 0; i < L.names.length; i++) {
      if (low.indexOf(L.names[i]) !== -1) { found.push(L); break; }
    }
  });
  if (!found.length) return { label: s || '—', codes: [], multi: true };
  var label = found.map(function (L) { return L.label; }).join(' / ');
  if (qual) label += ' (' + qual + ')';
  var codes = found.map(function (L) { return L.code; })
    .filter(function (c, i, a) { return a.indexOf(c) === i; }).slice(0, 4);
  return { label: label, codes: codes, multi: false };
}

function flagImgs(info) {
  if (!info.codes.length) {
    return '<span class="material-symbols-outlined icon-sm cufiy-globe" aria-hidden="true">language</span>';
  }
  return info.codes.map(function (c) {
    return '<img class="flag" src="' + PASSPORT_FLAGS + c + '.svg" alt="' + esc(c) +
      '" loading="lazy" decoding="async" width="20" height="15" onerror="this.remove()">';
  }).join('');
}

/* Iconify icons (reference set) for module content types. */
function typeIcons(rawCat) {
  var icons = [];
  if (rawCat.includes('anime')) icons.push('mdi:television-play');
  if (rawCat.includes('movie') || rawCat.includes('show') || rawCat.includes('film')) icons.push('mdi:movie-open-outline');
  if (rawCat === 'mangas' || rawCat.includes('manga')) icons.push('mdi:book-open-page-variant-outline');
  if (rawCat === 'novels' || rawCat.includes('novel')) icons.push('mdi:script-text-outline');
  if (rawCat.includes('torrent') || rawCat.includes('debrid')) icons.push('mdi:magnet');
  if (!icons.length) icons.push('mdi:movie-open-outline');
  return icons;
}

function primaryApp(m) {
  if (!m) return 'sora';
  if (m.supportsSora !== false) return 'sora';
  if (m.supportsLuna !== false) return 'luna';
  if (m.supportsShirox === true) return 'shirox';
  return 'sora';
}

function deepLink(app, manifestUrl) {
  // Preserve the tested Sora scheme; Luna/Shirox mirror it.
  if (app === 'luna') return 'luna://module?url=' + encodeURIComponent(manifestUrl);
  if (app === 'shirox') return 'shirox://module?url=' + encodeURIComponent(manifestUrl);
  return 'sora://module?url=' + encodeURIComponent(manifestUrl);
}

function showState(kind) {
  if (!grid) return;
  if (kind === 'loading') {
    grid.innerHTML = '<div class="skeleton"></div>'.repeat(6);
  } else {
    grid.innerHTML = '<div class="state-box"><div class="spinner"></div><div>' + esc(t('state.loading')) + '</div></div>';
  }
}

function showFail() {
  if (!grid) return;
  grid.innerHTML = '<div class="state-box">' + esc(t('state.fail')) + '</div>';
}

/* Render shells immediately (fast first paint), then hydrate per manifest. */
function renderShells() {
  if (!grid) return;
  grid.innerHTML = entries.map(function (e, i) {
    var dis = e.discontinued ? ' card-discontinued' : '';
    return '<article class="card' + dis + '" data-id="' + esc(e.id) + '" style="animation-delay:' + Math.min(i, 10) * 30 + 'ms">' +
      '<div class="card-head"><div class="card-icon">' +
      '<img src="' + esc(e.iconUrl) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' +
      '</div><div class="cufiy-head-info"><div class="card-title-row">' +
      '<div class="card-title">' + esc(e.name) + '</div><span class="ver" data-role="ver">…</span>' +
      '</div><div class="card-branch">' + esc(e.id) + '</div></div>' +
      (e.discontinued ? '<span class="discontinued-badge"><span class="material-symbols-outlined icon-sm">block</span> Discontinued</span>' : '') +
      '</div><div class="card-body"><div class="meta" data-role="meta"><span class="chip">loading…</span></div><div class="links" data-role="links"></div></div></article>';
  }).join('');
  entries.forEach(function (e) {
    var card = grid.querySelector('[data-id="' + cssEsc(e.id) + '"]');
    if (card) cards[e.id] = {
      card: card,
      meta: card.querySelector('[data-role="meta"]'),
      links: card.querySelector('[data-role="links"]'),
      ver: card.querySelector('[data-role="ver"]')
    };
  });
}

function hydrate(entry, m) {
  manifests[entry.id] = m;
  var ref = cards[entry.id];
  if (!ref) return;
  ref.ver.textContent = 'v' + (m.version || '?');

  var rawCat = rawCategory(entry);
  var icons = typeIcons(rawCat).map(function (ic) {
    return '<span class="card-types"><iconify-icon icon="' + esc(ic) + '" aria-hidden="true"></iconify-icon></span>';
  }).join('');
  var lang = parseLanguage(m.language);
  var dl = m.downloadSupport ? '<span class="material-symbols-outlined icon-sm cufiy-dl" title="download">cloud_download</span>' : '';
  ref.meta.innerHTML = '<div class="cufiy-meta"><span class="cufiy-flag" role="img" aria-label="' + esc(lang.label) + '">' + flagImgs(lang) + '</span>' +
    '<span class="cufiy-lang">' + esc(lang.label) + '</span>' + icons + dl + '</div>';

  ref.links.textContent = '';
  if (entry.discontinued) {
    var bar = el('div', 'discontinued-bar');
    bar.innerHTML = '<span class="material-symbols-outlined icon-sm">block</span> Discontinued';
    ref.links.appendChild(bar);
    return;
  }

  var app = primaryApp(m);
  var target = entry.manifestUrl;
  var badge = function (label, on) {
    return '<span class="' + (on ? 'on' : '') + '">' + esc(label) + '</span>';
  };
  var appsHtml = '<div class="apps">' +
    badge('Sora', m.supportsSora !== false) +
    badge('Luna', m.supportsLuna !== false) +
    badge('Shirox', m.supportsShirox === true) +
    (m.supportsEclipse ? badge('Eclipse', true) : '') + '</div>';

  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="card-bottom"><div class="author">' +
    (m.author && m.author.icon ? '<img src="' + esc(m.author.icon) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' : '') +
    '<span style="color:var(--fg-muted);font-weight:500" data-role="by">' + esc(t('card.by')) + '</span>' +
    (m.author && m.author.url
      ? '<a href="' + esc(m.author.url) + '" target="_blank" rel="noopener">' + esc(m.author.name || '?') + '</a>'
      : '<span>' + esc((m.author && m.author.name) || '?') + '</span>') +
    '</div>' + appsHtml + '</div>' +
    '<div class="split"><a class="add" href="' + esc(deepLink(app, target)) + '">' +
    '<span class="material-symbols-outlined" style="font-size:20px" aria-hidden="true">add</span><span data-role="addlabel">' + esc(t('card.add')) + '</span></a>' +
    '<button class="copy" type="button" data-copy="' + esc(target) + '" title="' + esc(t('card.copy')) + '">' +
    '<span class="material-symbols-outlined" style="font-size:20px" aria-hidden="true">link</span></button></div>';
  var bottom = wrap.querySelector('.card-bottom');
  if (bottom) ref.links.appendChild(bottom);
  var split = wrap.querySelector('.split');
  if (split) ref.links.appendChild(split);
}

function renderGrid() {
  if (!grid || !entries.length) return;
  var visible = 0;
  entries.forEach(function (e) {
    var ref = cards[e.id];
    if (!ref) return;
    var show = matchCat(e) && matchApp(e) && matchSearch(e);
    ref.card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // Refresh labels baked at hydrate time so the lang switch applies to cards.
  grid.querySelectorAll('[data-role="addlabel"]').forEach(function (n) { n.textContent = t('card.add'); });
  grid.querySelectorAll('[data-role="by"]').forEach(function (n) { n.textContent = t('card.by'); });
  grid.querySelectorAll('.split .copy').forEach(function (b) { b.title = t('card.copy'); });
  // Empty state (reference pattern).
  var empty = grid.querySelector('.empty');
  if (!visible) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty';
      empty.style.gridColumn = '1/-1';
      grid.appendChild(empty);
    }
    empty.innerHTML = '<span class="material-symbols-outlined">search_off</span><h3>' +
      esc(t('empty.t')) + '</h3><p>' + esc(t('empty.d')) + '</p>';
    empty.hidden = false;
  } else if (empty) {
    empty.hidden = true;
  }
  updateResultCount();
}

/* copy + toast (delegated, one listener) */

var toastTimer = 0;
function toast(msg) {
  var box = $('toast'), txt = $('toastText');
  if (!box || !txt) return;
  txt.textContent = msg;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { box.classList.remove('show'); }, 1800);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise(function (resolve, reject) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
    ta.remove();
  });
}

/* ---------------- library boot ---------------- */

function initControls() {
  var search = $('libSearch'), clear = $('libSearchClear');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', debounce(function () {
      state.q = String(search.value || '').trim().toLowerCase();
      if (clear) clear.hidden = !state.q;
      renderGrid();
    }, 150));
  }
  if (clear && !clear.dataset.bound) {
    clear.dataset.bound = '1';
    clear.addEventListener('click', function () {
      if (search) search.value = '';
      state.q = '';
      clear.hidden = true;
      renderGrid();
      if (search) search.focus();
    });
  }
  var cats = $('categoryFilters');
  if (cats && !cats.dataset.bound) {
    cats.dataset.bound = '1';
    cats.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-category]');
      if (!b) return;
      cats.querySelectorAll('.filter-pill').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      state.cat = b.dataset.category || 'all';
      renderGrid();
    });
  }
  var apps = $('appFilters');
  if (apps && !apps.dataset.bound) {
    apps.dataset.bound = '1';
    apps.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-app]');
      if (!b) return;
      var id = b.dataset.app;
      state.apps[id] = !state.apps[id];
      b.classList.toggle('active', !!state.apps[id]);
      b.setAttribute('aria-pressed', state.apps[id] ? 'true' : 'false');
      renderGrid();
    });
  }
  if (grid && !grid.dataset.bound) {
    grid.dataset.bound = '1';
    grid.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-copy]');
      if (!b) return;
      copyText(b.dataset.copy).then(function () {
        b.classList.add('copied');
        var ic = b.querySelector('.material-symbols-outlined');
        var orig = ic ? ic.textContent : '';
        if (ic) ic.textContent = 'check';
        toast(t('toast.copied'));
        setTimeout(function () {
          b.classList.remove('copied');
          if (ic) ic.textContent = orig || 'link';
        }, 1500);
      }).catch(function () { toast(t('toast.copyFail')); });
    });
  }
  enableChipDrag($('categoryFilters'));
}

function enableChipDrag(node) {
  if (!node || node.dataset.drag) return;
  node.dataset.drag = '1';
  var down = false, sx = 0, sl = 0, moved = false;
  node.addEventListener('pointerdown', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    down = true; moved = false; sx = e.clientX; sl = node.scrollLeft;
    node.classList.add('dragging');
  });
  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - sx;
    if (Math.abs(dx) > 4) moved = true;
    node.scrollLeft = sl - dx;
  });
  window.addEventListener('pointerup', function () {
    down = false;
    node.classList.remove('dragging');
    setTimeout(function () { moved = false; }, 0);
  });
  node.addEventListener('click', function (e) {
    if (moved) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

function bootLibrary() {
  initControls();
  if (booted || loading) { renderGrid(); return; }
  loading = true;
  showState('loading');
  loadIndex().then(function (mods) {
    entries = mods;
    renderShells();
    renderGrid();
    updateStats();
    // Hydrate manifests with bounded concurrency; refresh UI as each lands.
    return mapLimit(entries, CONCURRENCY, function (entry) {
      return loadManifest(entry).then(function (m) {
        hydrate(entry, m);
      }).catch(function () {
        var ref = cards[entry.id];
        if (ref) {
          ref.ver.textContent = '?';
          ref.meta.innerHTML = '<span class="chip">offline</span>';
        }
      }).then(function () { renderGrid(); });
    });
  }).then(function () {
    booted = true;
    loading = false;
    renderGrid();
    updateStats();
  }).catch(function () {
    loading = false;
    showFail();
  });
}

/* Preload index on landing too so stats + first library paint are instant. */
function preloadForLanding() {
  if (booted || loading || isLibraryRoute()) return;
  loading = true;
  loadIndex().then(function (mods) {
    entries = mods;
    loading = false;
    // Hydrate just enough for stats (type/author per manifest, cached).
    return allSettled(mods.map(preloadOne)).then(function () { updateStats(); });
  }).catch(function () { loading = false; });
}

function preloadOne(entry) {
  var hit = cacheRead(entry.id);
  if (hit) { manifests[entry.id] = hit; return Promise.resolve(hit); }
  return fetchJson(entry.manifestUrl).then(function (m) {
    manifests[entry.id] = m;
    cacheWrite(entry.id, m);
    return m;
  }).catch(function () { return null; });
}

/* ---------------- init ---------------- */

var LIBRARY_FALLBACK = 'https://xdfkenny.dpdns.org/xdfkenny-sora-modules/modules/?embed=true';

/* Dynamic library URL (reference optimization): same-origin when served over
 * HTTP, frozen fallback for file:// previews. Keeps our tested
 * sora://default_page?url= scheme. */
function libraryPageUrl() {
  try {
    if (location.origin && location.origin.indexOf('http') === 0) {
      return new URL('modules/?embed=true', location.href).href;
    }
  } catch (e) { /* ignore */ }
  return LIBRARY_FALLBACK;
}

function initHeroBtn() {
  var b = $('btnHeroAddSora');
  if (b) b.href = 'sora://default_page?url=' + encodeURIComponent(libraryPageUrl());
}

/* Donation modal — only on mobile, only on landing page */
function initDonateModal() {
  var modal = $('donateModal');
  if (!modal) return;
  var closeBtn = $('donateClose');
  var backdrop = $('donateBackdrop');
  function isMobile() { return window.matchMedia('(max-width: 768px)').matches; }
  function dismiss() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  function show() {
    // only show on landing page, not library (avoids accidental clicks on library links)
    if (!isMobile() || isLibraryRoute()) return;
    modal.style.display = '';
    document.body.style.overflow = 'hidden';
  }
  function onDismiss(e) {
    // only dismiss when tapping the backdrop or modal itself, NOT the box content
    if (e.target === modal || e.target === backdrop) dismiss();
  }
  if (closeBtn) closeBtn.addEventListener('click', dismiss);
  if (closeBtn) closeBtn.addEventListener('touchend', dismiss);
  if (backdrop) backdrop.addEventListener('click', onDismiss);
  if (backdrop) backdrop.addEventListener('touchend', onDismiss);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display !== 'none') dismiss();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(max-width: 768px)');
    mq.addEventListener('change', function (e) {
      if (e.matches) show(); else { modal.style.display = 'none'; document.body.style.overflow = ''; }
    });
  }
  show();
}

initTheme();
initNav();
initHeroBtn();
makeSnow();
applyI18n();
route();
initDonateModal();
preloadForLanding();
