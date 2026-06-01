/**
 * Smart Home Dashboard — app.js
 *
 * Architecture:
 *   Config       — all user-editable values in one place
 *   uid()        — unique ID generator
 *   Storage      — localStorage persistence for shopping list
 *   Clock        — updates time/date every second
 *   Weather      — fetches OpenWeatherMap, updates every 10 min
 *   ShoppingList — localStorage-backed list; seeds from Google Sheets on first load
 *                  supports add, long-press-select, delete selected, clear all
 *   Modes        — controls SCREENSAVER ↔ SHOPPING transitions
 *   Inactivity   — detects user interaction, drives mode switching
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONFIG — edit these values before deploying
═══════════════════════════════════════════════════════════ */
const CONFIG = {

  /* ── Inactivity ─────────────────────────────────────── */
  inactivitySeconds: 15,          // seconds before screensaver activates

  /* ── Google Sheets (no API key required) ───────────── */
  // 1. Create a Google Sheet with column A header "Item", items below.
  // 2. File → Share → Publish to web → Sheet1 → CSV → Publish.
  //    (Alternatively: Share → Anyone with the link → Viewer is enough.)
  // 3. Paste your Spreadsheet ID below (from the sheet URL).
  // No API key, no Google Cloud account needed.
  sheets: {
    spreadsheetId: '1m9IoejCF9aqKx5yWTKRQXkWQt-pH00ZcCimQ-KrHcNg',
    sheetName:     'Sheet1',                 // tab name (must match exactly)
  },

  /* ── OpenWeatherMap ─────────────────────────────────── */
  // 1. Sign up at openweathermap.org (free tier is sufficient).
  // 2. Generate an API key.
  // 3. Set your location coordinates below.
  weather: {
    apiKey:    '2128a3acf79c2a2080a85974224acf4c',
    latitude:  '44.53598540715475',   // Donji Mosnik, Tuzla, Bosnia
    longitude: '18.66269391653291',
    units:     'metric',              // °C
    updateIntervalMs: 600_000,  // refresh weather every 10 minutes
  },

  /* ── Shopping list ──────────────────────────────────── */
  shopping: {
    updateIntervalMs: 300_000,   // refresh list every 5 minutes
  },

};

/* ═══════════════════════════════════════════════════════════
   WEATHER ICON MAP
   Maps OpenWeatherMap condition codes to emoji
═══════════════════════════════════════════════════════════ */
const WEATHER_ICONS = {
  // Group 2xx: Thunderstorm
  200: '⛈️', 201: '⛈️', 202: '⛈️', 210: '🌩️', 211: '🌩️',
  212: '🌩️', 221: '🌩️', 230: '⛈️', 231: '⛈️', 232: '⛈️',
  // Group 3xx: Drizzle
  300: '🌦️', 301: '🌦️', 302: '🌦️', 310: '🌦️', 311: '🌦️',
  312: '🌧️', 313: '🌧️', 314: '🌧️', 321: '🌧️',
  // Group 5xx: Rain
  500: '🌧️', 501: '🌧️', 502: '🌧️', 503: '🌧️', 504: '🌧️',
  511: '🌨️', 520: '🌧️', 521: '🌧️', 522: '🌧️', 531: '🌧️',
  // Group 6xx: Snow
  600: '🌨️', 601: '❄️', 602: '❄️', 611: '🌨️', 612: '🌨️',
  613: '🌨️', 615: '🌨️', 616: '🌨️', 620: '🌨️', 621: '🌨️', 622: '❄️',
  // Group 7xx: Atmosphere
  701: '🌫️', 711: '🌫️', 721: '🌫️', 731: '💨', 741: '🌫️',
  751: '💨', 761: '💨', 762: '🌋', 771: '💨', 781: '🌪️',
  // Group 800: Clear
  800: '☀️',
  // Group 80x: Clouds
  801: '🌤️', 802: '⛅', 803: '🌥️', 804: '☁️',
};

