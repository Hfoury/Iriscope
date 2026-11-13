// Préparation nocturne des transports urbains (0.40.0) : métro, RER, tramway, funiculaire et téléphérique urbain
// des villes françaises qui en ont, d'après OpenStreetMap (ODbL, usage commercial permis, à citer).
// Résultat : <dossier>/transports/<ville>.json { city, updated, plan, lines: [{ id, ref, name, mode, color, net, paths }], stations: [{ n, lat, lon, l }] }
// et <dossier>/transports/index.json { updated, cities: [{ slug, name, lat, lon, km, plan, lines, stations }] }.
// Les plans officiels des réseaux sont protégés : on ne donne qu'un lien vers leur site.
// Usage : node outils/transports.mjs sortie [--ville lyon]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const OUT = path.join(args.find(a => !a.startsWith('--')) || 'sortie', 'transports');
const only = args.includes('--ville') ? args[args.indexOf('--ville') + 1] : null;
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const UA = 'Iriscope-donnees/1.0 (transports urbains)';

// [identifiant, nom, latitude, longitude, rayon en km, site du réseau]
const CITIES = [
  ['paris', 'Paris et Île-de-France', 48.857, 2.352, 40, 'https://www.iledefrance-mobilites.fr'],
  ['lyon', 'Lyon', 45.76, 4.84, 20, 'https://www.tcl.fr'],
  ['marseille', 'Marseille', 43.297, 5.381, 18, 'https://www.rtm.fr'],
  ['lille', 'Lille', 50.63, 3.06, 18, 'https://www.ilevia.fr'],
  ['toulouse', 'Toulouse', 43.604, 1.444, 15, 'https://www.tisseo.fr'],
  ['rennes', 'Rennes', 48.111, -1.68, 10, 'https://www.star.fr'],
  ['bordeaux', 'Bordeaux', 44.84, -0.58, 18, 'https://www.infotbm.com'],
  ['nantes', 'Nantes', 47.218, -1.554, 15, 'https://naolib.fr'],
  ['strasbourg', 'Strasbourg', 48.583, 7.746, 15, 'https://www.cts-strasbourg.eu'],
  ['montpellier', 'Montpellier', 43.61, 3.877, 15, 'https://www.tam-voyages.com'],
  ['grenoble', 'Grenoble', 45.188, 5.725, 15, 'https://www.mobilites-m.fr'],
  ['nice', 'Nice', 43.70, 7.266, 15, 'https://www.lignesdazur.com'],
  ['brest', 'Brest', 48.39, -4.486, 10, 'https://www.bibus.fr'],
  ['angers', 'Angers', 47.47, -0.55, 10, 'https://www.irigo.fr'],
  ['le-mans', 'Le Mans', 48.0, 0.2, 10, 'https://www.setram.fr'],
  ['tours', 'Tours', 47.39, 0.69, 12, 'https://www.filbleu.fr'],
  ['orleans', 'Orléans', 47.90, 1.90, 12, 'https://www.reseau-tao.fr'],
  ['dijon', 'Dijon', 47.32, 5.04, 10, 'https://www.divia.fr'],
  ['reims', 'Reims', 49.258, 4.03, 10, 'https://www.citura.fr'],
  ['caen', 'Caen', 49.18, -0.37, 10, 'https://www.twisto.fr'],
  ['rouen', 'Rouen', 49.44, 1.10, 12, 'https://www.reseau-astuce.fr'],
  ['clermont-ferrand', 'Clermont-Ferrand', 45.78, 3.08, 12, 'https://www.t2c.fr'],
  ['saint-etienne', 'Saint-Étienne', 45.44, 4.39, 12, 'https://www.reseau-stas.fr'],
  ['mulhouse', 'Mulhouse', 47.75, 7.34, 15, 'https://www.solea.info'],
  ['nancy', 'Nancy', 48.69, 6.18, 12, ''],
  ['valenciennes', 'Valenciennes', 50.36, 3.52, 20, ''],
  ['besancon', 'Besançon', 47.24, 6.02, 10, 'https://www.ginko.voyage'],
  ['avignon', 'Avignon', 43.95, 4.81, 10, 'https://www.orizo.fr'],
  ['le-havre', 'Le Havre', 49.49, 0.11, 10, 'https://www.transports-lia.fr'],
  ['annemasse', 'Annemasse et Genève', 46.19, 6.24, 8, ''],
  ['saint-denis-reunion', 'Saint-Denis (La Réunion)', -20.88, 55.45, 12, ''],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function overpass(q) {
  let last;
  for (let k = 0; k < 6; k++) {
    const base = SERVERS[k % SERVERS.length];
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(q)}` });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.remark && /error|timed out/i.test(j.remark) && !(j.elements || []).length) throw new Error(j.remark);
      return j.elements || [];
    } catch (e) { last = e; console.log(`  ${base} : ${e.message}, nouvel essai`); await sleep(15000 * (k + 1)); }
  }
  throw last;
}
const r5 = v => Math.round(v * 1e5) / 1e5;
const km = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// Douglas-Peucker (en degrés, ~10 m) pour alléger les tracés
function simplify(pts, eps = 0.0001) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
    const d = dx || dy ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy) : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
const MODES = { subway: 'metro', light_rail: 'tram', tram: 'tram', monorail: 'metro', funicular: 'funiculaire', train: 'rer', aerialway: 'telepherique' };
const DEFAULT_COLOR = { metro: '#1C7ED6', tram: '#2B9A66', rer: '#7048E8', funiculaire: '#E8590C', telepherique: '#D6336C' };

async function city([slug, name, lat, lon, R, plan]) {
  const m = R * 1000;
  const routes = await overpass(`[out:json][timeout:300];(
relation["type"="route"]["route"~"^(subway|tram|light_rail|monorail|funicular)$"](around:${m},${lat},${lon});
relation["type"="route"]["route"="train"]["network"~"RER|Léman Express",i](around:${m},${lat},${lon});
relation["type"="route"]["route"="aerialway"](around:${m},${lat},${lon});
);out tags geom;`);
  await sleep(5000);
  // téléphériques urbains sans relation : les câbles eux-mêmes, près du centre seulement (pas les remontées des stations de ski)
  const cables = await overpass(`[out:json][timeout:120];way["aerialway"~"^(gondola|cable_car)$"]["name"](around:${Math.min(m, 8000)},${lat},${lon});out tags geom;`);
  await sleep(5000);
  const stopsEl = await overpass(`[out:json][timeout:180];(
node["railway"~"^(station|halt|tram_stop)$"]["name"](around:${m},${lat},${lon});
node["public_transport"="station"]["name"](around:${m},${lat},${lon});
node["aerialway"="station"]["name"](around:${Math.min(m, 8000)},${lat},${lon});
);out tags;`);

  const lines = new Map();
  const stopPts = []; // [lat, lon, lineId] des arrêts déclarés dans les lignes
  for (const r of routes) {
    const t = r.tags || {};
    const mode = MODES[t.route] || 'tram';
    const ref = (t.ref || '').trim();
    const net = (t.network || '').trim();
    const id = `${mode}-${(ref || t.name || r.id).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${net.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12)}`;
    if (!lines.has(id)) lines.set(id, { id, ref, name: (t.name || '').replace(/\s*:\s*.*$/, '').trim() || ref, mode, color: /^#?[0-9a-f]{3,6}$/i.test(t.colour || '') ? (t.colour[0] === '#' ? t.colour : `#${t.colour}`) : DEFAULT_COLOR[mode], net, ways: new Map() });
    const L = lines.get(id);
    for (const mb of r.members || []) {
      if (mb.type === 'way' && mb.geometry && !/platform/.test(mb.role || '')) L.ways.set(mb.ref, mb.geometry.map(g => [g.lat, g.lon]));
      if (mb.type === 'node' && mb.lat != null && /stop|platform/.test(mb.role || '')) stopPts.push([mb.lat, mb.lon, id]);
    }
  }
  for (const w of cables) {
    const t = w.tags || {};
    const id = `telepherique-${String(t.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if ([...lines.values()].some(l => l.mode === 'telepherique' && l.name === t.name)) continue;
    const g = (w.geometry || []).map(p => [p.lat, p.lon]);
    if (g.length < 2) continue;
    lines.set(id, { id, ref: '', name: t.name, mode: 'telepherique', color: DEFAULT_COLOR.telepherique, net: '', ways: new Map([[w.id, g]]) });
    stopPts.push([g[0][0], g[0][1], id], [g[g.length - 1][0], g[g.length - 1][1], id]);
  }
  const outLines = [...lines.values()].filter(l => l.ways.size).map(l => ({ id: l.id, ref: l.ref, name: l.name, mode: l.mode, color: l.color, net: l.net,
    paths: [...l.ways.values()].map(p => simplify(p).map(([a, b]) => [r5(a), r5(b)])) }));
  const keep = new Set(outLines.map(l => l.id));

  // Stations : un nœud nommé à moins de 150 m d'un arrêt d'une ligne ; les quais d'un même nom fusionnés (300 m)
  const stations = [];
  for (const s of stopsEl) {
    const n = (s.tags && s.tags.name || '').trim(); if (!n) continue;
    const l = [...new Set(stopPts.filter(p => keep.has(p[2]) && km(s.lat, s.lon, p[0], p[1]) < 0.15).map(p => p[2]))];
    if (!l.length) continue;
    const same = stations.find(x => x.n === n && km(x.lat, x.lon, s.lat, s.lon) < 0.3);
    if (same) { same.l = [...new Set([...same.l, ...l])]; continue; }
    stations.push({ n, lat: r5(s.lat), lon: r5(s.lon), l });
  }
  const data = { city: name, updated: new Date().toISOString(), plan, lines: outLines, stations };
  const txt = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, `${slug}.json`), txt);
  console.log(`${name} : ${outLines.length} lignes, ${stations.length} stations, ${Math.round(txt.length / 1024)} Ko`);
  return { slug, name, lat, lon, km: R, plan, lines: outLines.length, stations: stations.length, modes: [...new Set(outLines.map(l => l.mode))] };
}

fs.mkdirSync(OUT, { recursive: true });
// une ville en échec garde ses données de la semaine précédente (copiées dans le dossier avant le calcul)
let before = { cities: [] };
try { before = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); } catch (e) { /* première fois */ }
const index = { updated: new Date().toISOString(), source: '© contributeurs OpenStreetMap (ODbL)', cities: [] };
let failed = 0;
if (only) index.cities = before.cities.filter(x => x.slug !== only);
for (const c of CITIES.filter(c => !only || c[0] === only)) {
  try { const r = await city(c); if (r.lines) index.cities.push(r); }
  catch (e) {
    failed++; console.log(`${c[1]} : échec (${e.message})`);
    const old = before.cities.find(x => x.slug === c[0]);
    if (old && fs.existsSync(path.join(OUT, `${c[0]}.json`))) { index.cities.push(old); console.log('  données précédentes gardées'); }
  }
  await sleep(10000);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`Terminé : ${index.cities.length} villes, ${failed} échecs`);
if (!index.cities.length) process.exit(1);
