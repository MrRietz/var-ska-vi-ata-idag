/* Var ska vi äta idag? — helt statisk app mot OpenStreetMap. */

'use strict';

/* ---------- Konstanter ---------- */

// Flera speglar; vi failar över om en är överbelastad.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Startvy innan vi vet var användaren är. Ingen data hämtas här —
// kartan behöver bara något att rita medan positionen efterfrågas.
const INITIAL_VIEW = { lat: 55.6050, lon: 13.0038, zoom: 13 };

const STORE = {
  favs: 'vsvai:favs',
  recent: 'vsvai:recent',
  theme: 'vsvai:theme',
};

const CUISINE_LABELS = {
  pizza: 'Pizza', italian: 'Italienskt', sushi: 'Sushi', japanese: 'Japanskt',
  chinese: 'Kinesiskt', thai: 'Thai', vietnamese: 'Vietnamesiskt', indian: 'Indiskt',
  kebab: 'Kebab', burger: 'Burgare', greek: 'Grekiskt', mexican: 'Mexikanskt',
  american: 'Amerikanskt', french: 'Franskt', spanish: 'Spanskt', turkish: 'Turkiskt',
  lebanese: 'Libanesiskt', korean: 'Koreanskt', ramen: 'Ramen', asian: 'Asiatiskt',
  swedish: 'Husmanskost', regional: 'Lokalt', international: 'Blandat',
  vegetarian: 'Vegetariskt', vegan: 'Veganskt', seafood: 'Fisk & skaldjur',
  steak_house: 'Steakhouse', barbecue: 'BBQ', sandwich: 'Smörgås', salad: 'Sallad',
  soup: 'Soppa', poke: 'Poké', falafel: 'Falafel', tapas: 'Tapas',
  buffet: 'Buffé',
};

// Snabbmatskedjor vi inte vill ha bland lunchförslagen. Matchas mot namn
// och OSM:s brand-tagg, skiftlägesokänsligt. amenity=fast_food duger inte
// som filter — där ligger även falafel- och pokéställen vi gärna behåller.
const CHAIN_BLOCKLIST = [
  'mcdonald', 'burger king', 'subway', 'max hamburgare', 'max burgers',
  'kfc', 'taco bell', 'domino', 'pizza hut', 'sibylla', 'frasses',
  'espresso house', 'wayne', 'starbucks', "o'learys", 'onkel kå',
  'pressbyrån', '7-eleven', 'burgerking', 'texas longhorn',
];

// Hemsidor vi slagit upp för hand där OSM saknar website-taggen.
// Nyckel = OSM-id, så en namnändring i kartan inte ger fel länk.
// Bidra gärna tillbaka: lägg in dem som website= i OSM också.
const EXTRA_WEBSITES = {
  'node/5834378328': 'https://thapthim.se/',            // Thap Thim
  'node/1343176255': 'https://www.laziza.se/',          // Laziza
  'node/1677337185': 'https://fiskybusiness.nu/',       // Fisky Business Dockan
  'node/11070918305': 'https://misswang.se/',           // Miss Wang
  'node/4234162768': 'https://www.curryrepublik.se/',   // Curry Republik
  'node/12200997100': 'https://www.tamnackthai.se/',    // Tamnack Thai
};

// Stängda enligt uppslag, men fortfarande kvar i OSM. Vi vill inte
// skicka någon till en nedlagd krog på lunchen.
const CLOSED = new Set([
  'node/772486928',    // Torso Twisted — stängde 2011, lokalen är nu The Torso
  'node/2718559019',   // Zen Thai — permanent stängd
]);

function isBlockedChain(tags, name) {
  const hay = `${name} ${tags.brand || ''} ${tags.operator || ''}`.toLowerCase();
  return CHAIN_BLOCKLIST.some((c) => hay.includes(c));
}

/* ---------- Tillstånd ---------- */

