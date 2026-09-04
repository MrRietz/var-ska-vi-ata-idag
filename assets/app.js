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

// Stadsdelen hämtas utan att vi vet var användaren står — avstånden räknas
// då från Västra Hamnens mitt tills någon trycker på "Min position".
const SUBURB_CENTER = { lat: 55.6132, lon: 12.9843, label: 'Västra Hamnen' };

// CGI-kontoret i Göteborg (Kruthusgatan 17, Gullbergsvass). Runtomkring
// ligger Nordstan, Centralstationen och Stampen där lunchen brukar ätas,
// så området söks som en radie kring kontoret istället för en stadsdel.
const GOTEBORG_OFFICE = { lat: 57.71194, lon: 11.98223, label: 'CGI Göteborg', radius: 1200 };

// Förvalda sökområden med känd mittpunkt, så avstånd och kartvy kan räknas
// innan användaren delat sin position. Nyckel = värdet i #area-menyn.
const AREA_CENTERS = {
  'suburb:3050114': { ...SUBURB_CENTER },
  'office:goteborg': { lat: GOTEBORG_OFFICE.lat, lon: GOTEBORG_OFFICE.lon, label: GOTEBORG_OFFICE.label },
};

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

// Google-betyg, uppslagna för hand. OSM lagrar medvetet inga betyg och
// Google Places kräver nyckel + server, så listan fylls på manuellt.
// Nyckeln är restaurangens namn i gemener — OSM-id byts när en nod ritas
// om, namnet är stabilare. Saknas ett ställe visas ingen stjärna alls;
// aldrig ett gissat värde. `at` säger när betyget senast kontrollerades.
const RATINGS = {
  // namn                      betyg  omdömen  kontrollerat
  'curry republik':          { r: 3.8, n: 346,  at: '2026-09' },
  'laziza':                  { r: 4.5, n: 467,  at: '2026-09' },
  'thap thim':               { r: 3.9, n: null, at: '2026-09' },
  'spill':                   { r: 4.4, n: 76,   at: '2026-09' },
  'aster':                   { r: 4.3, n: 395,  at: '2026-09' },
  'sakura sushi':            { r: 4.1, n: 381,  at: '2026-09' },
  'västra hamnens pizzeria': { r: 4.7, n: 1594, at: '2026-09' },
  'prince thai':             { r: 3.8, n: 345,  at: '2026-09' },
  'two forks mat & vin':     { r: 4.9, n: 273,  at: '2026-09' },
  'porto gastrobar':         { r: 4.7, n: null, at: '2026-09' },
  'kontrast ghee by the sea':{ r: 4.5, n: 1084, at: '2026-09' },
  'tamnack thai':            { r: 4.2, n: null, at: '2026-09' },
  'locali':                  { r: 4.5, n: 240,  at: '2026-09' },
  'holy greens':             { r: 4.2, n: 60,   at: '2026-09' },
  'papi':                    { r: 4.6, n: 585,  at: '2026-09' },
  'maya cantina':            { r: 4.6, n: 111,  at: '2026-09' },
  'poms':                    { r: 4.1, n: 167,  at: '2026-09' },
  'ramen to bíiru':          { r: 4.4, n: 206,  at: '2026-09' },
  'aqua sushi':              { r: 4.9, n: 376,  at: '2026-09' },
  'falafel & burgers':       { r: 4.0, n: 216,  at: '2026-09' },
  'påris':                   { r: 4.0, n: 60,   at: '2026-09' },
  'woso':                    { r: 4.0, n: 11,   at: '2026-09' },
  'restaurang niagara':      { r: 4.1, n: 128,  at: '2026-09' },
  'grönt o’ gott':           { r: 4.3, n: 75,   at: '2026-09' },
  'p2':                      { r: 4.1, n: 276,  at: '2026-09' },
  'doc piazza':              { r: 4.3, n: 296,  at: '2026-09' },
  'ubåtshallen':             { r: 4.4, n: 97,   at: '2026-09' },
  'dockside burgers':        { r: 4.4, n: 716,  at: '2026-09' },
  'la fonderie':             { r: 4.5, n: 206,  at: '2026-09' },
  'bistro tout':             { r: 4.5, n: 23,   at: '2026-09' },
  'frankful':                { r: 4.7, n: 10,   at: '2026-09' },  // heter Vårt Kök nu
  'vårt kök':                { r: 4.7, n: 10,   at: '2026-09' },
  'sushi for you':           { r: 3.3, n: 389,  at: '2026-09' },
  'benne pastabar':          { r: 4.2, n: 228,  at: '2026-09' },
  'glasklart':               { r: 3.8, n: 536,  at: '2026-09' },
  'miss wang':               { r: 4.4, n: 144,  at: '2026-09' },
  'salad & sushi':           { r: 4.0, n: 221,  at: '2026-09' },
  'dojo sushi':              { r: 4.7, n: 20,   at: '2026-09' },
  'da zio':                  { r: 4.3, n: 48,   at: '2026-09' },
  'välfärden':               { r: 4.4, n: 198,  at: '2026-09' },
  'salads and smoothies':    { r: 3.6, n: 40,   at: '2026-09' },
  'kasai in the sky':        { r: 3.7, n: 675,  at: '2026-09' },
  'lokal 17 - pembert och company': { r: 4.0, n: 74, at: '2026-09' },
  'aro deli':                { r: 4.6, n: 66,   at: '2026-09' },
  'fisky business dockan':   { r: 4.5, n: 216,  at: '2026-09' },
  // rbg bar & grill utelämnad: Googles notering har bara 3 omdömen och
  // gästernas recensioner hamnar troligen på Radisson Blus egen sida.
};