function getWeatherIcon(code) {
  return WEATHER_ICONS[code] || '🌡️';
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */

// Short unique ID — used to tag shopping list items
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ═══════════════════════════════════════════════════════════
   MODULE: Storage
   Persists the shopping list to localStorage as JSON.
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
   DOM REFERENCES — cached once at startup
═══════════════════════════════════════════════════════════ */
const DOM = {
  // Screens
  screensaver:     document.getElementById('screensaver'),
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
  // Return countdown bar
  returnBar:       document.getElementById('return-bar'),
  returnBarFill:   document.getElementById('return-bar-fill'),
  // Nav
  btnScreensaver:  document.getElementById('btn-screensaver'),
};

/* ═══════════════════════════════════════════════════════════
   MODULE: Clock
═══════════════════════════════════════════════════════════ */
const Clock = (() => {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  // Pad a number to two digits
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  let prevMin = -1;  // avoid unnecessary DOM writes

  function tick() {
    const now  = new Date();
    const hrs  = now.getHours();
    const mins = now.getMinutes();
    const secs = now.getSeconds();

    // Seconds always update
    DOM.clockSeconds.textContent = pad(secs);

    // Hours:minutes only when minute changes
    if (mins !== prevMin) {
      prevMin = mins;
      DOM.clockTime.textContent = pad(hrs) + ':' + pad(mins);
      DOM.clockDate.textContent =
        DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
    }
  }

  function init() {
    tick(); // immediate render, no blank flash
    setInterval(tick, 1000);
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Weather
═══════════════════════════════════════════════════════════ */
const Weather = (() => {
  const cfg = CONFIG.weather;

  function unitSymbol() {
    return cfg.units === 'imperial' ? '°F' : '°C';
  }

  function fmt(temp) {
    return Math.round(temp) + unitSymbol();
  }

  function showError() {
    DOM.weatherError.classList.remove('hidden');
    DOM.weatherForecast.innerHTML = '';
  }

  function renderCurrent(data) {
    const { weather, main } = data;
    const condition = weather[0];
    DOM.weatherIcon.textContent = getWeatherIcon(condition.id);
    DOM.weatherTemp.textContent = fmt(main.temp);
    DOM.weatherDesc.textContent = condition.description;
    DOM.weatherHiLo.textContent = 'H: ' + fmt(main.temp_max) + '  ·  L: ' + fmt(main.temp_min);
    DOM.weatherError.classList.add('hidden');
  }

  function renderForecast(forecastData) {
    // The 5-day/3-hour forecast: pick one reading per day (noon preferred)
    const dayMap = {};
    const today  = new Date().getDate();

    forecastData.list.forEach(entry => {
      const d    = new Date(entry.dt * 1000);
      const key  = d.toDateString();
      const hour = d.getHours();

      // Skip today
      if (d.getDate() === today) return;

      // Prefer the noon reading, otherwise take the first available
      if (!dayMap[key] || (hour === 12)) {
        dayMap[key] = entry;
      }
    });

    const days  = Object.values(dayMap).slice(0, 4);
    const SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    DOM.weatherForecast.innerHTML = '';

    // Build all nodes in a fragment — one DOM insertion
    const frag = document.createDocumentFragment();

    days.forEach(entry => {
      const d    = new Date(entry.dt * 1000);
      const icon = getWeatherIcon(entry.weather[0].id);

      const card  = document.createElement('div');
      card.className = 'forecast-day';
      card.innerHTML =
        '<span class="forecast-day-name">' + SHORT[d.getDay()] + '</span>' +
        '<span class="forecast-icon">'    + icon                    + '</span>' +
        '<span class="forecast-high">'    + fmt(entry.main.temp_max)+ '</span>' +
        '<span class="forecast-low">'     + fmt(entry.main.temp_min)+ '</span>';

      frag.appendChild(card);
    });

    DOM.weatherForecast.appendChild(frag);
  }

  async function fetchWeather() {
    const { apiKey, latitude, longitude, units } = cfg;

    if (!apiKey || apiKey === 'YOUR_OPENWEATHER_API_KEY') {
      DOM.weatherDesc.textContent = 'Add API key in config';
      return;
    }

    try {
      const [currentRes, forecastRes] = await Promise.all([
        fetch(
          'https://api.openweathermap.org/data/2.5/weather' +
          '?lat=' + latitude +
          '&lon=' + longitude +
          '&units=' + units +
          '&appid=' + apiKey
        ),
        fetch(
          'https://api.openweathermap.org/data/2.5/forecast' +
          '?lat=' + latitude +
          '&lon=' + longitude +
          '&units=' + units +
          '&appid=' + apiKey
        ),
      ]);

      if (!currentRes.ok || !forecastRes.ok) {
        throw new Error('HTTP ' + currentRes.status);
      }

      const [currentData, forecastData] = await Promise.all([
        currentRes.json(),
        forecastRes.json(),
      ]);

      renderCurrent(currentData);
      renderForecast(forecastData);

    } catch (err) {
      console.warn('[Weather] fetch failed:', err.message);
      showError();
    }
  }

  function init() {
    fetchWeather();
    setInterval(fetchWeather, cfg.updateIntervalMs);
  }

  return { init };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: ShoppingList
   Source of truth: localStorage (key "shl_v1").
   On first ever load (empty storage) it seeds from Google Sheets.
   Supports: add item, long-press → select, delete selected, clear all.
═══════════════════════════════════════════════════════════ */
const ShoppingList = (() => {
  const cfg = CONFIG.sheets;

  let items    = [];        // [{ id: string, text: string }, ...]
  let selected = new Set(); // IDs of currently selected items
  let inSel    = false;     // whether selection mode is active

  // ─── Item operations ────────────────────────────────────

  function addItem(text) {
    const t = text.trim();
    if (!t) return;
    items.unshift({ id: uid(), text: t });
    Storage.save(items);
    render();
  }

  function removeSelected() {
    items = items.filter(item => !selected.has(item.id));
    Storage.save(items);
    exitSelectionMode(); // also calls render()
  }

  function clearAll() {
    items = [];
    Storage.save(items);
    exitSelectionMode(); // also calls render()
  }

  // ─── Selection mode ─────────────────────────────────────

  function enterSelectionMode(firstId) {
    inSel = true;
    selected.clear();
    selected.add(firstId);
    // Show selection bar, hide countdown bar
    DOM.selectionBar.classList.remove('hidden');
    DOM.returnBar.classList.add('hidden');
    render();
    updateSelBar();
  }

  function exitSelectionMode() {
    inSel = false;
    selected.clear();
    DOM.selectionBar.classList.add('hidden');
    DOM.returnBar.classList.remove('hidden');
    render();
  }

  function toggleSelect(id) {
    if (selected.has(id)) { selected.delete(id); }
    else                  { selected.add(id);    }
    // Update just this one card — avoids full re-render during selection
    const card = DOM.shoppingList.querySelector('[data-id="' + id + '"]');
    if (card) card.classList.toggle('selected', selected.has(id));
    updateSelBar();
  }

  function updateSelBar() {
    const n = selected.size;
    DOM.selCount.textContent   = n + ' selected';
    DOM.btnDeleteSel.textContent = n > 0 ? 'Delete (' + n + ')' : 'Delete';
    DOM.btnDeleteSel.disabled  = (n === 0);
  }

  // ─── Long press detection ────────────────────────────────

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

  // ─── Rendering ──────────────────────────────────────────

  function render() {
    DOM.shoppingError.classList.add('hidden');

    if (items.length === 0) {
      DOM.shoppingList.innerHTML = '';
      DOM.shoppingEmpty.classList.remove('hidden');
      DOM.shoppingMeta.textContent = 'List is empty';
      return;
    }

    DOM.shoppingEmpty.classList.add('hidden');
    DOM.shoppingMeta.textContent =
      items.length + ' item' + (items.length !== 1 ? 's' : '');

    const frag = document.createDocumentFragment();

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'card' + (selected.has(item.id) ? ' selected' : '');
      card.dataset.id = item.id;
      // Stagger entrance animation only on fresh renders, not selection toggles
      card.style.animationDelay = inSel ? '0ms' : Math.min(idx * 30, 270) + 'ms';

      const bullet = document.createElement('div');
      bullet.className = 'card-bullet';

      const text = document.createElement('div');
      text.className   = 'card-text';
      text.textContent = item.text;   // textContent — XSS safe

      const check = document.createElement('div');
      check.className   = 'card-check';
      check.textContent = '✓';

      card.appendChild(bullet);
      card.appendChild(text);
      card.appendChild(check);

      // Long press → enter selection (only when not already in selection mode)
      addLongPress(card, () => {
        if (!inSel) enterSelectionMode(item.id);
      });

      // Tap → toggle if already selecting
      card.addEventListener('click', () => {
        if (inSel) toggleSelect(item.id);
      });

      frag.appendChild(card);
    });

    DOM.shoppingList.innerHTML = '';
    DOM.shoppingList.appendChild(frag);
  }

  // ─── Add form ───────────────────────────────────────────

  function showAddForm() {
    DOM.addForm.classList.remove('hidden');
    DOM.btnAdd.style.visibility = 'hidden';
    DOM.addInput.value = '';
    setTimeout(() => DOM.addInput.focus(), 60); // let animation finish first
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

  // ─── Google Sheets seed (first load only) ───────────────

  function parseCsv(raw) {
    const lines = raw.split('\n');
    const out   = [];
    for (let i = 1; i < lines.length; i++) {
      const cell = lines[i].replace(/^"(.*)"$/, '$1').trim();
      if (cell) out.push({ id: uid(), text: cell });
    }
    return out;
  }

  async function seedFromSheets() {
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
      const csv = await res.text();
      items = parseCsv(csv);
      Storage.save(items);
      render();
    } catch (err) {
      console.warn('[ShoppingList] seed failed:', err.message);
      DOM.shoppingError.classList.remove('hidden');
      DOM.shoppingErrTxt.textContent = 'Check sharing settings or Spreadsheet ID';
      DOM.shoppingMeta.textContent   = 'Failed to load';
    }
  }

  // ─── Init ───────────────────────────────────────────────

  function init() {
    // Use localStorage if it has data; otherwise pull from Google Sheets
    const stored = Storage.load();
    if (stored && Array.isArray(stored) && stored.length > 0) {
      // Migrate old format (plain strings → objects) if needed
      items = stored.map(item =>
        typeof item === 'string' ? { id: uid(), text: item } : item
      );
      render();
    } else {
      seedFromSheets();
    }

    // Add form
    DOM.btnAdd.addEventListener('click', e => { e.stopPropagation(); showAddForm(); });
    DOM.btnAddConfirm.addEventListener('click', e => { e.stopPropagation(); confirmAdd(); });
    DOM.btnAddCancel.addEventListener('click',  e => { e.stopPropagation(); hideAddForm(); });
    DOM.addInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmAdd(); }
      if (e.key === 'Escape') { hideAddForm(); }
    });

    // Selection bar
    DOM.btnCancelSel.addEventListener('click', e => { e.stopPropagation(); exitSelectionMode(); });
    DOM.btnDeleteSel.addEventListener('click', e => { e.stopPropagation(); removeSelected(); });
    DOM.btnClearAll.addEventListener('click', e => {
      e.stopPropagation();
      // Two-tap confirmation: tap once → "Sure?", tap again → clear
      if (DOM.btnClearAll.dataset.confirm === '1') {
        clearAll();
      } else {
        DOM.btnClearAll.dataset.confirm = '1';
        DOM.btnClearAll.textContent = 'Sure?';
        setTimeout(() => {
          if (DOM.btnClearAll.dataset.confirm === '1') {
            DOM.btnClearAll.dataset.confirm = '0';
            DOM.btnClearAll.textContent = 'Clear All';
          }
        }, 2500);
      }
    });
  }

  return { init, exitSelectionMode };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Modes
   Manages SCREENSAVER ↔ SHOPPING transitions
═══════════════════════════════════════════════════════════ */
const Modes = (() => {
  let current = 'screensaver';   // 'screensaver' | 'shopping'

  function activateScreensaver() {
    if (current === 'screensaver') return;
    current = 'screensaver';
    DOM.shopping.classList.remove('active');
    DOM.screensaver.classList.add('active');
    Inactivity.stopCountdown();
    ShoppingList.exitSelectionMode(); // clean up any in-progress selection
  }

  function initButton() {
    DOM.btnScreensaver.addEventListener('click', function (e) {
      e.stopPropagation(); // don't let the click bubble and immediately re-open shopping
      activateScreensaver();
    });
  }

  function activateShopping() {
    if (current === 'shopping') return;
    current = 'shopping';
    DOM.screensaver.classList.remove('active');
    DOM.shopping.classList.add('active');
    DOM.shoppingList.scrollTop = 0;
    // Hide tap hint permanently after first interaction
    DOM.tapHint.classList.add('hidden');
  }

  function toggle() {
    if (current === 'screensaver') {
      activateShopping();
    }
    // Tapping shopping mode just resets inactivity timer (handled by Inactivity)
  }

  function getCurrent() { return current; }

  return { activateScreensaver, activateShopping, toggle, getCurrent, initButton };
})();

/* ═══════════════════════════════════════════════════════════
   MODULE: Inactivity
   Detects user interaction and drives mode switching.
   Also manages the countdown bar in shopping mode.
═══════════════════════════════════════════════════════════ */
const Inactivity = (() => {
  const TIMEOUT_MS = CONFIG.inactivitySeconds * 1000;
  let   timer      = null;
  let   barTimer   = null;
  let   barStart   = 0;

  // Animate the return bar using rAF for smoothness
  function animateBar() {
    const elapsed  = Date.now() - barStart;
    const fraction = Math.max(0, 1 - elapsed / TIMEOUT_MS);
    DOM.returnBarFill.style.transform = 'scaleX(' + fraction + ')';

    if (fraction > 0) {
      barTimer = requestAnimationFrame(animateBar);
    }
  }

  function startCountdown() {
    if (Modes.getCurrent() !== 'shopping') return;
    barStart = Date.now();
    if (barTimer) cancelAnimationFrame(barTimer);
    barTimer = requestAnimationFrame(animateBar);
  }

  function stopCountdown() {
    if (barTimer) {
      cancelAnimationFrame(barTimer);
      barTimer = null;
    }
    DOM.returnBarFill.style.transform = 'scaleX(1)';
  }

  function reset() {
    clearTimeout(timer);

    if (Modes.getCurrent() === 'shopping') {
      startCountdown();
    }

    timer = setTimeout(() => {
      Modes.activateScreensaver();
    }, TIMEOUT_MS);
  }

  function init() {
    const EVENTS = ['touchstart', 'touchmove', 'mousedown', 'mousemove', 'click', 'keydown', 'scroll'];

    EVENTS.forEach(evt => {
      document.addEventListener(evt, () => {
        // First interaction on screensaver: switch modes
        if (Modes.getCurrent() === 'screensaver') {
          Modes.activateShopping();
        }
        reset();
      }, { passive: true });
    });

    reset(); // start the initial timer
  }

  return { init, stopCountdown };
})();

/* ═══════════════════════════════════════════════════════════
   BOOT — initialise all modules
═══════════════════════════════════════════════════════════ */
(function boot() {
  Clock.init();
  Weather.init();
  ShoppingList.init();
  Inactivity.init();
  Modes.initButton();
})();
