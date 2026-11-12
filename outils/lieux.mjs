// Découpage nocturne des deux référentiels de lieux (dépôts BOULANGERIES-FRANCE et STATIONS-TOTAL-FRANCE, lus sans les modifier).
// Sources : OpenStreetMap (ODbL, à citer) et prix des carburants du ministère de l'Économie (Licence Ouverte).
// Résultat : <dossier>/lieux/boulangeries/<lat>_<lon>.json et <dossier>/lieux/stations/<lat>_<lon>.json,
// des tuiles d'un demi-degré (comme les événements) que l'appli charge selon la position des secteurs, + <dossier>/lieux/index.json
// Usage : node outils/lieux.mjs sortie
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.argv[2] || 'sortie', 'lieux');
const RAW = 'https://raw.githubusercontent.com/Hfoury';
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const tile = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const r5 = v => Math.round(v * 1e5) / 1e5;
async function get(url) {
  for (let k = 0; ; k++) {
    try { const res = await fetch(url); if (res.ok) return await res.json(); throw new Error(`HTTP ${res.status}`); }
    catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 5000 * (k + 1))); }
  }
}
const place = x => [clean(x.adresse), [clean(x.code_postal), clean(x.commune)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
function write(kind, items, updated) {
  const by = {};
  for (const it of items) (by[tile(it.lat, it.lon)] ||= []).push(it);
  fs.mkdirSync(path.join(OUT, kind), { recursive: true });
  let max = 0;
  for (const [t, list] of Object.entries(by)) {
    const txt = JSON.stringify({ updated, items: list });
    max = Math.max(max, txt.length);
    fs.writeFileSync(path.join(OUT, kind, `${t}.json`), txt);
  }
  console.log(`${kind} : ${items.length} lieux, ${Object.keys(by).length} tuiles, la plus lourde ${Math.round(max / 1024)} Ko`);
  return { count: items.length, tiles: Object.keys(by).length };
}

const index = { updated: new Date().toISOString() };
const ok = x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude);

const b = await get(`${RAW}/BOULANGERIES-FRANCE/main/data/boulangeries.json`);
index.boulangeries = write('boulangeries', (b.items || []).filter(ok).map(x => {
  const o = { id: clean(x.id), n: clean(x.nom), lat: r5(x.latitude), lon: r5(x.longitude) };
  const a = place(x); if (a) o.a = a;
  if (clean(x.horaires)) o.h = clean(x.horaires).slice(0, 160);
  if (clean(x.telephone)) o.tel = clean(x.telephone).slice(0, 40);
  if (/^https?:\/\//.test(clean(x.site))) o.w = clean(x.site).slice(0, 200);
  return o;
}), b.generated_at || index.updated);

const s = await get(`${RAW}/STATIONS-TOTAL-FRANCE/main/data/stations_total.json`);
const FUELS = ['gazole', 'sp95', 'e10', 'sp98', 'e85', 'gplc'];
index.stations = write('stations', (s.items || []).filter(ok).map(x => {
  const o = { id: clean(x.osm_id), n: clean(x.nom), e: clean(x.enseigne), lat: r5(x.latitude), lon: r5(x.longitude) };
  const a = place(x); if (a) o.a = a;
  if (clean(x.horaires)) o.h = clean(x.horaires).slice(0, 160);
  const p = {}; let maj = '';
  for (const f of FUELS) if (typeof x[`${f}_prix`] === 'number') { p[f] = x[`${f}_prix`]; if (String(x[`${f}_maj`] || '') > maj) maj = String(x[`${f}_maj`]); }
  if (Object.keys(p).length) { o.p = p; o.maj = maj.slice(0, 16); }
  return o;
}), s.generated_at || index.updated);

if (index.boulangeries.count < 10000 || index.stations.count < 1000) { console.error('Fichiers source anormalement petits : rien n\'est publié.'); process.exit(3); }
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, '..', 'README.md'), `Lieux publiés automatiquement pour l'appli Iriscope.\n\nBoulangeries et stations : © les contributeurs d'OpenStreetMap (ODbL). Prix des carburants : ministère de l'Économie (Licence Ouverte). Mise à jour : ${index.updated}.\n`);