// Ställen som bytt namn sedan OSM senast uppdaterades. Visas med det
// namn folk känner igen, med det gamla i parentes.
const RENAMED = {
  'frankful': 'Vårt Kök (f.d. Frankful)',
};

// OSM-namnen har ibland suffix ("Thap Thim Västra Hamnen") eller
// tillägg efter komma, så vi provar även en trimmad variant.
function ratingFor(_osmId, name) {
  const key = name.trim().toLowerCase();
  if (RATINGS[key]) return RATINGS[key];
  const short = key.split(',')[0].trim();
  if (RATINGS[short]) return RATINGS[short];
  return Object.entries(RATINGS).find(([k]) => short.startsWith(k))?.[1] || null;
}

// Stängda enligt uppslag, men fortfarande kvar i OSM. Vi vill inte
// skicka någon till en nedlagd krog på lunchen.
const CLOSED = new Set([
  'node/772486928',    // Torso Twisted — stängde 2011, lokalen är nu The Torso
  'node/2718559019',   // Zen Thai — nedlagd, i lokalen ligger nu Prince Thai
  'node/3815558172',   // Akvariet
]);

// Nedlagda som vi bara känner till på namn (OSM-id okänt eller instabilt).
const CLOSED_NAMES = new Set([
  'eatery social',           // permanent stängd; låg dessutom vid Malmö Live
  'mh matsalar - orkanen',   // permanent stängd enligt Google
  'vindstilla',              // flyttat från Citadellsvägen, ej öppen för allmänheten
  'la soupe',                // permanent stängd (Isbergs gata 14)
]);

// Ställen som saknas i OSM men finns på riktigt. Lägg till här tills
// någon hunnit kartlägga dem — bidra gärna in dem i OSM också.
const EXTRA_PLACES = [
  {
    id: 'manual/prince-thai',
    name: 'Prince Thai',
    lat: 55.6143166, lon: 12.9891631, // Dockplatsen 16 (uppslaget i Nominatim)
    amenity: 'restaurant',
    cuisines: ['thai'],
    street: 'Dockplatsen 16',
    website: 'https://www.princethai.nu/',
    openingHours: '',
  },
];

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
  chase: $('#chase-btn'),
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
    const renamed = RENAMED[name.trim().toLowerCase()];
    if (CLOSED.has(osmId)) continue;           // nedlagda
    if (CLOSED_NAMES.has(name.trim().toLowerCase().split(',')[0].trim())) continue;

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
      name: renamed || name,
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
      rating: ratingFor(osmId, name),
      dist: distanceM(center, { lat, lon }),
    });
  }
  return out;
}

