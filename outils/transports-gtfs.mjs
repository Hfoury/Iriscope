// Transports urbains d'après les fichiers officiels des réseaux (GTFS) publiés sur transport.data.gouv.fr (0.41.0).
// Remplace la lecture d'OpenStreetMap, dont les serveurs publics gratuits sont trop souvent saturés.
// Licences : Licence Ouverte ou ODbL selon le réseau (usage commercial permis, source à citer) ; la licence de chaque ville est notée.
// Même résultat que outils/transports.mjs, lu tel quel par l'appli :
// <dossier>/transports/<ville>.json { city, updated, plan, source, licence, lines: [{ id, ref, name, mode, color, net, paths }], stations: [{ n, lat, lon, l }] }
// <dossier>/transports/index.json { updated, source, cities: [{ slug, name, lat, lon, km, plan, lines, stations, modes }] }
// Usage : node outils/transports-gtfs.mjs sortie [--ville rennes]
// Besoins : node 22 et la commande unzip (présente sur les machines GitHub).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const OUT = path.join(args.find(a => !a.startsWith('--')) || 'sortie', 'transports');
const only = args.includes('--ville') ? args[args.indexOf('--ville') + 1] : null;
const UA = 'Iriscope-donnees/1.0 (transports urbains)';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfs-'));

// [identifiant, nom, latitude, longitude, rayon en km, site du réseau, mots qui désignent le réseau sur transport.data.gouv.fr]
const CITIES = [
  ['paris', 'Paris et Île-de-France', 48.857, 2.352, 40, 'https://www.iledefrance-mobilites.fr', ['ile-de-france mobilites', 'idfm', 'ile de france']],
  ['lyon', 'Lyon', 45.76, 4.84, 20, 'https://www.tcl.fr', ['tcl', 'sytral', 'lyon']],
  ['marseille', 'Marseille', 43.297, 5.381, 18, 'https://www.rtm.fr', ['rtm', 'marseille']],
  ['lille', 'Lille', 50.63, 3.06, 18, 'https://www.ilevia.fr', ['ilevia', 'lille']],
  ['toulouse', 'Toulouse', 43.604, 1.444, 15, 'https://www.tisseo.fr', ['tisseo', 'toulouse']],
  ['rennes', 'Rennes', 48.111, -1.68, 10, 'https://www.star.fr', ['star', 'rennes']],
  ['bordeaux', 'Bordeaux', 44.84, -0.58, 18, 'https://www.infotbm.com', ['tbm', 'bordeaux']],
  ['nantes', 'Nantes', 47.218, -1.554, 15, 'https://naolib.fr', ['naolib', 'tan', 'nantes']],
  ['strasbourg', 'Strasbourg', 48.583, 7.746, 15, 'https://www.cts-strasbourg.eu', ['cts', 'strasbourg']],
  ['montpellier', 'Montpellier', 43.61, 3.877, 15, 'https://www.tam-voyages.com', ['tam', 'montpellier']],
  ['grenoble', 'Grenoble', 45.188, 5.725, 15, 'https://www.mobilites-m.fr', ['tag', 'm reso', 'grenoble']],
  ['nice', 'Nice', 43.70, 7.266, 15, 'https://www.lignesdazur.com', ['lignes d\'azur', 'nice']],
  ['brest', 'Brest', 48.39, -4.486, 10, 'https://www.bibus.fr', ['bibus', 'brest']],
  ['angers', 'Angers', 47.47, -0.55, 10, 'https://www.irigo.fr', ['irigo', 'angers']],
  ['le-mans', 'Le Mans', 48.0, 0.2, 10, 'https://www.setram.fr', ['setram', 'le mans']],
  ['tours', 'Tours', 47.39, 0.69, 12, 'https://www.filbleu.fr', ['fil bleu', 'filbleu', 'tours']],
  ['orleans', 'Orléans', 47.90, 1.90, 12, 'https://www.reseau-tao.fr', ['tao', 'orleans']],
  ['dijon', 'Dijon', 47.32, 5.04, 10, 'https://www.divia.fr', ['divia', 'dijon']],
  ['reims', 'Reims', 49.258, 4.03, 10, 'https://www.citura.fr', ['citura', 'reims']],
  ['caen', 'Caen', 49.18, -0.37, 10, 'https://www.twisto.fr', ['twisto', 'caen']],
  ['rouen', 'Rouen', 49.44, 1.10, 12, 'https://www.reseau-astuce.fr', ['astuce', 'rouen']],
  ['clermont-ferrand', 'Clermont-Ferrand', 45.78, 3.08, 12, 'https://www.t2c.fr', ['t2c', 'clermont']],
  ['saint-etienne', 'Saint-Étienne', 45.44, 4.39, 12, 'https://www.reseau-stas.fr', ['stas', 'saint-etienne', 'saint etienne']],
  ['mulhouse', 'Mulhouse', 47.75, 7.34, 15, 'https://www.solea.info', ['solea', 'mulhouse']],
  ['nancy', 'Nancy', 48.69, 6.18, 12, '', ['stan', 'nancy']],
  ['valenciennes', 'Valenciennes', 50.36, 3.52, 20, '', ['transvilles', 'valenciennes']],
  ['besancon', 'Besançon', 47.24, 6.02, 10, 'https://www.ginko.voyage', ['ginko', 'besancon']],
  ['avignon', 'Avignon', 43.95, 4.81, 10, 'https://www.orizo.fr', ['orizo', 'avignon']],
  ['le-havre', 'Le Havre', 49.49, 0.11, 10, 'https://www.transports-lia.fr', ['lia', 'le havre']],
  ['annemasse', 'Annemasse et Genève', 46.19, 6.24, 8, '', ['tac', 'annemasse', 'leman express']],
  ['saint-denis-reunion', 'Saint-Denis (La Réunion)', -20.88, 55.45, 12, '', ['citalis', 'saint-denis']],
];