const state = {
  center: null,
  places: [],      // allt vi hämtat
  visible: [],     // efter filter + sortering
  favs: loadJSON(STORE.favs, []),
  recent: loadJSON(STORE.recent, []),   // [{id, date}]
  activeId: null,
  map: null,
  markers: new Map(),
  layer: null,
  meLayer: null,
  fetchToken: 0,
  tournament: null,
};

/* ---------- DOM ---------- */

const $ = (sel) => document.querySelector(sel);

const el = {
  form: $('#search-form'),
  place: $('#place-input'),
  locate: $('#locate-btn'),
  area: $('#area'),
  radiusField: $('#radius-field'),
  radius: $('#radius'),
  radiusOut: $('#radius-out'),
  cuisine: $('#cuisine'),
  openNow: $('#open-now'),
  onlyFavs: $('#only-favs'),
  noRepeat: $('#no-repeat'),
  roll: $('#roll-btn'),
  tourney: $('#tourney-btn'),
  winner: $('#winner'),
  list: $('#list'),
  count: $('#results-count'),
  sort: $('#sort'),
  empty: $('#empty'),
  status: $('#status'),
  theme: $('#theme-toggle'),
  modal: $('#modal'),
  modalBody: $('#modal-body'),
  modalClose: $('#modal-close'),
};

/* ---------- Småhjälpare ---------- */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* privat läge – strunt samma */ }
}

let statusTimer;
function status(msg, sticky) {
  clearTimeout(statusTimer);
  if (!msg) { el.status.hidden = true; return; }
  el.status.textContent = msg;
  el.status.hidden = false;
  if (!sticky) statusTimer = setTimeout(() => { el.status.hidden = true; }, 3200);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Haversine, meter.
function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function cuisineLabel(key) {
  return CUISINE_LABELS[key] || key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/* ---------- Öppettider ----------
   Tolkar vanliga opening_hours-mönster. OSM tillåter mer än vi klarar,
   så vid osäkerhet returnerar vi null = "vet ej" istället för att gissa. */

const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isOpenNow(spec, now = new Date()) {
  if (!spec) return null;
  const s = spec.trim();
  if (/24\/7/i.test(s)) return true;
  // Villkor vi inte tolkar säkert: veckonummer, datumintervall, "off"-undantag.
  if (/PH|week\s|\b\d{4}\b|easter/i.test(s)) return null;

  const dayIdx = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  let known = false;

  for (const rule of s.split(';')) {
    const part = rule.trim();
    if (!part) continue;

    const m = part.match(/^((?:[A-Za-z]{2}(?:\s*-\s*[A-Za-z]{2})?\s*,?\s*)*)(.*)$/);
    if (!m) continue;

    const daySpec = m[1].trim();
    const timeSpec = m[2].trim();

    if (/^off$/i.test(timeSpec)) {
      if (!daySpec || matchesDay(daySpec, dayIdx)) known = true;
      continue;
    }
    if (!/\d/.test(timeSpec)) continue;
    if (daySpec && !matchesDay(daySpec, dayIdx)) continue;

    known = true;
    for (const span of timeSpec.split(',')) {
      const t = span.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (!t) continue;
      const from = (+t[1]) * 60 + (+t[2]);
      let to = (+t[3]) * 60 + (+t[4]);
      if (to <= from) to += 24 * 60;           // över midnatt
      if (minutes >= from && minutes < to) return true;
      if (minutes + 24 * 60 >= from && minutes + 24 * 60 < to) return true;
    }
  }
  return known ? false : null;
}

function matchesDay(daySpec, dayIdx) {
  for (const chunk of daySpec.split(',')) {
    const c = chunk.trim();
    if (!c) continue;
    const range = c.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
    if (range) {
      const a = DAY_KEYS.indexOf(normDay(range[1]));
      const b = DAY_KEYS.indexOf(normDay(range[2]));
      if (a < 0 || b < 0) continue;
      if (a <= b ? (dayIdx >= a && dayIdx <= b) : (dayIdx >= a || dayIdx <= b)) return true;
    } else {
      if (DAY_KEYS.indexOf(normDay(c)) === dayIdx) return true;
    }
  }
  return false;
}

function normDay(d) {
  return d.charAt(0).toUpperCase() + d.charAt(1).toLowerCase();
}

/* ---------- Datahämtning ---------- */

const AMENITIES = '^(restaurant|fast_food)$';

// Stadsdelssökning. En radie kring kontoret missar Bo01 och Universitets-
// holmen i ändarna av Västra Hamnen, så vi frågar hellre efter hela
// stadsdelen. Overpass area-id = 3600000000 + relationens id.
function buildAreaQuery(relationId) {
  return `[out:json][timeout:30];
area(${3600000000 + relationId})->.a;
(
  node["amenity"~"${AMENITIES}"](area.a);
  way["amenity"~"${AMENITIES}"](area.a);
);
out center tags 300;`;
}

function buildRadiusQuery(lat, lon, radius) {
  return `[out:json][timeout:25];
(
  node["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
  way["amenity"~"${AMENITIES}"](around:${radius},${lat},${lon});
);
out center tags 200;`;
}

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;   // prova nästa spegel
    }
  }
  throw lastErr || new Error('Overpass svarade inte');
}