// Bygger samma form som normalize() ger, så resten av appen inte behöver
// veta att de kommer från en annan källa.
function extraPlaces(center) {
  return EXTRA_PLACES.map((p) => ({
    menu: '', phone: '', takeaway: undefined, outdoor: false,
    vegetarian: undefined, vegan: undefined, wheelchair: undefined,
    ...p,
    rating: ratingFor(p.id, p.name),
    dist: distanceM(center, { lat: p.lat, lon: p.lon }),
  }));
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
      : mode === 'office:goteborg'
        ? buildRadiusQuery(GOTEBORG_OFFICE.lat, GOTEBORG_OFFICE.lon, GOTEBORG_OFFICE.radius)
        : buildRadiusQuery(state.center.lat, state.center.lon, radius);
    const data = await overpass(query);
    if (token !== state.fetchToken) return;    // ett nyare anrop har hunnit före

    state.places = normalize(data.elements || [], state.center)
      .concat(extraPlaces(state.center));
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

  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, 'sv'),
    // Obetygsatta sist — de är inte dåliga, bara okända.
    rating: (a, b) => (b.rating?.r ?? -1) - (a.rating?.r ?? -1) || a.dist - b.dist,
    distance: (a, b) => a.dist - b.dist,
  };
  rows.sort(sorters[el.sort.value] || sorters.distance);

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

function ratingBadge(rating) {
  if (!rating) return '';
  const cls = rating.r >= 4 ? ' rating-high' : rating.r < 3.5 ? ' rating-low' : '';
  const count = rating.n ? ` (${rating.n})` : '';
  return `<span class="tag rating${cls}" title="Google-betyg${count}, kontrollerat ${rating.at}">★ ${rating.r.toFixed(1).replace('.', ',')}</span>`;
}