const DEFAULT_COLOR = { metro: '#1C7ED6', tram: '#2B9A66', rer: '#7048E8', funiculaire: '#E8590C', telepherique: '#D6336C' };
// types de ligne GTFS (simples et étendus) gardés ; le reste (bus, car, train régional) est laissé de côté
function modeOf(type, short, slug) {
  const t = Number(type);
  if (t === 0 || t === 5 || (t >= 900 && t < 1000)) return 'tram';
  if (t === 1 || t === 12 || (t >= 400 && t < 500) || t === 401 || t === 402) return 'metro';
  if (t === 6 || (t >= 1300 && t < 1400)) return 'telepherique';
  if (t === 7 || (t >= 1400 && t < 1500)) return 'funiculaire';
  if ((t === 2 || t === 109 || (t >= 100 && t < 200)) && (slug === 'paris' ? /^(RER\s*)?[A-E]$/i.test(short || '') : /l[ée]man/i.test(short || ''))) return 'rer';
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r5 = v => Math.round(v * 1e5) / 1e5;
const km = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const h = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9']+/g, ' ');
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

// ---------- lecture d'un CSV GTFS en flux (stop_times et shapes peuvent peser plusieurs Go) ----------
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
function zipHas(zip, name) {
  try { return execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').map(s => s.trim()).find(s => s === name || s.endsWith(`/${name}`)) || null; }
  catch (e) { return null; }
}
async function eachRow(zip, name, fn) {
  const entry = zipHas(zip, name);
  if (!entry) return false;
  const p = spawn('unzip', ['-p', zip, entry]);
  const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    const line = head ? raw : raw.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const cells = splitCsv(line);
    if (!head) { head = cells.map(h => h.trim()); continue; }
    const row = {}; head.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    if (fn(row) === false) { p.kill(); break; }
  }
  return true;
}

// ---------- recherche des jeux de données ----------
async function getJson(url) {
  for (let k = 0; k < 4; k++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    catch (e) { console.log(`  ${url} : ${e.message}, nouvel essai`); await sleep(5000 * (k + 1)); }
  }
  throw new Error(`${url} injoignable`);
}
async function download(url, file) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) { console.log(`  téléchargement ${e.message}, nouvel essai`); await sleep(5000 * (k + 1)); }
  }
  throw new Error('téléchargement impossible');
}
const URBAN = /tram|metro|subway|funicul|cable|telepher|aerial|rail|monorail/i;
function candidates(datasets, c) {
  const [, name, , , , , words] = c;
  const out = [];
  for (const d of datasets) {
    if (d.type && d.type !== 'public-transit') continue;
    const where = norm(`${d.title} ${JSON.stringify(d.covered_area || '')} ${JSON.stringify(d.aom || '')} ${(d.publisher && d.publisher.name) || ''}`);
    const hit = [norm(name), ...words.map(norm)].some(w => w.trim().length > 2 && new RegExp(`(^| )${w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(where));
    if (!hit) continue;
    for (const r of d.resources || []) {
      if (!/gtfs/i.test(r.format || '') || /rt|realtime|temps/i.test(r.format.replace(/gtfs/i, ''))) continue;
      if (r.is_available === false) continue;
      const modes = JSON.stringify((r.metadata && r.metadata.modes) || r.modes || '');
      out.push({ url: r.url || r.original_url, title: `${d.title} · ${r.title || ''}`, licence: d.licence || '', urban: URBAN.test(modes), unknown: modes.length < 5, size: r.filesize || 0 });
    }
  }
  // d'abord ceux qui annoncent un tram, un métro ou un téléphérique, puis ceux qui ne disent rien
  return out.filter(x => x.urban || x.unknown).sort((a, b) => (b.urban - a.urban) || (a.size - b.size)).slice(0, 4);
}

// ---------- calcul d'une ville à partir d'un GTFS ----------
async function readGtfs(zip, c) {
  const [slug, , lat, lon, R] = c;
  const routes = new Map();
  await eachRow(zip, 'routes.txt', r => {
    const mode = modeOf(r.route_type, r.route_short_name, slug);
    if (!mode) return;
    const col = /^[0-9a-f]{6}$/i.test(r.route_color || '') ? `#${r.route_color}` : DEFAULT_COLOR[mode];
    routes.set(r.route_id, { mode, ref: r.route_short_name || '', name: r.route_long_name || r.route_short_name || '', color: col, net: r.agency_id || '' });
  });
  if (!routes.size) return null;
  // un voyage par tracé (ou par sens) suffit pour dessiner la ligne
  const reps = new Map(); // trip_id -> route_id
  const seen = new Set();
  const shapeOf = new Map(); // trip_id -> shape_id
  await eachRow(zip, 'trips.txt', t => {
    if (!routes.has(t.route_id)) return;
    const k = t.shape_id ? `s:${t.shape_id}` : `r:${t.route_id}:${t.direction_id || 0}`;
    if (seen.has(k)) return;
    seen.add(k); reps.set(t.trip_id, t.route_id); if (t.shape_id) shapeOf.set(t.trip_id, t.shape_id);
  });
  const tripStops = new Map(); // trip_id -> [[seq, stop_id]]
  await eachRow(zip, 'stop_times.txt', s => {
    if (!reps.has(s.trip_id)) return;
    if (!tripStops.has(s.trip_id)) tripStops.set(s.trip_id, []);
    tripStops.get(s.trip_id).push([Number(s.stop_sequence), s.stop_id]);
  });
  const stops = new Map();
  await eachRow(zip, 'stops.txt', s => { stops.set(s.stop_id, { n: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon), parent: s.parent_station || '' }); });
  const wanted = new Set(shapeOf.values());
  const shapes = new Map();
  if (wanted.size) await eachRow(zip, 'shapes.txt', p => {
    if (!wanted.has(p.shape_id)) return;
    if (!shapes.has(p.shape_id)) shapes.set(p.shape_id, []);
    shapes.get(p.shape_id).push([Number(p.shape_pt_sequence), Number(p.shape_pt_lat), Number(p.shape_pt_lon)]);
  });

  const lines = new Map();
  const stationPts = [];
  const lineId = r => `${r.mode}-${norm(r.ref || r.name).trim().replace(/ +/g, '-')}-${norm(r.net).replace(/ /g, '').slice(0, 12)}`;
  for (const [trip, rid] of reps) {
    const r = routes.get(rid);
    const seq = (tripStops.get(trip) || []).sort((a, b) => a[0] - b[0]).map(x => stops.get(x[1])).filter(Boolean);
    let pts = shapeOf.has(trip) && shapes.get(shapeOf.get(trip)) ? shapes.get(shapeOf.get(trip)).sort((a, b) => a[0] - b[0]).map(p => [p[1], p[2]]) : seq.map(s => [s.lat, s.lon]);
    // seulement ce qui passe dans le rayon de la ville
    if (!pts.some(p => km(lat, lon, p[0], p[1]) <= R)) continue;
    pts = pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) continue;
    const id = lineId(r);
    if (!lines.has(id)) lines.set(id, { id, ref: r.ref, name: r.name, mode: r.mode, color: r.color, net: r.net, paths: [] });
    const L = lines.get(id);
    const simple = simplify(pts).map(([a, b]) => [r5(a), r5(b)]);
    const sig = JSON.stringify([simple[0], simple[simple.length - 1], simple.length]);
    if (!L.sigs) L.sigs = new Set();
    if (!L.sigs.has(sig)) { L.sigs.add(sig); L.paths.push(simple); }
    for (const s of seq) {
      const p = s.parent && stops.get(s.parent) ? stops.get(s.parent) : s;
      stationPts.push({ n: p.n, lat: p.lat, lon: p.lon, id });
    }
  }
  if (!lines.size) return null;
  const stations = [];
  for (const s of stationPts) {
    if (!s.n || !Number.isFinite(s.lat)) continue;
    const same = stations.find(x => x.n === s.n && km(x.lat, x.lon, s.lat, s.lon) < 0.3);
    if (same) { if (!same.l.includes(s.id)) same.l.push(s.id); continue; }
    stations.push({ n: s.n, lat: r5(s.lat), lon: r5(s.lon), l: [s.id] });
  }
  return { lines: [...lines.values()].map(({ sigs, ...l }) => l), stations };
}

