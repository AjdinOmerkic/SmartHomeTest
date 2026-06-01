/**
 * Smart Home Dashboard — app.js
 *
 * Architecture:
 *   Config       — all user-editable values in one place
 *   Clock        — updates time/date every second
 *   Weather      — fetches OpenWeatherMap, updates every 10 min
 *   ShoppingList — fetches Google Sheets, updates every 5 min
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
    apiKey:    'YOUR_OPENWEATHER_API_KEY',
    latitude:  '40.7128',    // replace with your latitude  (e.g. 51.5074 for London)
    longitude: '-74.0060',   // replace with your longitude (e.g. -0.1278 for London)
    units:     'metric',     // 'metric' (°C) | 'imperial' (°F)
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
   DOM REFERENCES — cached once at startup
═══════════════════════════════════════════════════════════ */
const DOM = {
  screensaver:     document.getElementById('screensaver'),
  shopping:        document.getElementById('shopping'),
  clockTime:       document.getElementById('clock-time'),
  clockSeconds:    document.getElementById('clock-seconds'),
  clockDate:       document.getElementById('clock-date'),
  weatherIcon:     document.getElementById('weather-icon'),
  weatherTemp:     document.getElementById('weather-temp'),
  weatherDesc:     document.getElementById('weather-desc'),
  weatherHiLo:     document.getElementById('weather-hilo'),
  weatherForecast: document.getElementById('weather-forecast'),
  weatherError:    document.getElementById('weather-error'),
  tapHint:         document.getElementById('tap-hint'),
  shoppingList:    document.getElementById('shopping-list'),
  shoppingMeta:    document.getElementById('shopping-meta'),
  shoppingEmpty:   document.getElementById('shopping-empty'),
  shoppingError:   document.getElementById('shopping-error'),
  shoppingErrTxt:  document.getElementById('shopping-error-text'),
  returnBarFill:   document.getElementById('return-bar-fill'),
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
   Uses the Google Sheets CSV export — no API key required.
   The sheet must be either:
     • Published to web  (File → Share → Publish to web → CSV), OR
     • Shared as "Anyone with the link can view"
═══════════════════════════════════════════════════════════ */
const ShoppingList = (() => {
  const cfg      = CONFIG.sheets;
  let   lastHash = '';   // avoid re-rendering identical lists

  // djb2 hash — fast, no crypto needed
  function simpleHash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = (h * 33) ^ str.charCodeAt(i);
    }
    return h >>> 0;
  }

  // Parse a raw CSV string into an array of non-empty strings.
  // Handles quoted fields and strips the header row.
  function parseCsv(raw) {
    const lines = raw.split('\n');
    const items = [];
    // Skip row 0 (the "Item" header)
    for (let i = 1; i < lines.length; i++) {
      // Strip surrounding quotes and whitespace
      const cell = lines[i].replace(/^"(.*)"$/, '$1').trim();
      if (cell) items.push(cell);
    }
    return items;
  }

  function showError(msg) {
    DOM.shoppingError.classList.remove('hidden');
    DOM.shoppingErrTxt.textContent = msg || 'Could not load list';
    DOM.shoppingList.innerHTML = '';
    DOM.shoppingEmpty.classList.add('hidden');
    DOM.shoppingMeta.textContent = 'Failed to load';
  }

  function render(items) {
    const hash = '' + simpleHash(items.join('|'));
    if (hash === lastHash) return;   // data unchanged, skip re-render
    lastHash = hash;

    if (items.length === 0) {
      DOM.shoppingList.innerHTML = '';
      DOM.shoppingEmpty.classList.remove('hidden');
      DOM.shoppingError.classList.add('hidden');
      DOM.shoppingMeta.textContent = 'List is empty';
      return;
    }

    DOM.shoppingEmpty.classList.add('hidden');
    DOM.shoppingError.classList.add('hidden');
    DOM.shoppingMeta.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

    // Build all card nodes in a DocumentFragment — one DOM insertion
    const frag = document.createDocumentFragment();

    items.forEach(name => {
      const card   = document.createElement('div');
      card.className = 'card';

      const bullet = document.createElement('div');
      bullet.className = 'card-bullet';

      const text   = document.createElement('div');
      text.className = 'card-text';
      text.textContent = name;   // textContent is XSS-safe

      card.appendChild(bullet);
      card.appendChild(text);
      frag.appendChild(card);
    });

    DOM.shoppingList.innerHTML = '';
    DOM.shoppingList.appendChild(frag);
  }

  async function fetchList() {
    const { spreadsheetId, sheetName } = cfg;

    if (!spreadsheetId || spreadsheetId === 'YOUR_SPREADSHEET_ID') {
      showError('Add Spreadsheet ID in config');
      return;
    }

    try {
      // gviz/tq endpoint: works with public sheets and "anyone with link" shares.
      // Returns CSV with no auth required.
      const url =
        'https://docs.google.com/spreadsheets/d/' +
        spreadsheetId +
        '/gviz/tq?tqx=out:csv&sheet=' +
        encodeURIComponent(sheetName);

      const res = await fetch(url);

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const csv   = await res.text();
      const items = parseCsv(csv);
      render(items);

    } catch (err) {
      console.warn('[ShoppingList] fetch failed:', err.message);
      showError('Check sharing settings or Spreadsheet ID');
    }
  }

  function init() {
    fetchList();
    setInterval(fetchList, CONFIG.shopping.updateIntervalMs);
  }

  // Exposed so Modes can trigger a fresh load when switching to shopping view
  return { init, refresh: fetchList };
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
  }

  function activateShopping() {
    if (current === 'shopping') return;
    current = 'shopping';
    DOM.screensaver.classList.remove('active');
    DOM.shopping.classList.add('active');
    DOM.shoppingList.scrollTop = 0;
    ShoppingList.refresh();
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

  return { activateScreensaver, activateShopping, toggle, getCurrent };
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
})();