function badges(p) {
  const out = [];
  if (p.rating) out.push(ratingBadge(p.rating));
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
  if (!state.visible.length) { status('Inget att slumpa bland — lätta på filtren.'); return; }

  // Aldrig samma ställe två gånger i rad. Med bara ett kvar efter filtren
  // finns inget alternativ, och då får det bli samma igen.
  const last = state.recent[0]?.id;
  const fresh = state.visible.filter((p) => p.id !== last);
  const pool = fresh.length ? fresh : state.visible;

  const winner = pool[Math.floor(Math.random() * pool.length)];
  let ticks = 0;
  const maxTicks = Math.min(12, pool.length * 2);

  el.roll.disabled = true;
  const spin = setInterval(() => {
    const p = state.visible[Math.floor(Math.random() * state.visible.length)];
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
const TOURNAMENT_SIZE = 8;

// Fisher-Yates. `sort(() => Math.random() - 0.5)` ger en skev blandning
// eftersom jämförelsefunktionen inte är konsekvent.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Viktat urval: högt betyg oftare, men inget är uteslutet. Obetygsatta
// får medelvikt — de är okända, inte dåliga.
function pickContenders(places, count) {
  const weightOf = (p) => {
    const r = p.rating?.r ?? 3.9;
    return Math.max(0.2, r - 2.5) ** 2;      // 4,5 väger ~4x mot 3,0
  };
  const remaining = places.slice();
  const picked = [];

  while (picked.length < count && remaining.length) {
    const total = remaining.reduce((sum, p) => sum + weightOf(p), 0);
    let roll = Math.random() * total;
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= weightOf(remaining[i]);
      if (roll <= 0) { idx = i; break; }
    }
    picked.push(remaining.splice(idx, 1)[0]);
  }
  return picked;
}

function startTournament() {
  if (state.visible.length < 2) {
    status('Behöver minst två ställen för en turnering.');
    return;
  }

  // Störst tvåpotens som ryms, så alla möts i en jämn stege.
  const wanted = Math.min(TOURNAMENT_SIZE, state.visible.length);
  const size = Math.pow(2, Math.floor(Math.log2(wanted)));
  const contenders = shuffle(pickContenders(state.visible, size));

  state.tournament = { queue: contenders, next: [], round: 1 };
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
  const label = left === 2 ? 'Final'
    : left <= 4 ? 'Semifinal'
    : `Omgång ${t.round}`;

  openModal(`
    <p class="eyebrow">${escapeHtml(label)} · ${left} kvar</p>
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
      ${p.rating ? ratingBadge(p.rating) : ''}
      <h3>${escapeHtml(p.name)}</h3>
      <p class="sub">${escapeHtml(meta)}</p>
    </button>`;
}

/* ---------- Jaga mig: Pac-Man-minispel ----------
   Du flyr i en labyrint. De högst betygsatta ställena jagar dig som
   spöken; det spöke som fångar dig blir dagens lunch. Ren canvas + rAF,
   inga bibliotek. */

const CHASE_GHOSTS = 4;

// 15x15-labyrint. '#' = vägg, ' ' = gång. Symmetrisk och öppen nog att
// spöken och spelare får plats att röra sig. Ramen är helvägg.
const MAZE = [
  '###############',
  '#      #      #',
  '# ### ### ### #',
  '# #         # #',
  '# # ### ### # #',
  '#     # #     #',
  '### # # # # ###',
  '#   #     #   #',
  '### # ### # ###',
  '#     # #     #',
  '# # ### ### # #',
  '# #         # #',
  '# ### ### ### #',
  '#      #      #',
  '###############',
];
const MAZE_W = MAZE[0].length;
const MAZE_H = MAZE.length;

// Distinkta spökfärger, klassiska Pac-Man-toner så de går att skilja åt.
const GHOST_COLORS = ['#ff5b52', '#ff9ff2', '#00e0e0', '#ffae42'];

let chase = null;   // aktivt spel, eller null

function isWall(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MAZE_W || cy >= MAZE_H) return true;
  return MAZE[cy][cx] === '#';
}

function startChase() {
  if (state.visible.length < 2) {
    status('Behöver minst två ställen för att bli jagad.');
    return;
  }

  // De populäraste blir spöken: högst betyg först, obetygsatta sist.
  const ranked = state.visible.slice().sort(
    (a, b) => (b.rating?.r ?? -1) - (a.rating?.r ?? -1) || a.dist - b.dist
  );
  const chosen = ranked.slice(0, Math.min(CHASE_GHOSTS, ranked.length));

  openModal(`
    <p class="eyebrow">Jaga mig</p>
    <h2 class="modal-title">Spring undan spökena!</h2>
    <p class="chase-intro">Ät prickarna och samla poäng — men det spöke som fångar
      dig bestämmer var vi äter. Klarar du hela banan får du välja fritt. 😅</p>
    <ul class="chase-ghosts">
      ${chosen.map((p, i) => `
        <li><span class="dot" style="background:${GHOST_COLORS[i]}"></span>
          ${escapeHtml(p.name)}${p.rating ? ` ★ ${p.rating.r.toFixed(1).replace('.', ',')}` : ''}</li>
      `).join('')}
    </ul>
    <div class="chase-stage">
      <div class="chase-hud">
        <span class="chase-score">Poäng: <strong id="chase-score-val">0</strong></span>
        <span class="chase-left"><strong id="chase-pellets-val">0</strong> prickar kvar</span>
      </div>
      <canvas id="chase-canvas" class="chase-canvas" width="450" height="450"
              aria-label="Jaga mig-spelplan"></canvas>
      <p class="chase-hint">Rör dig med <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> eller <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></p>
      <div class="chase-pad" aria-hidden="true">
        <button class="pad-up" data-dir="up">▲</button>
        <button class="pad-left" data-dir="left">◀</button>
        <button class="pad-right" data-dir="right">▶</button>
        <button class="pad-down" data-dir="down">▼</button>
      </div>
    </div>
  `);

  initChase(chosen);
}

function initChase(ghostPlaces) {
  const canvas = el.modalBody.querySelector('#chase-canvas');
  const ctx = canvas.getContext('2d');
  const tile = canvas.width / MAZE_W;

  // Startruta för spelaren: mitten, en bit ner från spökena. `prog` är hur
  // långt (0–1) man hunnit mot nästa ruta — rörelsen ritas mjukt däremellan.
  const player = { x: 7, y: 11, dir: null, want: null, prog: 0 };

  // Spökena startar i mittkorridoren, utspridda så de inte krockar direkt.
  const spawns = [{ x: 5, y: 7 }, { x: 6, y: 7 }, { x: 8, y: 7 }, { x: 9, y: 7 }];
  const ghosts = ghostPlaces.map((place, i) => ({
    place,
    color: GHOST_COLORS[i],
    x: spawns[i % spawns.length].x,
    y: spawns[i % spawns.length].y,
    dir: null,
    prog: 0,
  }));

  // Prickar på varje gång-ruta, utom där spelare och spöken står. De fyra
  // hörnrummen får en fetare "kraftprick" värd mer.
  const skip = new Set([`${player.x},${player.y}`, ...spawns.map((s) => `${s.x},${s.y}`)]);
  const powerTiles = new Set(['1,1', `${MAZE_W - 2},1`, `1,${MAZE_H - 2}`, `${MAZE_W - 2},${MAZE_H - 2}`]);
  const pellets = new Map();   // "x,y" -> 'dot' | 'power'
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      const key = `${x},${y}`;
      if (isWall(x, y) || skip.has(key)) continue;
      pellets.set(key, powerTiles.has(key) ? 'power' : 'dot');
    }
  }

  chase = {
    canvas, ctx, tile, player, ghosts,
    pellets, score: 0, totalPellets: pellets.size,
    raf: 0, lastFrame: 0,
    // Tid att korsa en ruta. Mjuk rörelse gör att lägre värden känns flytande
    // istället för hackiga — nära arcade-tempo utan att bli ostyrbart.
    playerTileMs: 220,    // ~4,5 rutor/s
    ghostTileMs: 250,     // spöken en gnutta långsammare → man kan smita undan
    grace: 1200,          // ms innan spökena börjar jaga — hinn orientera dig
    startedAt: performance.now(),
    over: false,
    onKey: null, onPad: null,
    scoreEl: el.modalBody.querySelector('#chase-score-val'),
    leftEl: el.modalBody.querySelector('#chase-pellets-val'),
  };
  updateChaseHud();

  // Tangentbord.
  chase.onKey = (e) => {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    };
    const dir = map[e.key];
    if (dir) { e.preventDefault(); player.want = dir; }
  };
  document.addEventListener('keydown', chase.onKey);

  // Pekstyrning.
  chase.onPad = (e) => {
    const btn = e.target.closest('[data-dir]');
    if (btn) { e.preventDefault(); player.want = btn.dataset.dir; }
  };
  el.modalBody.querySelector('.chase-pad')?.addEventListener('click', chase.onPad);

  drawChase();
  chase.raf = requestAnimationFrame(chaseLoop);
}