async function city(c, datasets) {
  const [slug, name, lat, lon, R, plan] = c;
  const cand = candidates(datasets, c);
  console.log(`${name} : ${cand.length} fichier(s) candidat(s)`);
  const lines = new Map(); const stations = []; const sources = []; const licences = new Set();
  for (const [i, x] of cand.entries()) {
    console.log(`  essai : ${x.title} (${x.licence || 'licence ?'})`);
    const zip = path.join(TMP, `${slug}-${i}.zip`);
    try {
      await download(x.url, zip);
      const res = await readGtfs(zip, c);
      if (!res) { console.log('  pas de tram, métro, RER ou téléphérique dans ce fichier'); continue; }
      for (const l of res.lines) if (!lines.has(l.id)) lines.set(l.id, l);
      for (const s of res.stations) {
        const same = stations.find(y => y.n === s.n && km(y.lat, y.lon, s.lat, s.lon) < 0.3);
        if (same) same.l = [...new Set([...same.l, ...s.l])]; else stations.push(s);
      }
      sources.push(x.title); if (x.licence) licences.add(x.licence);
      console.log(`  ${res.lines.length} lignes, ${res.stations.length} stations`);
    } catch (e) { console.log(`  échec : ${e.message}`); }
    finally { fs.rmSync(zip, { force: true }); }
  }
  if (!lines.size) throw new Error('aucune ligne lue');
  const keep = new Set(lines.keys());
  const st = stations.map(s => ({ ...s, l: s.l.filter(id => keep.has(id)) })).filter(s => s.l.length);
  const data = { city: name, updated: new Date().toISOString(), plan, source: sources.join(' ; '), licence: [...licences].join(', '), lines: [...lines.values()], stations: st };
  const txt = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, `${slug}.json`), txt);
  console.log(`${name} : ${lines.size} lignes, ${st.length} stations, ${Math.round(txt.length / 1024)} Ko`);
  return { slug, name, lat, lon, km: R, plan, lines: lines.size, stations: st.length, modes: [...new Set([...lines.values()].map(l => l.mode))] };
}

fs.mkdirSync(OUT, { recursive: true });
let before = { cities: [] };
try { before = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); } catch (e) { /* première fois */ }
const index = { updated: new Date().toISOString(), source: 'Réseaux de transport, via transport.data.gouv.fr (Licence Ouverte ou ODbL)', cities: [] };
const datasets = await getJson('https://transport.data.gouv.fr/api/datasets');
console.log(`${datasets.length} jeux de données sur transport.data.gouv.fr`);
let failed = 0;
if (only) index.cities = (before.cities || []).filter(x => x.slug !== only);
for (const c of CITIES.filter(c => !only || c[0] === only)) {
  try { index.cities.push(await city(c, datasets)); }
  catch (e) {
    failed++; console.log(`${c[1]} : échec (${e.message})`);
    const old = (before.cities || []).find(x => x.slug === c[0]);
    if (old && fs.existsSync(path.join(OUT, `${c[0]}.json`))) { index.cities.push(old); console.log('  données précédentes gardées'); }
  }
}
fs.rmSync(TMP, { recursive: true, force: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
console.log(`Terminé : ${index.cities.length} villes, ${failed} échecs`);
if (!index.cities.length) process.exit(1);
