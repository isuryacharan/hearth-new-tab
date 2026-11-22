'use strict';

/* Weather widget using Open-Meteo (free, no API key): https://open-meteo.com */
(() => {
  const store = window.appStore;
  const CACHE_MS = 30 * 60 * 1000;

  const els = {
    body: document.getElementById('weather-body'),
    unit: document.getElementById('weather-unit'),
    settingsBtn: document.getElementById('weather-settings'),
    form: document.getElementById('weather-form'),
    city: document.getElementById('weather-city'),
    results: document.getElementById('weather-results'),
  };

  // WMO weather codes -> [description, day emoji, night emoji]
  const CODES = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Heavy drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Rain showers', '🌦️', '🌧️'],
    81: ['Rain showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm, hail', '⛈️', '⛈️'],
    99: ['Thunderstorm, hail', '⛈️', '⛈️'],
  };
  const codeInfo = (code, isDay = 1) => {
    const [desc, day, night] = CODES[code] || ['Unknown', '🌡️', '🌡️'];
    return { desc, emoji: isDay ? day : night };
  };

  // settings: { unit: 'c' | 'f', place: { lat, lon, name } | null }  (null = no city chosen yet)
  let settings = { unit: defaultUnit(), place: null };

  function defaultUnit() {
    return /^en-(US|LR|MM)|^my\b/i.test(navigator.language || '') ? 'f' : 'c';
  }

  /* ---------- fetching ---------- */

  async function fetchWeather(place) {
    const params = new URLSearchParams({
      latitude: place.lat,
      longitude: place.lon,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: 5,
      temperature_unit: settings.unit === 'f' ? 'fahrenheit' : 'celsius',
      wind_speed_unit: settings.unit === 'f' ? 'mph' : 'kmh',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function load({ force = false } = {}) {
    const place = settings.place;
    if (!place) {
      showError('Choose a city to see the weather.');
      openForm({ focus: false });
      return;
    }

    const cache = await store.get('weatherCache', null);
    const cacheMatches = cache && cache.unit === settings.unit &&
      cache.place.lat === place.lat && cache.place.lon === place.lon;

    if (cacheMatches) render(cache.data, cache.place);
    if (cacheMatches && !force && Date.now() - cache.at < CACHE_MS) return;

    try {
      const data = await fetchWeather(place);
      await store.set('weatherCache', { at: Date.now(), unit: settings.unit, place, data });
      render(data, place);
    } catch {
      if (!cacheMatches) showError('Couldn’t load the weather. Check your connection.');
    }
  }

  /* ---------- rendering ---------- */

  function render(data, place) {
    const c = data.current;
    const now = codeInfo(c.weather_code, c.is_day);
    const d = data.daily;
    const deg = '°';
    const wind = settings.unit === 'f' ? 'mph' : 'km/h';

    const days = d.time.map((t, i) => {
      const [y, m, day] = t.split('-').map(Number);
      const label = i === 0 ? 'Today' : new Date(y, m - 1, day).toLocaleDateString([], { weekday: 'short' });
      const info = codeInfo(d.weather_code[i]);
      return `<div title="${info.desc}">
          <div class="day">${label}</div>
          <div class="em">${info.emoji}</div>
          <div>${Math.round(d.temperature_2m_max[i])}${deg} <span class="lo">${Math.round(d.temperature_2m_min[i])}${deg}</span></div>
        </div>`;
    }).join('');

    els.body.innerHTML = `
      <div class="weather-now">
        <div class="weather-emoji" aria-hidden="true">${now.emoji}</div>
        <div>
          <div class="weather-temp">${Math.round(c.temperature_2m)}${deg}</div>
        </div>
        <div>
          <div class="weather-desc">${now.desc}</div>
          <div class="weather-place"></div>
        </div>
      </div>
      <div class="weather-meta">
        <span>Feels ${Math.round(c.apparent_temperature)}${deg}</span>
        <span>Humidity ${Math.round(c.relative_humidity_2m)}%</span>
        <span>Wind ${Math.round(c.wind_speed_10m)} ${wind}</span>
      </div>
      <div class="weather-days">${days}</div>`;
    // place name comes from user input / geocoding, so set it as text
    els.body.querySelector('.weather-place').textContent = place.name;
    window.Dock?.setStatus('weather', {
      emoji: now.emoji,
      text: `${Math.round(c.temperature_2m)}°`,
      title: `${now.desc}, ${place.name} · ${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°`,
    });
  }

  function showError(msg) {
    const p = document.createElement('p');
    p.className = 'weather-error';
    p.textContent = msg;
    els.body.replaceChildren(p);
    window.Dock?.setStatus('weather', { title: msg });
  }

  function renderUnit() {
    els.unit.textContent = settings.unit === 'f' ? '°F' : '°C';
  }

  /* ---------- location form ---------- */

  function openForm({ focus = true } = {}) {
    els.form.hidden = false;
    els.settingsBtn.setAttribute('aria-expanded', 'true');
    if (focus) els.city.focus();
  }
  function closeForm() {
    if (!settings.place) return; // keep the search open until a city is chosen
    els.form.hidden = true;
    els.settingsBtn.setAttribute('aria-expanded', 'false');
    els.city.value = '';
    els.results.replaceChildren();
  }

  let searchTimer = null;
  let searchSeq = 0;
  els.city.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = els.city.value.trim();
    if (q.length < 2) { els.results.replaceChildren(); return; }
    searchTimer = setTimeout(() => searchCity(q), 300);
  });
  els.city.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = els.results.querySelector('button');
      if (first) first.click();
    }
    if (e.key === 'Escape') closeForm();
  });

  async function searchCity(q) {
    const seq = ++searchSeq;
    let results = [];
    try {
      const params = new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' });
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      results = (await res.json()).results || [];
    } catch { /* show "no results" */ }
    if (seq !== searchSeq) return; // a newer search is in flight

    if (!results.length) {
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'No matching places.';
      const li = document.createElement('li');
      li.append(span);
      els.results.replaceChildren(li);
      return;
    }
    els.results.replaceChildren(...results.map(r => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      btn.addEventListener('click', () => choosePlace({
        lat: +r.latitude.toFixed(3),
        lon: +r.longitude.toFixed(3),
        name: [r.name, r.country_code].filter(Boolean).join(', '),
      }));
      li.append(btn);
      return li;
    }));
  }

  async function choosePlace(place) {
    settings.place = place;
    await store.set('weatherSettings', settings);
    closeForm();
    els.body.innerHTML = '<p class="muted">Loading weather…</p>';
    load({ force: true });
  }

  els.settingsBtn.addEventListener('click', () => (els.form.hidden ? openForm() : closeForm()));
  els.unit.addEventListener('click', async () => {
    settings.unit = settings.unit === 'f' ? 'c' : 'f';
    renderUnit();
    await store.set('weatherSettings', settings);
    load({ force: true });
  });

  /* ---------- start ---------- */

  (async () => {
    settings = { ...settings, ...(await store.get('weatherSettings', {})) };
    renderUnit();
    load();
    setInterval(() => load(), CACHE_MS);
  })();
})();