const DIRS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

function chaseLoop(now) {
  if (!chase || chase.over) return;
  const c = chase;
  const dt = c.lastFrame ? Math.min(now - c.lastFrame, 50) : 16;   // klamp mot flikbyten
  c.lastFrame = now;

  // Rörelsen sker kontinuerligt: varje ruta korsas över playerTileMs/ghostTileMs,
  // och logiken (svängar, äta, jaga, fångas) körs när en ruta är helt korsad.
  advancePlayer(dt);
  if (c.pellets.size === 0) { boardCleared(); return; }   // hela banan avklarad

  const chasing = now - c.startedAt >= c.grace;
  if (chasing) advanceGhosts(dt);

  if (checkCaught()) return;   // stänger själv om någon fångar
  drawChase();
  c.raf = requestAnimationFrame(chaseLoop);
}

// Flyttar spelaren mjukt. När prog når 1 låses den till nästa ruta och nästa
// steg beslutas (sväng/vägg/prick), precis som ett rutvist steg förr.
function advancePlayer(dt) {
  const p = chase.player;

  // Rakt-om-vändning får slå igenom direkt, även mitt i en ruta.
  tryTurnPlayer();
  if (!p.dir) return;   // står stilla tills en giltig riktning valts

  // Står man i rutcentrum och nästa ruta är vägg: rör dig inte alls (annars
  // skulle gubben glida in i väggen innan prog hunnit nå 1). Riktningen ligger
  // kvar så man rullar vidare så fort man svängt eller gången öppnats.
  const ahead = DIRS[p.dir];
  if (p.prog < 0.001 && isWall(p.x + ahead.x, p.y + ahead.y)) { p.prog = 0; return; }

  p.prog += dt / chase.playerTileMs;
  while (p.prog >= 1) {
    // Kliv in i nästa ruta (redan verifierad som gång).
    const d = DIRS[p.dir];
    p.x += d.x; p.y += d.y;
    p.prog -= 1;
    eatPellet();

    // Vid rutcentrum: sväng om man vill; stanna om det bär mot vägg.
    tryTurnPlayer();
    const nd = DIRS[p.dir];
    if (isWall(p.x + nd.x, p.y + nd.y)) { p.prog = 0; break; }
  }
}

