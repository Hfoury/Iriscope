// Parcours de randonnée et de marche (rubrique « Aération » de l'appli), recalculés chaque nuit.
// Source : extrait quotidien des itinéraires de randonnée d'OpenStreetMap (route=hiking et route=foot, France métropolitaine)
// publié par magOSM (Magellium) sur data.gouv.fr. Licence ODbL : citer « © les contributeurs d'OpenStreetMap » ; la base dérivée
// publiée ici reste sous ODbL. Dénivelé : service d'altimétrie de l'IGN (Géoplateforme, gratuit, Licence Ouverte).
// Résultat : <dossier>/parcours/<lat*2>_<lon*2>.json (tuiles d'un demi-degré, selon le point de départ) + index.json + cache-alti.json
// Usage : node outils/parcours.mjs sortie [--fichier extrait.geojson] [--cache ancien-cache.json] [--max-alti 6000]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'parcours');
const MAX_ALTI = Number(opt('--max-alti') || 6000);
const T0 = Date.now(), BUDGET = Number(opt('--minutes') || 45) * 60000;
const WFS = 'https://magosm.magellium.com/geoserver/wfs?request=GetFeature&version=2.0.0&outputFormat=application/json'
  + '&typeName=magosm:hiking_foot_routes_line&srsName=EPSG:4326';
const ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const UA = { 'User-Agent': 'iriscope-parcours/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const tile = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const r4 = v => Math.round(v * 1e4) / 1e4;
const R = 6371;
function km(a, b) {
  const t = Math.PI / 180, dLat = (b[1] - a[1]) * t, dLon = (b[0] - a[0]) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function get(url, tries = 4) {
  for (let k = 0; ; k++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (k >= tries - 1) throw e; await sleep(5000 * (k + 1)); }
  }
}

/* ---------- 1. lecture de l'extrait (par pages de 5 000) ---------- */
async function readAll() {
  const file = opt('--fichier');
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8')).features || [];
  const all = [];
  for (let start = 0; ; start += 5000) {
    const j = await get(`${WFS}&count=5000&startIndex=${start}`);
    const f = j.features || [];
    all.push(...f);
    console.log(`  page ${start / 5000 + 1} : ${f.length} itinéraires`);
    if (f.length < 5000) break;
  }
  return all;
}
const features = await readAll();
console.log(`${features.length} itinéraires lus`);
if (features[0]) console.log('Champs disponibles :', Object.keys(features[0].properties || {}).join(', '));

/* ---------- 2. mesures : distance, départ, boucle, tracé simplifié ---------- */
function lines(g) {
  if (!g) return [];
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(lines);
  return [];
}
// Douglas-Peucker (tolérance en degrés, ~25 m)
function simplify(pts, tol = 0.00025) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / L));
      const d = Math.hypot(pts[i][0] - (x1 + t * dx), pts[i][1] - (y1 + t * dy));
      if (d > best) { best = d; idx = i; }
    }
    if (best > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Remet bout à bout les morceaux d'un itinéraire (les chemins d'une relation OSM ne sont pas toujours dans l'ordre)
function chain(parts) {
  const rest = parts.filter(p => p.length > 1).map(p => p.slice());
  if (!rest.length) return [];
  rest.sort((a, b) => b.length - a.length);
  const out = [rest.shift()];
  let cur = out[0];
  while (rest.length) {
    const end = cur[cur.length - 1];
    let bi = 0, bd = Infinity, rev = false;
    rest.forEach((p, i) => { const d1 = km(end, p[0]), d2 = km(end, p[p.length - 1]); if (d1 < bd) { bd = d1; bi = i; rev = false; } if (d2 < bd) { bd = d2; bi = i; rev = true; } });
    const p = rest.splice(bi, 1)[0]; if (rev) p.reverse();
    if (bd < 0.05) cur.push(...p.slice(1)); else { out.push(p); cur = p; }
  }
  return out;
}
const pick = (p, ...ks) => { for (const k of ks) if (p[k] != null && clean(p[k])) return clean(p[k]); return ''; };
const routes = [];
let skipped = 0;
for (const f of features) {
  const p = f.properties || {};
  const segs = chain(lines(f.geometry));
  if (!segs.length) { skipped++; continue; }
  const len = segs.reduce((s, seg) => s + seg.slice(1).reduce((t, c, i) => t + km(seg[i], c), 0), 0);
  // promenades de 1 à 40 km : au-delà, ce sont des itinérances de plusieurs jours (GR complets), pas une sortie d'aération
  if (len < 1 || len > 40) { skipped++; continue; }
  const first = segs[0][0], lastSeg = segs[segs.length - 1], last = lastSeg[lastSeg.length - 1];
  const rt = pick(p, 'roundtrip', 'tags.roundtrip');
  const loop = rt === 'yes' ? true : rt === 'no' ? false : km(first, last) < 0.3;
  const id = pick(p, 'osm_id', 'id') || String(f.id || '');
  routes.push({
    id, n: pick(p, 'name', 'nom'), ref: pick(p, 'ref'), net: pick(p, 'network'), kind: pick(p, 'route'),
    op: pick(p, 'operator'), web: pick(p, 'website', 'url'), desc: pick(p, 'description').slice(0, 200),
    sac: pick(p, 'sac_scale'), km: Math.round(len * 10) / 10, loop,
    lat: r4(first[1]), lon: r4(first[0]), segs: segs.map(s => simplify(s)),
  });
}
console.log(`${routes.length} parcours de 1 à 40 km gardés, ${skipped} écartés`);

/* ---------- 3. dénivelé positif (IGN), mis en cache d'une nuit sur l'autre ---------- */
let cache = {};
try { if (opt('--cache')) cache = JSON.parse(fs.readFileSync(opt('--cache'), 'utf8')); } catch (e) { cache = {}; }
const keyOf = r => `${r.id}:${r.km}`;
// ~150 points au plus, tous les 200 m environ, morceau par morceau
function samples(r) {
  const step = Math.max(0.2, r.km / 150);
  return r.segs.map(seg => {
    const out = [seg[0]]; let since = 0;
    for (let i = 1; i < seg.length; i++) { since += km(seg[i - 1], seg[i]); if (since >= step || i === seg.length - 1) { out.push(seg[i]); since = 0; } }
    return out;
  });
}
async function climb(r) {
  const parts = samples(r);
  const flat = parts.flat();
  const zs = [];
  for (let i = 0; i < flat.length; i += 150) {
    const chunk = flat.slice(i, i + 150);
    const url = `${ALTI}?lon=${chunk.map(c => c[0].toFixed(5)).join('|')}&lat=${chunk.map(c => c[1].toFixed(5)).join('|')}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=true`;
    const j = await get(url, 3);
    zs.push(...(j.elevations || []));
  }
  let k = 0, up = 0, hi = -Infinity, lo = Infinity;
  for (const part of parts) {
    let prev = null;
    for (let i = 0; i < part.length; i++, k++) {
      const z = Number(zs[k]);
      if (!Number.isFinite(z) || z < -500) continue;
      hi = Math.max(hi, z); lo = Math.min(lo, z);
      if (prev != null && z - prev > 2) up += z - prev; // en dessous de 2 m, du bruit
      prev = z;
    }
  }
  return Number.isFinite(hi) ? { up: Math.round(up), hi: Math.round(hi), lo: Math.round(lo) } : null;
}
const todo = routes.filter(r => !cache[keyOf(r)]);
console.log(`Dénivelé : ${routes.length - todo.length} déjà connus, ${todo.length} à calculer (au plus ${MAX_ALTI} cette nuit)`);
let done = 0, fails = 0;
const queue = todo.slice(0, MAX_ALTI);
await Promise.all([...Array(6)].map(async () => {
  while (queue.length && Date.now() - T0 < BUDGET) {
    const r = queue.shift();
    try { const c = await climb(r); if (c) { cache[keyOf(r)] = c; done++; } } catch (e) { fails++; if (fails > 200) { queue.length = 0; console.log('Trop d\'échecs du service d\'altitude, on s\'arrête là pour cette nuit'); } }
    await sleep(100);
  }
}));
console.log(`Dénivelé calculé pour ${done} parcours (${fails} échecs)`);
const alive = new Set(routes.map(keyOf));
for (const k of Object.keys(cache)) if (!alive.has(k)) delete cache[k];

/* ---------- 4. niveau et durées ---------- */
// effort = km + dénivelé/100 (règle des randonneurs : 100 m de montée ≈ 1 km de plat)
// durée à pied : 4 km/h + 1 h par 300 m de montée ; marche rapide : 6 km/h + 1 h par 450 m
const r5min = h => Math.max(5, Math.round(h * 60 / 5) * 5);
function finish(r) {
  const c = cache[keyOf(r)];
  const up = c ? c.up : null;
  const eff = r.km + (up || 0) / 100;
  let lvl = eff < 8 ? 1 : eff < 15 ? 2 : eff < 25 ? 3 : 4;
  if (/demanding|alpine/.test(r.sac)) lvl = Math.max(lvl, 4); else if (/mountain_hiking/.test(r.sac)) lvl = Math.max(lvl, 3);
  const o = { id: r.id, n: r.n || (r.ref ? `Itinéraire ${r.ref}` : 'Itinéraire de randonnée'), km: r.km, lvl, loop: r.loop ? 1 : 0, lat: r.lat, lon: r.lon,
    t: r5min(r.km / 4 + (up || 0) / 300), tf: r5min(r.km / 6 + (up || 0) / 450) };
  if (up != null) { o.up = up; o.zmax = c.hi; }
  if (r.ref) o.ref = r.ref.slice(0, 30);
  if (r.net) o.net = r.net;
  if (r.op) o.op = r.op.slice(0, 80);
  if (/^https?:\/\//.test(r.web)) o.w = r.web.slice(0, 200);
  if (r.desc) o.d = r.desc;
  // tracé compact : [[lon,lat,lon,lat…], …] à 4 décimales (~10 m)
  o.g = r.segs.map(s => s.flatMap(c => [r4(c[0]), r4(c[1])]));
  return o;
}
const items = routes.map(finish);

/* ---------- 5. écriture ---------- */
fs.mkdirSync(OUT, { recursive: true });
const updated = new Date().toISOString();
const by = {};
for (const it of items) (by[tile(it.lat, it.lon)] ||= []).push(it);
let max = 0, maxT = '';
for (const [t, list] of Object.entries(by)) {
  list.sort((a, b) => a.km - b.km);
  const txt = JSON.stringify({ updated, licence: '© les contributeurs d\'OpenStreetMap (ODbL) · altitudes IGN', items: list });
  if (txt.length > max) { max = txt.length; maxT = t; }
  fs.writeFileSync(path.join(OUT, `${t}.json`), txt);
}
fs.writeFileSync(path.join(OUT, 'cache-alti.json'), JSON.stringify(cache));
const lv = [1, 2, 3, 4].map(l => items.filter(i => i.lvl === l).length);
const index = { updated, count: items.length, tiles: Object.keys(by).length, withClimb: items.filter(i => i.up != null).length, levels: lv };
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`${items.length} parcours, ${Object.keys(by).length} tuiles, la plus lourde ${Math.round(max / 1024)} Ko (${maxT})`);
console.log(`Niveaux : facile ${lv[0]}, moyen ${lv[1]}, difficile ${lv[2]}, sportif ${lv[3]} · avec dénivelé : ${index.withClimb}`);
const ex = items.filter(i => i.up != null).slice(0, 5);
for (const e of ex) console.log(`  ex. ${e.n} · ${e.km} km · D+ ${e.up} m · niveau ${e.lvl} · ${e.t} min à pied · ${e.loop ? 'boucle' : 'aller simple'}`);