function normalize(elements, center) {
  const seen = new Set();
  const out = [];

  for (const e of elements) {
    const t = e.tags || {};
    const name = t.name || t['name:sv'];
    if (!name) continue;                       // namnlösa hjälper ingen
    if (isBlockedChain(t, name)) continue;     // snabbmatskedjor

    const osmId = `${e.type}/${e.id}`;
    if (CLOSED.has(osmId)) continue;           // nedlagda

    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;

    const key = `${name.toLowerCase()}@${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cuisines = (t.cuisine || '')
      .split(';').map((c) => c.trim().toLowerCase()).filter(Boolean);

    out.push({
      id: osmId,
      name,
      lat, lon,
      amenity: t.amenity,
      cuisines,
      openingHours: t.opening_hours || '',
      website: t.website || t['contact:website'] || t.url || EXTRA_WEBSITES[osmId] || '',
      menu: t['menu'] || t['website:menu'] || t['contact:menu'] || '',
      phone: t.phone || t['contact:phone'] || '',
      street: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
      takeaway: t.takeaway,
      outdoor: t.outdoor_seating === 'yes',
      vegetarian: t['diet:vegetarian'],
      vegan: t['diet:vegan'],
      wheelchair: t.wheelchair,
      dist: distanceM(center, { lat, lon }),
    });
  }
  return out;
}

async function loadPlaces() {
  const token = ++state.fetchToken;
  const radius = +el.radius.value;

  el.roll.disabled = true;
  status('Hämtar ställen i närheten…', true);
  el.list.innerHTML = renderSkeleton();

  try {
    const mode = el.area.value;
    const query = mode.startsWith('suburb:')
      ? buildAreaQuery(+mode.slice(7))
      : buildRadiusQuery(state.center.lat, state.center.lon, radius);
    const data = await overpass(query);
    if (token !== state.fetchToken) return;    // ett nyare anrop har hunnit före

    state.places = normalize(data.elements || [], state.center);
    populateCuisines();
    applyFilters();
    status(state.places.length
      ? `${state.places.length} ställen hittade`
      : 'Inga ställen hittades — prova större radie');
  } catch (err) {
    if (token !== state.fetchToken) return;
    console.error(err);
    state.places = [];
    applyFilters();
    status('Kunde inte hämta data just nu. Overpass kan vara överbelastad — försök igen om en stund.');
  } finally {
    if (token === state.fetchToken) el.roll.disabled = false;
  }
}

async function geocode(q) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length) return null;
  return {
    lat: parseFloat(rows[0].lat),
    lon: parseFloat(rows[0].lon),
    label: rows[0].display_name.split(',').slice(0, 2).join(',').trim(),
  };
}

/* ---------- Filter & sortering ---------- */

function populateCuisines() {
  const counts = new Map();
  for (const p of state.places) {
    for (const c of p.cuisines) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const sorted = [...counts.entries()]
    .filter(([, n]) => n >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const prev = el.cuisine.value;
  el.cuisine.innerHTML = '<option value="">Alla kök</option>' + sorted
    .map(([c, n]) => `<option value="${escapeHtml(c)}">${escapeHtml(cuisineLabel(c))} (${n})</option>`)
    .join('');
  if (sorted.some(([c]) => c === prev)) el.cuisine.value = prev;
}

function recentIds(days = 5) {
  const cutoff = Date.now() - days * 864e5;
  return new Set(state.recent
    .filter((r) => new Date(r.date).getTime() >= cutoff)
    .map((r) => r.id));
}

function applyFilters() {
  const cuisine = el.cuisine.value;
  const wantOpen = el.openNow.checked;
  const wantFav = el.onlyFavs.checked;
  const noRepeat = el.noRepeat.checked;
  const recent = noRepeat ? recentIds() : null;

  let rows = state.places.filter((p) => {
    if (cuisine && !p.cuisines.includes(cuisine)) return false;
    if (wantFav && !state.favs.includes(p.id)) return false;
    if (wantOpen && isOpenNow(p.openingHours) === false) return false;
    if (noRepeat && recent.has(p.id)) return false;
    return true;
  });

  rows.sort(el.sort.value === 'name'
    ? (a, b) => a.name.localeCompare(b.name, 'sv')
    : (a, b) => a.dist - b.dist);

  state.visible = rows;
  renderList();
  renderMarkers();
}

/* ---------- Rendering ---------- */

function renderSkeleton() {
  return Array.from({ length: 5 }, () =>
    '<li class="card skeleton"><div class="card-body"><div class="sk-line"></div><div class="sk-line short"></div></div></li>'
  ).join('');
}

function badges(p) {
  const out = [];
  const open = isOpenNow(p.openingHours);
  if (open === true) out.push('<span class="tag open">Öppet nu</span>');
  else if (open === false) out.push('<span class="tag closed">Stängt</span>');

  for (const c of p.cuisines.slice(0, 2)) {
    out.push(`<span class="tag">${escapeHtml(cuisineLabel(c))}</span>`);
  }
  if (p.vegan === 'yes' || p.vegan === 'only') out.push('<span class="tag">Veganskt</span>');
  else if (p.vegetarian === 'yes' || p.vegetarian === 'only') out.push('<span class="tag">Vegetariskt</span>');
  if (p.outdoor) out.push('<span class="tag">Uteservering</span>');

  // Klickbar genväg rakt till menyn/hemsidan — data-stop hindrar att
  // kortets egen klickhanterare öppnar detaljvyn ovanpå.
  if (p.menu) {
    out.push(`<a class="tag tag-link" href="${escapeHtml(p.menu)}" target="_blank"
      rel="noopener" data-stop title="Öppna menyn">Meny ↗</a>`);
  } else if (p.website) {
    out.push(`<a class="tag tag-link" href="${escapeHtml(p.website)}" target="_blank"
      rel="noopener" data-stop title="Öppna hemsidan">Hemsida ↗</a>`);
  }
  return out.join('');
}

function renderList() {
  const rows = state.visible;
  el.count.textContent = rows.length
    ? `${rows.length} ställen`
    : 'Inga träffar';

  if (!rows.length) {
    el.list.innerHTML = '';
    el.empty.hidden = false;
    el.empty.textContent = state.places.length
      ? 'Inga ställen matchar filtren. Prova att rensa något av dem.'
      : 'Inga ställen här. Öka radien eller sök på en annan plats.';
    return;
  }
  el.empty.hidden = true;

  el.list.innerHTML = rows.map((p) => {
    const fav = state.favs.includes(p.id);
    const sub = [formatDistance(p.dist), p.street].filter(Boolean).join(' · ');
    return `
      <li class="card${state.activeId === p.id ? ' is-active' : ''}" data-id="${escapeHtml(p.id)}">
        <div class="card-body">
          <h3>${escapeHtml(p.name)}</h3>
          <p class="sub">${escapeHtml(sub)}</p>
          <div class="tags">${badges(p)}</div>
        </div>
        <button class="fav-btn${fav ? ' is-fav' : ''}" data-fav="${escapeHtml(p.id)}"
                aria-label="${fav ? 'Ta bort favorit' : 'Spara som favorit'}"
                aria-pressed="${fav}" type="button">${fav ? '★' : '☆'}</button>
      </li>`;
  }).join('');
}

function renderMarkers() {
  if (!state.layer) return;
  state.layer.clearLayers();
  state.markers.clear();

  for (const p of state.visible) {
    const marker = L.marker([p.lat, p.lon], { title: p.name });
    marker.bindPopup(popupHtml(p));
    marker.on('click', () => setActive(p.id, false));
    marker.addTo(state.layer);
    state.markers.set(p.id, marker);
  }
}

function popupHtml(p) {
  const links = [];
  if (p.menu) links.push(`<a href="${escapeHtml(p.menu)}" target="_blank" rel="noopener">Meny</a>`);
  else if (p.website) links.push(`<a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">Hemsida</a>`);
  links.push(`<a href="${mapsUrl(p)}" target="_blank" rel="noopener">Vägbeskrivning</a>`);
  return `<strong>${escapeHtml(p.name)}</strong><br>
    <span style="color:#777">${escapeHtml(formatDistance(p.dist))}${p.street ? ' · ' + escapeHtml(p.street) : ''}</span><br>
    ${links.join(' · ')}`;
}

function mapsUrl(p) {
  return `https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lon}`;
}

function menuSearchUrl(p) {
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(`${p.name} ${p.street || ''} lunchmeny dagens lunch`.trim());
}

// Lunchsidan har dagens lunch per område (t.ex. /plats/masttorget/12035118).
// Områdes-id:t går inte att härleda från OSM-datan, så vi länkar till
// startsidan där man väljer ort en gång.
const LUNCHSIDAN_URL = 'https://www.lunchsidan.se/';

/* ---------- Val: vinnare, slump, turnering, röstning ---------- */

function showWinner(p, eyebrow = 'Dagens lunch') {
  state.activeId = p.id;

  const open = isOpenNow(p.openingHours);
  const meta = [
    formatDistance(p.dist),
    p.cuisines.length ? cuisineLabel(p.cuisines[0]) : null,
    open === true ? 'Öppet nu' : open === false ? 'Stängt nu' : null,
    p.street || null,
  ].filter(Boolean).join(' · ');

  el.winner.innerHTML = `
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(p.name)}</h2>
    <p class="meta">${escapeHtml(meta)}</p>
    <div class="actions">
      <button class="btn btn-primary" data-act="details">Visa meny &amp; info</button>
      <a class="btn" href="${mapsUrl(p)}" target="_blank" rel="noopener">Vägbeskrivning</a>
      <button class="btn" data-act="reroll">🎲 Slumpa igen</button>
    </div>`;
  el.winner.hidden = false;
  el.winner.dataset.id = p.id;
  el.winner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  focusPlace(p);
  renderList();
}

function focusPlace(p) {
  if (!state.map) return;
  state.map.setView([p.lat, p.lon], Math.max(state.map.getZoom(), 16), { animate: true });
  state.markers.get(p.id)?.openPopup();
}

function setActive(id, scroll = true) {
  state.activeId = id;
  renderList();
  if (scroll) {
    el.list.querySelector(`[data-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  const p = state.places.find((x) => x.id === id);
  if (p) { focusPlace(p); }
}

function rememberChoice(id) {
  state.recent = [{ id, date: todayISO() }, ...state.recent.filter((r) => r.id !== id)].slice(0, 40);
  saveJSON(STORE.recent, state.recent);
}

function roll() {
  const pool = state.visible;
  if (!pool.length) { status('Inget att slumpa bland — lätta på filtren.'); return; }

  // Liten spinn-effekt: bläddra genom några innan vi landar.
  const winner = pool[Math.floor(Math.random() * pool.length)];
  let ticks = 0;
  const maxTicks = Math.min(12, pool.length * 2);

  el.roll.disabled = true;
  const spin = setInterval(() => {
    const p = pool[Math.floor(Math.random() * pool.length)];
    el.winner.hidden = false;
    el.winner.innerHTML = `<p class="eyebrow">Slumpar…</p><h2>${escapeHtml(p.name)}</h2><p class="meta">&nbsp;</p>`;
    if (++ticks >= maxTicks) {
      clearInterval(spin);
      el.roll.disabled = false;
      rememberChoice(winner.id);
      showWinner(winner);
    }
  }, 70);
}

/* Turnering: två i taget, användaren väljer, vinnaren går vidare. */
function startTournament() {
  const pool = state.visible.slice(0, 16);
  if (pool.length < 2) { status('Behöver minst två ställen för en turnering.'); return; }

  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  const size = Math.pow(2, Math.floor(Math.log2(shuffled.length)));
  state.tournament = { queue: shuffled.slice(0, size), next: [], round: 1 };
  nextDuel();
}

function nextDuel() {
  const t = state.tournament;
  if (!t) return;

  if (t.queue.length < 2) {
    if (t.next.length + t.queue.length === 1) {
      const winner = t.next[0] || t.queue[0];
      state.tournament = null;
      closeModal();
      rememberChoice(winner.id);
      showWinner(winner, 'Turneringens vinnare');
      return;
    }
    t.queue = t.next.concat(t.queue);
    t.next = [];
    t.round++;
  }

  const a = t.queue.shift();
  const b = t.queue.shift();
  const left = t.queue.length + t.next.length + 2;

  openModal(`
    <p class="eyebrow">Turnering · ${left} kvar</p>
    <h2 class="modal-title">Vilken vinner?</h2>
    <div class="duel">
      ${duelCard(a, 'a')}
      <span class="duel-vs">vs</span>
      ${duelCard(b, 'b')}
    </div>
    <button class="btn modal-skip" data-duel="skip">Hoppa över — välj åt mig</button>
  `);

  el.modalBody.querySelectorAll('[data-duel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.duel;
      const pick = which === 'a' ? a : which === 'b' ? b : (Math.random() < .5 ? a : b);
      t.next.push(pick);
      nextDuel();
    });
  });
}

function duelCard(p, side) {
  const open = isOpenNow(p.openingHours);
  const meta = [
    formatDistance(p.dist),
    p.cuisines.length ? cuisineLabel(p.cuisines[0]) : null,
    open === true ? 'Öppet' : open === false ? 'Stängt' : null,
  ].filter(Boolean).join(' · ');
  return `
    <button class="duel-card" data-duel="${side}" type="button">
      <h3>${escapeHtml(p.name)}</h3>
      <p class="sub">${escapeHtml(meta)}</p>
    </button>`;
}

/* ---------- Detaljvy med menylänkar ---------- */

function showDetails(p) {
  const open = isOpenNow(p.openingHours);
  const rows = [];

  if (p.street) rows.push(['Adress', escapeHtml(p.street)]);
  rows.push(['Avstånd', escapeHtml(formatDistance(p.dist))]);
  if (p.cuisines.length) rows.push(['Kök', p.cuisines.map(cuisineLabel).map(escapeHtml).join(', ')]);
  if (p.openingHours) {
    rows.push(['Öppettider',
      `<span class="oh">${escapeHtml(p.openingHours)}</span>` +
      (open === true ? ' <span class="tag open">Öppet nu</span>'
        : open === false ? ' <span class="tag closed">Stängt nu</span>' : '')]);
  }
  if (p.phone) rows.push(['Telefon', `<a href="tel:${escapeHtml(p.phone.replace(/\s/g, ''))}">${escapeHtml(p.phone)}</a>`]);
  if (p.takeaway === 'yes') rows.push(['Takeaway', 'Ja']);
  if (p.wheelchair === 'yes') rows.push(['Tillgänglighet', 'Rullstolsanpassat']);

  openModal(`
    <p class="eyebrow">${escapeHtml(p.amenity === 'fast_food' ? 'Snabbmat' : 'Restaurang')}</p>
    <h2 class="modal-title">${escapeHtml(p.name)}</h2>
    <dl class="detail-list">
      ${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`).join('')}
    </dl>
    <div class="menu-box">
      <h3>Meny</h3>
      ${p.menu
        ? `<p class="modal-text">Stället har en menylänk i OpenStreetMap.</p>
           <a class="btn btn-primary" href="${escapeHtml(p.menu)}" target="_blank" rel="noopener">Öppna menyn ↗</a>`
        : p.website
          ? `<p class="modal-text">Ingen menylänk i kartdatan — men stället har en hemsida.</p>
             <a class="btn btn-primary" href="${escapeHtml(p.website)}" target="_blank" rel="noopener">Öppna hemsidan ↗</a>`
          : `<p class="modal-text">Varken meny eller hemsida finns registrerad i OpenStreetMap.</p>`}
      <div class="menu-links">
        <a class="btn" href="${LUNCHSIDAN_URL}" target="_blank" rel="noopener">Lunchsidan ↗</a>
        <a class="btn" href="${escapeHtml(menuSearchUrl(p))}" target="_blank" rel="noopener">Sök på webben ↗</a>
      </div>
    </div>
    <div class="modal-actions">
      <a class="btn" href="${mapsUrl(p)}" target="_blank" rel="noopener">Vägbeskrivning</a>
      <a class="btn" href="https://www.openstreetmap.org/${escapeHtml(p.id)}" target="_blank" rel="noopener">Se i OSM</a>
    </div>
  `);
}

/* ---------- Modal ---------- */

let lastFocus = null;

function openModal(html) {
  lastFocus = document.activeElement;
  el.modalBody.innerHTML = html;
  el.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  el.modalClose.focus();
}

function closeModal() {
  el.modal.hidden = true;
  el.modalBody.innerHTML = '';
  document.body.style.overflow = '';
  state.tournament = null;
  lastFocus?.focus?.();
}

/* ---------- Karta ---------- */

function initMap() {
  state.map = L.map('map', { zoomControl: true, scrollWheelZoom: true })
    .setView([INITIAL_VIEW.lat, INITIAL_VIEW.lon], INITIAL_VIEW.zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(state.map);

  state.layer = L.layerGroup().addTo(state.map);
  state.meLayer = L.layerGroup().addTo(state.map);
}

function setCenter(center, { fly = true } = {}) {
  state.center = center;
  if (fly && state.map) {
    const zoom = el.area.value === 'radius' ? 15 : 14;
    state.map.setView([center.lat, center.lon], zoom, { animate: true });
  }

  state.meLayer.clearLayers();
  L.circleMarker([center.lat, center.lon], {
    radius: 7, color: '#d1523f', weight: 3, fillColor: '#fff', fillOpacity: 1,
  }).bindPopup(center.label || 'Här är du').addTo(state.meLayer);

  if (el.area.value === 'radius') {
    L.circle([center.lat, center.lon], {
      radius: +el.radius.value, color: '#d1523f', weight: 1,
      opacity: .35, fillOpacity: .05,
    }).addTo(state.meLayer);
  }
}

/* ---------- Init & händelser ---------- */

function initTheme() {
  const saved = localStorage.getItem(STORE.theme);
  if (saved) document.documentElement.dataset.theme = saved;
  el.theme.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark'
      || (!document.documentElement.dataset.theme
          && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORE.theme, next);
  });
}

function bindEvents() {
  el.radius.addEventListener('input', () => {
    el.radiusOut.textContent = `${el.radius.value} m`;
  });
  el.radius.addEventListener('change', () => {
    setCenter(state.center, { fly: false });
    loadPlaces();
  });

  el.area.addEventListener('change', () => {
    const byRadius = el.area.value === 'radius';
    el.radiusField.hidden = !byRadius;
    if (state.center) {
      setCenter(state.center, { fly: false });
      loadPlaces();
    }
  });

  el.cuisine.addEventListener('change', applyFilters);
  el.sort.addEventListener('change', applyFilters);
  el.openNow.addEventListener('change', applyFilters);
  el.onlyFavs.addEventListener('change', applyFilters);
  el.noRepeat.addEventListener('change', applyFilters);

  el.roll.addEventListener('click', roll);
  el.tourney.addEventListener('click', startTournament);

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = el.place.value.trim();
    if (!q) return;
    status('Söker plats…', true);
    try {
      const hit = await geocode(q);
      if (!hit) { status('Hittade ingen sådan plats.'); return; }
      setCenter(hit);
      loadPlaces();
    } catch {
      status('Platssökningen svarade inte. Försök igen.');
    }
  });

  el.locate.addEventListener('click', () => useGeolocation());

  // Klick i listan: favorit eller markera.
  el.list.addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.fav;
      state.favs = state.favs.includes(id)
        ? state.favs.filter((f) => f !== id)
        : [...state.favs, id];
      saveJSON(STORE.favs, state.favs);
      applyFilters();
      return;
    }
    if (e.target.closest('[data-stop]')) return;   // länk i kortet

    const card = e.target.closest('.card');
    if (card?.dataset.id) {
      const p = state.places.find((x) => x.id === card.dataset.id);
      if (p) { setActive(p.id, false); showDetails(p); }
    }
  });

  // Knappar i vinnarkortet.
  el.winner.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'reroll') { roll(); return; }
    if (act === 'details') {
      const p = state.places.find((x) => x.id === el.winner.dataset.id);
      if (p) showDetails(p);
    }
  });

  el.modalClose.addEventListener('click', closeModal);
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.modal.hidden) closeModal();
  });
}