function tryTurnPlayer() {
  const p = chase.player;
  if (!p.want) return;

  // Rakt-om-vändning: tillåt direkt, även mitt i en ruta. Ankaret flyttas
  // till rutan man var på väg mot så pixelläget bevaras (prog speglas). Bara
  // om den rutan faktiskt är en gång — annars glider man ju mot en vägg och
  // får svänga vid rutcentrum som vanligt (annars hamnar ankaret i väggen).
  const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[p.dir];
  if (p.dir && p.want === back && p.prog > 0.001) {
    const d = DIRS[p.dir];
    if (!isWall(p.x + d.x, p.y + d.y)) {
      p.x += d.x; p.y += d.y;        // hoppa till målrutan …
      p.prog = 1 - p.prog;          // … och spegla hur långt vi hunnit
      p.dir = p.want; p.want = null;
    }
    return;
  }

  // Övriga svängar sker i rutcentrum (prog≈0) och bara om vägen är fri.
  const d = DIRS[p.want];
  if (p.prog < 0.001 && !isWall(p.x + d.x, p.y + d.y)) {
    p.dir = p.want;
    p.want = null;
  }
}

function advanceGhosts(dt) {
  for (const g of chase.ghosts) {
    if (!g.dir) { pickGhostDir(g); if (!g.dir) continue; }
    g.prog += dt / chase.ghostTileMs;
    while (g.prog >= 1) {
      const d = DIRS[g.dir];
      g.x += d.x; g.y += d.y;
      g.prog -= 1;
      pickGhostDir(g);                 // välj nästa riktning i den nya rutan
      if (!g.dir) { g.prog = 0; break; }
    }
  }
}

function eatPellet() {
  const c = chase;
  const key = `${c.player.x},${c.player.y}`;
  const kind = c.pellets.get(key);
  if (!kind) return;
  c.pellets.delete(key);
  c.score += kind === 'power' ? 50 : 10;
  updateChaseHud();
}

function updateChaseHud() {
  if (chase.scoreEl) chase.scoreEl.textContent = chase.score;
  if (chase.leftEl) chase.leftEl.textContent = chase.pellets.size;
}

