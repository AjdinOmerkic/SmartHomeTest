/**
 * Smart Home Dashboard — app.js
 *
 * Architecture:
 *   Config        — all user-editable values in one place
 *   uid()         — unique ID generator
 *   Storage       — localStorage persistence for shopping list
 *   Clock         — updates time/date every second
 *   Weather       — fetches Open-Meteo, updates every 10 min
 *   News          — fetches RSS from Bosnian news sites via CORS proxy
 *   ShoppingList  — localStorage-backed list; seeds from Google Sheets on first load
 *                   supports add, long-press-select, delete selected, clear all
 *   Modes         — manages SAVER (clock/news sub-screens) ↔ SHOPPING transitions
 *   SwipeHandler  — horizontal swipe cycles saver sub-screens; tap opens shopping
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONFIG — edit these values before deploying
═══════════════════════════════════════════════════════════ */
const CONFIG = {

  /* ── Google Sheets (no API key required) ───────────── */
  sheets: {
    spreadsheetId: '1m9IoejCF9aqKx5yWTKRQXkWQt-pH00ZcCimQ-KrHcNg',
    sheetName:     'Sheet1',
    scriptUrl:     'YOUR_APPS_SCRIPT_URL',
  },

  /* ── Weather (Open-Meteo — free, no API key) ────────── */
  weather: {
    latitude:  '44.53598540715475',
    longitude: '18.66269391653291',
    updateIntervalMs: 600_000,
  },

  /* ── Shopping list ──────────────────────────────────── */
  shopping: {
    updateIntervalMs: 300_000,
  },

  /* ── News RSS sources ───────────────────────────────── */
  // Uses Google News RSS search (site:domain) — reliable, always valid XML,
  // no API key needed. To swap a source just change the q= domain.
  news: {
    updateIntervalMs: 600_000,   // refresh every 10 minutes
    maxItems: 12,
    rss: 'https://www.klix.ba/rss',
  },

};

/* ═══════════════════════════════════════════════════════════
   TRANSLATIONS — English and Bosnian
═══════════════════════════════════════════════════════════ */
const TRANSLATIONS = {
  en: {
    days:   ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    months: ['January','February','March','April','May','June',
             'July','August','September','October','November','December'],
    shoppingTitle:  'Shopping List',
    addPlaceholder: 'Add item…',
    cancel:         'Cancel',
    clearAll:       'Clear All',
    sure:           'Sure?',
    allDone:        'All done!',
    listEmpty:      'List is empty',
    failedLoad:     'Could not load list',
    tapHint:        'Tap anywhere · Swipe for news',
    weatherUnavail: 'Weather unavailable',
    itemCount: function(n) { return n + ' item' + (n !== 1 ? 's' : ''); },
    selected:  function(n) { return n + ' selected'; },
    deleteBtn: function(n) { return n > 0 ? 'Delete (' + n + ')' : 'Delete'; },
    wmo: {
      0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast',
      45:'Fog', 48:'Icy fog',
      51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle',
      56:'Freezing drizzle', 57:'Heavy freezing drizzle',
      61:'Light rain', 63:'Rain', 65:'Heavy rain',
      66:'Freezing rain', 67:'Heavy freezing rain',
      71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains',
      80:'Showers', 81:'Rain showers', 82:'Heavy showers',
      85:'Snow showers', 86:'Heavy snow showers',
      95:'Thunderstorm', 96:'Thunderstorm & hail', 99:'Thunderstorm & hail',
    },
  },
  bs: {
    days:   ['Nedjelja','Ponedjeljak','Utorak','Srijeda','Četvrtak','Petak','Subota'],
    months: ['Januar','Februar','Mart','April','Maj','Juni',
             'Juli','August','Septembar','Oktobar','Novembar','Decembar'],
    shoppingTitle:  'Lista kupovine',
    addPlaceholder: 'Dodaj stavku…',
    cancel:         'Otkaži',
    clearAll:       'Obriši sve',
    sure:           'Sigurno?',
    allDone:        'Gotovo!',
    listEmpty:      'Lista je prazna',
    failedLoad:     'Greška pri učitavanju',
    tapHint:        'Tapnite · Prevucite za vijesti',
    weatherUnavail: 'Nema vremenskih podataka',
    itemCount: function(n) {
      if (n === 1) return '1 stavka';
      if (n >= 2 && n <= 4) return n + ' stavke';
      return n + ' stavki';
    },
    selected:  function(n) { return n + ' odabrano'; },
    deleteBtn: function(n) { return n > 0 ? 'Obriši (' + n + ')' : 'Obriši'; },
    wmo: {
      0:'Vedro nebo', 1:'Uglavnom vedro', 2:'Djelimično oblačno', 3:'Oblačno',
      45:'Magla', 48:'Smrznuta magla',
      51:'Slaba rosulja', 53:'Rosulja', 55:'Jaka rosulja',
      56:'Smrznuta rosulja', 57:'Jaka smrznuta rosulja',
      61:'Slaba kiša', 63:'Kiša', 65:'Jaka kiša',
      66:'Smrznuta kiša', 67:'Jaka smrznuta kiša',
      71:'Slabi snijeg', 73:'Snijeg', 75:'Jak snijeg', 77:'Snježne pahulje',
      80:'Pljuskovi', 81:'Kišni pljuskovi', 82:'Jaki pljuskovi',
      85:'Snježni pljuskovi', 86:'Jaki snježni pljuskovi',
      95:'Grmljavina', 96:'Grmljavina s gradom', 99:'Grmljavina s gradom',
    },
  },
};