// atStartup: nekas positionen vid uppstart har vi inget att visa, så vi
// ber om en plats. Klickar man själv på knappen räcker ett statusmeddelande.
function useGeolocation({ atStartup = false } = {}) {
  const fallback = (msg) => {
    status(msg, atStartup);
    if (atStartup) {
      el.count.textContent = 'Var är du?';
      el.empty.hidden = false;
      el.empty.textContent = 'Sök på ort eller adress ovan, eller tryck 📍 Min position.';
      el.place.focus();
    }
  };

  if (!navigator.geolocation) {
    fallback('Din webbläsare stödjer inte platstjänster.');
    return;
  }

  status('Hämtar din position…', true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Här är du' });
      el.place.value = '';
      loadPlaces();
    },
    () => fallback('Kunde inte hämta position — sök på ort istället.'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

function readUrlParams() {
  const q = new URLSearchParams(location.search);
  const lat = parseFloat(q.get('lat'));
  const lon = parseFloat(q.get('lon'));
  const r = parseInt(q.get('r'), 10);
  if (Number.isFinite(r) && r >= 250 && r <= 3000) {
    el.radius.value = r;
    el.radiusOut.textContent = `${r} m`;
  }
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon, label: 'Delad plats' };
  }
  return null;
}

function init() {
  initTheme();
  initMap();
  bindEvents();
  el.radiusOut.textContent = `${el.radius.value} m`;

  const shared = readUrlParams();
  if (shared) {
    setCenter(shared);
    loadPlaces();
  } else {
    useGeolocation({ atStartup: true });
  }
}

document.addEventListener('DOMContentLoaded', init);