// Klarade hela banan utan att åka fast — då får man välja fritt. Vi slumpar
// bland alla synliga ställen (inte bara spökena) som belöning.
function boardCleared() {
  chase.over = true;
  const pool = state.visible.length ? state.visible : chase.ghosts.map((g) => g.place);
  const winner = pool[Math.floor(Math.random() * pool.length)];
  stopChase();
  closeModal();
  rememberChoice(winner.id);
  showWinner(winner, 'Du klarade banan — fritt val!');
}

// Väljer ett spökes nästa riktning från dess nuvarande ruta.
function pickGhostDir(g) {
  const p = chase.player;
  const opts = Object.entries(DIRS).filter(([dir]) => {
    if (isWall(g.x + DIRS[dir].x, g.y + DIRS[dir].y)) return false;
    // Undvik att direkt vända 180° i korridorer — ger mindre studsande.
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[g.dir];
    return dir !== back;
  });
  const choices = opts.length ? opts : Object.entries(DIRS).filter(
    ([dir]) => !isWall(g.x + DIRS[dir].x, g.y + DIRS[dir].y)
  );
  if (!choices.length) { g.dir = null; return; }

  // Jaga: oftast mot spelaren, annars slumpmässigt så det inte blir ett
  // perfekt lås som fångar en direkt.
  let pick;
  if (Math.random() < 0.60) {
    const score = (dir) =>
      Math.abs(g.x + DIRS[dir].x - p.x) + Math.abs(g.y + DIRS[dir].y - p.y);
    pick = choices.reduce((best, cur) => (score(cur[0]) < score(best[0]) ? cur : best));
  } else {
    pick = choices[Math.floor(Math.random() * choices.length)];
  }
  g.dir = pick[0];
}

// Pixelposition (rutcentrum) med mjuk interpolation mot nästa ruta.
function entityPixel(e) {
  const t = chase.tile;
  const d = e.dir ? DIRS[e.dir] : { x: 0, y: 0 };
  const cx = (e.x + d.x * e.prog) * t + t / 2;
  const cy = (e.y + d.y * e.prog) * t + t / 2;
  return { cx, cy };
}

function checkCaught() {
  const pp = entityPixel(chase.player);
  const hitDist = chase.tile * 0.6;   // överlapp i pixlar → fångad
  const hit = chase.ghosts.find((g) => {
    const gp = entityPixel(g);
    return Math.hypot(gp.cx - pp.cx, gp.cy - pp.cy) < hitDist;
  });
  if (!hit) return false;
  chase.over = true;
  const winner = hit.place;
  stopChase();
  closeModal();
  rememberChoice(winner.id);
  showWinner(winner, 'Spöket tog dig');
  return true;
}