/* ═══════════════════════════════════════════════════════════
   WMO WEATHER CODE MAPS
═══════════════════════════════════════════════════════════ */
const WMO_ICONS = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌧️',
  56:'🌧️', 57:'🌧️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  66:'🌨️', 67:'🌨️',
  71:'🌨️', 73:'❄️', 75:'❄️', 77:'❄️',
  80:'🌧️', 81:'🌧️', 82:'🌧️',
  85:'🌨️', 86:'🌨️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};

function wmoIcon(code) { return WMO_ICONS[code] || '🌡️'; }
function wmoDesc(code) { return (I18n.t().wmo[code]) || '—'; }

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════
   MODULE: Storage
═══════════════════════════════════════════════════════════ */
const Storage = (() => {
  const KEY = 'shl_v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }

  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { console.warn('[Storage]', e.message); }
  }

  return { load, save };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: I18n
═══════════════════════════════════════════════════════════ */
const I18n = (() => {
  let lang = localStorage.getItem('lang') || 'en';

  function t() { return TRANSLATIONS[lang]; }
  function getLang() { return lang; }

  function apply() {
    const tr  = t();
    const next = lang === 'en' ? 'BS' : 'EN';

    DOM.tapHint.textContent       = tr.tapHint;
    DOM.shoppingTitle.textContent = tr.shoppingTitle;
    DOM.addInput.placeholder      = tr.addPlaceholder;
    DOM.emptyText.textContent     = tr.allDone;
    DOM.btnCancelSel.textContent  = tr.cancel;
    if (DOM.btnClearAll.dataset.confirm !== '1') {
      DOM.btnClearAll.textContent = tr.clearAll;
    }
    DOM.btnLang.textContent      = next;
    DOM.btnLangSaver.textContent = next;
    Clock.resetDate();
    Weather.refreshDesc();
  }

  function setLang(l) {
    lang = l;
    localStorage.setItem('lang', l);
    apply();
  }

  function toggle() { setLang(lang === 'en' ? 'bs' : 'en'); }

  function init() {
    apply();
    DOM.btnLang.addEventListener('click',     e => { e.stopPropagation(); toggle(); });
    DOM.btnLangSaver.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  }

  return { init, t, getLang };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Theme
═══════════════════════════════════════════════════════════ */
const Theme = (() => {
  let current = localStorage.getItem('theme') || 'dark';

  function apply() {
    document.documentElement.dataset.theme = current;
    DOM.btnTheme.textContent = current === 'dark' ? '☀️' : '🌙';
  }

  function toggle() {
    current = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', current);
    apply();
  }

  function init() {
    apply();
    DOM.btnTheme.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES — cached once at startup
═══════════════════════════════════════════════════════════ */
const DOM = {
  // Screens
  screensaver:     document.getElementById('screensaver'),
  news:            document.getElementById('news'),
  shopping:        document.getElementById('shopping'),
  // Clock
  clockTime:       document.getElementById('clock-time'),
  clockSeconds:    document.getElementById('clock-seconds'),
  clockDate:       document.getElementById('clock-date'),
  // Weather
  weatherIcon:     document.getElementById('weather-icon'),
  weatherTemp:     document.getElementById('weather-temp'),
  weatherDesc:     document.getElementById('weather-desc'),
  weatherHiLo:     document.getElementById('weather-hilo'),
  weatherForecast: document.getElementById('weather-forecast'),
  weatherError:    document.getElementById('weather-error'),
  tapHint:         document.getElementById('tap-hint'),
  // News
  newsFeed:        document.getElementById('news-feed'),
  newsUpdated:     document.getElementById('news-updated'),
  // Shopping list
  shoppingList:    document.getElementById('shopping-list'),
  shoppingMeta:    document.getElementById('shopping-meta'),
  shoppingEmpty:   document.getElementById('shopping-empty'),
  shoppingError:   document.getElementById('shopping-error'),
  shoppingErrTxt:  document.getElementById('shopping-error-text'),
  // Add form
  addForm:         document.getElementById('add-form'),
  addInput:        document.getElementById('add-input'),
  btnAdd:          document.getElementById('btn-add'),
  btnAddConfirm:   document.getElementById('btn-add-confirm'),
  btnAddCancel:    document.getElementById('btn-add-cancel'),
  // Selection bar
  selectionBar:    document.getElementById('selection-bar'),
  selCount:        document.getElementById('sel-count'),
  btnDeleteSel:    document.getElementById('btn-delete-sel'),
  btnCancelSel:    document.getElementById('btn-cancel-sel'),
  btnClearAll:     document.getElementById('btn-clear-all'),
  // News popup
  newsPopup:         document.getElementById('news-popup'),
  newsPopupBackdrop: document.getElementById('news-popup-backdrop'),
  newsPopupClose:    document.getElementById('news-popup-close'),
  newsPopupSource:   document.getElementById('news-popup-source'),
  newsPopupTitle:    document.getElementById('news-popup-title'),
  newsPopupTime:     document.getElementById('news-popup-time'),
  newsPopupLink:     document.getElementById('news-popup-link'),
  // Nav
  btnScreensaver:  document.getElementById('btn-screensaver'),
  // Language & theme
  btnLang:         document.getElementById('btn-lang'),
  btnLangSaver:    document.getElementById('btn-lang-saver'),
  btnTheme:        document.getElementById('btn-theme'),
  shoppingTitle:   document.getElementById('shopping-title'),
  emptyText:       document.getElementById('empty-text'),
};

/* ═══════════════════════════════════════════════════════════
   MODULE: Clock
═══════════════════════════════════════════════════════════ */
const Clock = (() => {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  let prevMin = -1;

  function tick() {
    const now  = new Date();
    const hrs  = now.getHours();
    const mins = now.getMinutes();
    const secs = now.getSeconds();

    DOM.clockSeconds.textContent = pad(secs);

    if (mins !== prevMin) {
      prevMin = mins;
      const tr = I18n.t();
      DOM.clockTime.textContent = pad(hrs) + ':' + pad(mins);
      DOM.clockDate.textContent =
        tr.days[now.getDay()] + ', ' + tr.months[now.getMonth()] + ' ' + now.getDate();
    }
  }

  function resetDate() { prevMin = -1; }

  function init() {
    tick();
    setInterval(tick, 1000);
  }

  return { init, resetDate };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Weather
═══════════════════════════════════════════════════════════ */
const Weather = (() => {
  const cfg = CONFIG.weather;
  let lastCode = null;

  function fmt(temp) { return Math.round(temp) + '°C'; }

  function showError() {
    DOM.weatherError.classList.remove('hidden');
    DOM.weatherForecast.innerHTML = '';
  }

  function refreshDesc() {
    if (lastCode !== null) DOM.weatherDesc.textContent = wmoDesc(lastCode);
  }

  function render(data) {
    const SHORT = I18n.t().days.map(d => d.slice(0, 3));
    const cur   = data.current;
    const daily = data.daily;

    lastCode = cur.weather_code;
    DOM.weatherIcon.textContent = wmoIcon(cur.weather_code);
    DOM.weatherTemp.textContent = fmt(cur.temperature_2m);
    DOM.weatherDesc.textContent = wmoDesc(cur.weather_code);
    DOM.weatherHiLo.textContent =
      'H: ' + fmt(daily.temperature_2m_max[0]) +
      '  ·  L: ' + fmt(daily.temperature_2m_min[0]);
    DOM.weatherError.classList.add('hidden');

    const frag = document.createDocumentFragment();
    for (let i = 1; i <= 4; i++) {
      if (!daily.time[i]) break;
      const d    = new Date(daily.time[i] + 'T12:00:00');
      const card = document.createElement('div');
      card.className = 'forecast-day';
      card.innerHTML =
        '<span class="forecast-day-name">' + SHORT[d.getDay()]                + '</span>' +
        '<span class="forecast-icon">'     + wmoIcon(daily.weather_code[i])   + '</span>' +
        '<span class="forecast-high">'     + fmt(daily.temperature_2m_max[i]) + '</span>' +
        '<span class="forecast-low">'      + fmt(daily.temperature_2m_min[i]) + '</span>';
      frag.appendChild(card);
    }
    DOM.weatherForecast.innerHTML = '';
    DOM.weatherForecast.appendChild(frag);
  }

  async function fetchWeather() {
    const { latitude, longitude } = cfg;
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude='  + latitude +
      '&longitude=' + longitude +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto' +
      '&forecast_days=5';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      render(await res.json());
    } catch (err) {
      console.warn('[Weather] fetch failed:', err.message);
      showError();
    }
  }

  function init() {
    fetchWeather();
    setInterval(fetchWeather, cfg.updateIntervalMs);
  }

  return { init, refreshDesc };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: News
   Fetches RSS feeds from Bosnian news sites via CORS proxy.
   Renders a scrollable headline list; tabs switch sources.
═══════════════════════════════════════════════════════════ */
const News = (() => {
  const cfg = CONFIG.news;

  const PROXIES = [
    url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  ];

  let cache = null;

  // ─── Fetch helpers ────────────────────────────────────────

  async function fetchWithTimeout(url, ms) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async function fetchRSS(rssUrl) {
    let lastErr;
    for (const proxy of PROXIES) {
      try {
        const res = await fetchWithTimeout(proxy(rssUrl), 12000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        return parseRSS(text);
      } catch (e) {
        lastErr = e;
        console.warn('[News] proxy failed, trying next:', e.message);
      }
    }
    throw lastErr || new Error('All proxies failed');
  }

  // ─── RSS XML parser ───────────────────────────────────────

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML parse error');

    const items = [...doc.querySelectorAll('item')];
    if (items.length === 0) throw new Error('Empty feed');

    return items.slice(0, cfg.maxItems).map(el => {
      const title = el.querySelector('title')?.textContent?.trim() || '';

      const pubDate    = el.querySelector('pubDate')?.textContent?.trim() || '';
      const link       = el.querySelector('link')?.textContent?.trim() || '';
      const sourceEl   = el.querySelector('source');
      const sourceName = sourceEl?.textContent?.trim() || '';
      return { title, link, pubDate, sourceName };
    }).filter(a => a.title);
  }

  // ─── Relative time ───────────────────────────────────────

  function relTime(dateStr) {
    if (!dateStr) return '';
    try {
      const diffMin = (Date.now() - new Date(dateStr).getTime()) / 60000;
      if (diffMin < 1)    return 'upravo';
      if (diffMin < 60)   return Math.floor(diffMin) + ' min';
      if (diffMin < 1440) return Math.floor(diffMin / 60) + ' h';
      return Math.floor(diffMin / 1440) + ' d';
    } catch { return ''; }
  }

  // ─── Render ──────────────────────────────────────────────

  function render(articles) {
    const feed = DOM.newsFeed;

    if (!articles || articles.length === 0) {
      feed.innerHTML = '<div class="news-error">No articles found</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    articles.forEach((a, i) => {
      const item = document.createElement('div');
      item.className = 'news-item';
      item.style.animationDelay = Math.min(i * 35, 300) + 'ms';

      const time = relTime(a.pubDate);
      item.innerHTML =
        '<div class="news-item-title">' + escHtml(a.title) + '</div>' +
        (time ? '<div class="news-item-time">' + time + '</div>' : '');
      item.addEventListener('click', e => { e.stopPropagation(); NewsPopup.open(a); });
      frag.appendChild(item);
    });

    feed.innerHTML = '';
    feed.appendChild(frag);
    feed.scrollTop = 0;
  }

  function showLoading() {
    DOM.newsFeed.innerHTML = '<div class="news-loading">Loading…</div>';
  }

  function showError(msg) {
    DOM.newsFeed.innerHTML = '<div class="news-error">' + escHtml(msg || 'Could not load news') + '</div>';
  }

  // ─── Load feed (with cache) ──────────────────────────────

  async function load(forceRefresh) {
    if (!forceRefresh && cache) {
      render(cache);
      return;
    }

    showLoading();
    try {
      const articles = await fetchRSS(cfg.rss);
      cache = articles;
      render(articles);
      const now = new Date();
      DOM.newsUpdated.textContent =
        'Updated ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    } catch (e) {
      console.warn('[News] failed to load feed:', e);
      showError('Could not load — check connection');
    }
  }

  function refresh() {
    cache = null;
    load(true);
  }

  function init() {
    load();
    setInterval(refresh, cfg.updateIntervalMs);
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: NewsPopup
   Shows article details in a modal when a headline is tapped.
═══════════════════════════════════════════════════════════ */
const NewsPopup = (() => {
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString(I18n.getLang() === 'bs' ? 'bs-BA' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateStr; }
  }

  function open(article) {
    DOM.newsPopupSource.textContent = article.sourceName || '';
    DOM.newsPopupTitle.textContent  = article.title;
    DOM.newsPopupTime.textContent   = formatDate(article.pubDate);
    DOM.newsPopupLink.href          = article.link || '#';
    DOM.newsPopup.classList.remove('hidden');
  }

  function close() {
    DOM.newsPopup.classList.add('hidden');
  }

  function init() {
    DOM.newsPopupClose.addEventListener('click', e => { e.stopPropagation(); close(); });
    DOM.newsPopupBackdrop.addEventListener('click', close);
  }

  return { init, open, close };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: ShoppingList
═══════════════════════════════════════════════════════════ */
const ShoppingList = (() => {
  const cfg = CONFIG.sheets;

  let items    = [];
  let selected = new Set();
  let inSel    = false;

  function hasScript() {
    return cfg.scriptUrl && cfg.scriptUrl !== 'YOUR_APPS_SCRIPT_URL';
  }

  async function sheetRead() {
    const res  = await fetch(cfg.scriptUrl + '?action=list');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Script error');
    return data.items.map(text => ({ id: uid(), text }));
  }

  function sheetWrite(action, params) {
    if (!hasScript()) return;
    let url = cfg.scriptUrl + '?action=' + action;
    if (params) {
      Object.keys(params).forEach(k => {
        const v = typeof params[k] === 'object'
          ? JSON.stringify(params[k])
          : String(params[k]);
        url += '&' + k + '=' + encodeURIComponent(v);
      });
    }
    fetch(url).catch(err => console.warn('[ShoppingList] write failed:', err.message));
  }

  function addItem(text) {
    const t = text.trim();
    if (!t) return;
    items.unshift({ id: uid(), text: t });
    Storage.save(items);
    sheetWrite('add', { item: t });
    render();
  }

  function removeSelected() {
    items = items.filter(item => !selected.has(item.id));
    Storage.save(items);
    sheetWrite('sync', { items: items.map(i => i.text) });
    exitSelectionMode();
  }

  function clearAll() {
    items = [];
    Storage.save(items);
    sheetWrite('clear');
    exitSelectionMode();
  }

  function enterSelectionMode(firstId) {
    inSel = true;
    selected.clear();
    selected.add(firstId);
    DOM.selectionBar.classList.remove('hidden');
    render();
    updateSelBar();
  }

  function exitSelectionMode() {
    inSel = false;
    selected.clear();
    DOM.selectionBar.classList.add('hidden');
    render();
  }

  function toggleSelect(id) {
    if (selected.has(id)) { selected.delete(id); }
    else                  { selected.add(id);    }
    const card = DOM.shoppingList.querySelector('[data-id="' + id + '"]');
    if (card) card.classList.toggle('selected', selected.has(id));
    updateSelBar();
  }

  function updateSelBar() {
    const n  = selected.size;
    const tr = I18n.t();
    DOM.selCount.textContent     = tr.selected(n);
    DOM.btnDeleteSel.textContent = tr.deleteBtn(n);
    DOM.btnDeleteSel.disabled    = (n === 0);
  }

  function addLongPress(el, cb) {
    let timer = null;
    function start() { timer = setTimeout(() => { timer = null; cb(); }, 500); }
    function abort() { clearTimeout(timer); timer = null; }
    el.addEventListener('touchstart',  start, { passive: true });
    el.addEventListener('touchend',    abort, { passive: true });
    el.addEventListener('touchmove',   abort, { passive: true });
    el.addEventListener('mousedown',   start);
    el.addEventListener('mouseup',     abort);
    el.addEventListener('mouseleave',  abort);
  }

  function render() {
    DOM.shoppingError.classList.add('hidden');
    const tr = I18n.t();

    if (items.length === 0) {
      DOM.shoppingList.innerHTML = '';
      DOM.shoppingEmpty.classList.remove('hidden');
      DOM.shoppingMeta.textContent = tr.listEmpty;
      return;
    }

    DOM.shoppingEmpty.classList.add('hidden');
    DOM.shoppingMeta.textContent = tr.itemCount(items.length);

    const frag = document.createDocumentFragment();

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className  = 'card' + (selected.has(item.id) ? ' selected' : '');
      card.dataset.id = item.id;
      card.style.animationDelay = inSel ? '0ms' : Math.min(idx * 30, 270) + 'ms';

      const bullet = document.createElement('div');
      bullet.className = 'card-bullet';

      const text = document.createElement('div');
      text.className   = 'card-text';
      text.textContent = item.text;

      const check = document.createElement('div');
      check.className   = 'card-check';
      check.textContent = '✓';

      card.appendChild(bullet);
      card.appendChild(text);
      card.appendChild(check);

      addLongPress(card, () => { if (!inSel) enterSelectionMode(item.id); });
      card.addEventListener('click', () => { if (inSel) toggleSelect(item.id); });

      frag.appendChild(card);
    });

    DOM.shoppingList.innerHTML = '';
    DOM.shoppingList.appendChild(frag);
  }

  function showAddForm() {
    DOM.addForm.classList.remove('hidden');
    DOM.btnAdd.style.visibility = 'hidden';
    DOM.addInput.value = '';
    setTimeout(() => DOM.addInput.focus(), 60);
  }

  function hideAddForm() {
    DOM.addForm.classList.add('hidden');
    DOM.btnAdd.style.visibility = '';
    DOM.addInput.blur();
  }

  function confirmAdd() {
    const t = DOM.addInput.value.trim();
    if (t) addItem(t);
    hideAddForm();
  }

  async function syncFromSheet() {
    if (!hasScript()) return;
    try {
      const fresh = await sheetRead();
      items = fresh;
      Storage.save(items);
      render();
    } catch (err) {
      console.warn('[ShoppingList] sync failed:', err.message);
    }
  }

  function parseCsv(raw) {
    const lines = raw.split('\n');
    const out   = [];
    for (let i = 1; i < lines.length; i++) {
      const cell = lines[i].replace(/^"(.*)"$/, '$1').trim();
      if (cell) out.push({ id: uid(), text: cell });
    }
    return out;
  }

  async function seedFromCsv() {
    const { spreadsheetId, sheetName } = cfg;
    if (!spreadsheetId || spreadsheetId === 'YOUR_SPREADSHEET_ID') {
      DOM.shoppingMeta.textContent = 'Add Spreadsheet ID in config';
      return;
    }
    try {
      const url =
        'https://docs.google.com/spreadsheets/d/' + spreadsheetId +
        '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheetName);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      items = parseCsv(await res.text());
      Storage.save(items);
      render();
    } catch (err) {
      console.warn('[ShoppingList] CSV seed failed:', err.message);
      DOM.shoppingError.classList.remove('hidden');
      DOM.shoppingErrTxt.textContent = 'Check sharing settings or Spreadsheet ID';
      DOM.shoppingMeta.textContent   = I18n.t().failedLoad;
    }
  }

  function init() {
    if (hasScript()) {
      const stored = Storage.load();
      if (stored && Array.isArray(stored) && stored.length > 0) {
        items = stored.map(item =>
          typeof item === 'string' ? { id: uid(), text: item } : item
        );
        render();
      }
      syncFromSheet();
    } else {
      const stored = Storage.load();
      if (stored && Array.isArray(stored) && stored.length > 0) {
        items = stored.map(item =>
          typeof item === 'string' ? { id: uid(), text: item } : item
        );
        render();
      } else {
        seedFromCsv();
      }
    }

    DOM.btnAdd.addEventListener('click',       e => { e.stopPropagation(); showAddForm();  });
    DOM.btnAddConfirm.addEventListener('click', e => { e.stopPropagation(); confirmAdd();  });
    DOM.btnAddCancel.addEventListener('click',  e => { e.stopPropagation(); hideAddForm(); });
    DOM.addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmAdd(); }
      if (e.key === 'Escape') { hideAddForm(); }
    });

    DOM.btnCancelSel.addEventListener('click', e => { e.stopPropagation(); exitSelectionMode(); });
    DOM.btnDeleteSel.addEventListener('click', e => { e.stopPropagation(); removeSelected(); });
    DOM.btnClearAll.addEventListener('click', e => {
      e.stopPropagation();
      if (DOM.btnClearAll.dataset.confirm === '1') {
        clearAll();
      } else {
        DOM.btnClearAll.dataset.confirm = '1';
        DOM.btnClearAll.textContent     = I18n.t().sure;
        setTimeout(() => {
          if (DOM.btnClearAll.dataset.confirm === '1') {
            DOM.btnClearAll.dataset.confirm = '0';
            DOM.btnClearAll.textContent     = I18n.t().clearAll;
          }
        }, 2500);
      }
    });
  }

  return { init, exitSelectionMode, syncFromSheet };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Modes
   Three swipeable screens in order: 0=weather, 1=shopping, 2=news
   Swiping wraps circularly. The moon button returns to screen 0.
═══════════════════════════════════════════════════════════ */
const Modes = (() => {
  let saverIndex = 0;

  // Screen order: weather → shopping → news (circular)
  const SAVER_ELS = () => [DOM.screensaver, DOM.shopping, DOM.news];

  function updateDots(idx) {
    const n = SAVER_ELS().length;
    document.querySelectorAll('.saver-dots .dot').forEach((dot, i) => {
      dot.classList.toggle('dot-active', (i % n) === idx);
    });
  }

  function showSaver(idx) {
    const els = SAVER_ELS();
    els.forEach((el, i) => el.classList.toggle('active', i === idx));
    saverIndex = idx;
    updateDots(idx);
    DOM.tapHint.classList.toggle('hidden', idx !== 0);
    if (idx === 1) {
      DOM.shoppingList.scrollTop = 0;
      ShoppingList.syncFromSheet();
    }
  }

  function switchSaver(dir) {
    const n    = SAVER_ELS().length;
    const next = ((saverIndex + dir) % n + n) % n;
    showSaver(next);
  }

  function activateScreensaver() {
    showSaver(0);
  }

  function getSaverIndex() { return saverIndex; }

  function initButton() {
    DOM.btnScreensaver.addEventListener('click', e => {
      e.stopPropagation();
      activateScreensaver();
    });
  }

  return {
    activateScreensaver,
    switchSaver,
    getSaverIndex,
    initButton,
  };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: SwipeHandler
   Horizontal swipe anywhere → cycle screens circularly.
   Vertical movement is ignored so list scrolling still works.
═══════════════════════════════════════════════════════════ */
const SwipeHandler = (() => {
  const SWIPE_THRESHOLD = 55;

  let startX = 0, startY = 0;

  function init() {
    document.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      const dx    = e.changedTouches[0].clientX - startX;
      const dy    = e.changedTouches[0].clientY - startY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx >= SWIPE_THRESHOLD && absDx > absDy * 1.5) {
        Modes.switchSaver(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
(function boot() {
  Theme.init();
  I18n.init();
  Clock.init();
  Weather.init();
  News.init();
  NewsPopup.init();
  ShoppingList.init();
  SwipeHandler.init();
  Modes.initButton();
})();