function drawChase() {
  const { ctx, canvas, tile } = chase;
  const now = performance.now();

  ctx.fillStyle = '#0b0b1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Väggar.
  ctx.fillStyle = '#2536b8';
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      if (MAZE[y][x] === '#') {
        ctx.fillRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2);
      }
    }
  }

  // Prickar att äta. Kraftprickar blinkar lite för att synas.
  const powerOn = Math.floor(now / 250) % 2 === 0;
  for (const [key, kind] of chase.pellets) {
    const [gx, gy] = key.split(',').map(Number);
    const cx = gx * tile + tile / 2;
    const cy = gy * tile + tile / 2;
    if (kind === 'power') {
      if (!powerOn) continue;
      ctx.fillStyle = '#ffd21e';
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.22, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f6d9a0';
      ctx.beginPath();
      ctx.arc(cx, cy, tile * 0.09, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Blinkande "säker zon"-känsla under grace-perioden.
  const inGrace = now - chase.startedAt < chase.grace;

  // Spelaren (Pac-Man) — mjukt interpolerad position, gapande cirkel.
  const p = chase.player;
  const { cx: px, cy: py } = entityPixel(p);
  const r = tile * 0.42;
  const mouth = (Math.sin(now / 90) * 0.5 + 0.5) * 0.32 + 0.04;
  const facing = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[p.dir] ?? 0;
  ctx.fillStyle = inGrace ? '#ffe14d' : '#ffd21e';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, r, facing + mouth * Math.PI, facing + (2 - mouth) * Math.PI);
  ctx.closePath();
  ctx.fill();

  // Spökena — även de interpolerade.
  for (const g of chase.ghosts) {
    const { cx, cy } = entityPixel(g);
    drawGhost(ctx, cx, cy, tile * 0.42, g.color, inGrace);
  }
}

// Klassisk spökform: rund topp, vågig fåll, två ögon.
function drawGhost(ctx, cx, cy, r, color, dim) {
  ctx.save();
  ctx.globalAlpha = dim ? 0.55 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r, Math.PI, 0);
  const bottom = cy + r * 0.9;
  ctx.lineTo(cx + r, bottom);
  const feet = 4;
  for (let i = 0; i < feet; i++) {
    const x1 = cx + r - (2 * r) * ((i + 0.5) / feet);
    const x2 = cx + r - (2 * r) * ((i + 1) / feet);
    ctx.lineTo(x1, bottom - r * 0.28);
    ctx.lineTo(x2, bottom);
  }
  ctx.closePath();
  ctx.fill();

  // Ögon.
  ctx.fillStyle = '#fff';
  const eo = r * 0.34;
  ctx.beginPath();
  ctx.arc(cx - eo, cy - r * 0.1, r * 0.26, 0, 2 * Math.PI);
  ctx.arc(cx + eo, cy - r * 0.1, r * 0.26, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1a1a40';
  ctx.beginPath();
  ctx.arc(cx - eo, cy - r * 0.05, r * 0.13, 0, 2 * Math.PI);
  ctx.arc(cx + eo, cy - r * 0.05, r * 0.13, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function stopChase() {
  if (!chase) return;
  cancelAnimationFrame(chase.raf);
  document.removeEventListener('keydown', chase.onKey);
  chase = null;
}

/* ---------- Detaljvy med menylänkar ---------- */

function showDetails(p) {
  const open = isOpenNow(p.openingHours);
  const rows = [];

  if (p.street) rows.push(['Adress', escapeHtml(p.street)]);
  rows.push(['Avstånd', escapeHtml(formatDistance(p.dist))]);
  if (p.rating) {
    rows.push(['Google-betyg',
      `★ ${p.rating.r.toFixed(1).replace('.', ',')} av 5` +
      (p.rating.n ? ` <span class="muted">(${p.rating.n} omdömen)</span>` : '') +
      ` <span class="muted">· kontrollerat ${escapeHtml(p.rating.at)}</span>`]);
  }
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
  stopChase();
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

  // Rita sökcirkeln både i radieläget och kring Göteborgskontoret, så det
  // syns hur stort område som täcks.
  const circleRadius = el.area.value === 'radius' ? +el.radius.value
    : el.area.value === 'office:goteborg' ? GOTEBORG_OFFICE.radius
    : null;
  if (circleRadius) {
    L.circle([center.lat, center.lon], {
      radius: circleRadius, color: '#d1523f', weight: 1,
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
    // Ett förvalt område har en känd mittpunkt att flytta kartan till;
    // "Avstånd från mig" behåller positionen vi redan har.
    const preset = AREA_CENTERS[el.area.value];
    if (preset) {
      setCenter({ ...preset });
      loadPlaces();
    } else if (state.center) {
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
  el.chase.addEventListener('click', startChase);

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
      const me = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Här är du' };
      // Har man delat sin position vill man se det som ligger nära — så
      // sökområdet växlar till "Avstånd från mig" och hämtar runt en.
      el.area.value = 'radius';
      el.radiusField.hidden = false;
      setCenter(me);
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
    // Stadsdelsläget behöver ingen position, så vi visar listan direkt
    // istället för att möta besökaren med en behörighetsdialog.
    setCenter({ ...SUBURB_CENTER });
    loadPlaces();
  }
}

document.addEventListener('DOMContentLoaded', init);
