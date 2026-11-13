// Alertes et risques (0.41.0), recalculés toutes les heures et publiés sur la branche « risques » (lue par l'appli).
// Ces sources ne sont pas lisibles directement depuis la version web (pas d'en-tête CORS) ou sont trop lourdes pour un téléphone.
// - Vigicrues (Licence Ouverte) : tronçons de rivière de métropole en vigilance jaune, orange ou rouge, avec un tracé allégé ;
// - Météo des forêts de Météo-France (Licence Ouverte, données ouvertes, l'été) : niveau de danger d'incendie par département, aujourd'hui et demain ;
// - cyclones : centre national des ouragans américain (NHC, domaine public) pour les Antilles et la Guyane,
//   et GDACS (Commission européenne) pour l'océan Indien (La Réunion, Mayotte) et le Pacifique.
// Résultat : <dossier>/risques/index.json { updated, crues: [...], forets: { date, deps: { '56': [j1, j2] } }, cyclones: [...] }
// Une source en panne garde ses données de l'heure précédente.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const OUT = path.join(args.find(a => !a.startsWith('--')) || 'sortie', 'risques');
const oldFile = args.includes('--ancien') ? args[args.indexOf('--ancien') + 1] : null;
const UA = 'Iriscope-donnees/1.0 (alertes)';
const r4 = v => Math.round(v * 1e4) / 1e4;
async function get(url, asJson = true) {
  let last;
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: asJson ? 'application/json' : '*/*' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return asJson ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 4000 * (k + 1))); }
  }
  throw last;
}
let before = {};
try { before = JSON.parse(fs.readFileSync(oldFile, 'utf8')); } catch (e) { /* première fois */ }

// ---------- crues ----------
// tracé réduit à 25 points au plus : assez pour savoir si une rivière passe près d'une zone
function thin(coords, max = 25) {
  const flat = [];
  const walk = c => { if (typeof c[0] === 'number') flat.push([r4(c[1]), r4(c[0])]); else c.forEach(walk); };
  walk(coords);
  if (flat.length <= max) return flat;
  const step = (flat.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => flat[Math.round(i * step)]);
}
async function crues() {
  const j = await get('https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.geojson');
  const out = [];
  for (const f of j.features || []) {
    const p = f.properties || {};
    const level = Number(p.NivInfViCr) || 1;
    if (level < 2 || !f.geometry) continue;
    out.push({ id: p.CdEntCru || p.id, name: p.lbentcru || '', level, pts: thin(f.geometry.coordinates) });
  }
  console.log(`Crues : ${j.features.length} tronçons lus, ${out.length} en vigilance jaune ou plus`);
  return out;
}

// ---------- feux de forêt ----------
async function forets() {
  const y = new Date().getUTCFullYear();
  const txt = gunzipSync(await get(`https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF/mdf_${y}.csv.gz`, false)).toString('utf8');
  const rows = txt.split('\n').slice(1).map(l => l.split(';')).filter(r => r.length >= 4);
  if (!rows.length) return { date: null, deps: {} };
  const last = rows.reduce((m, r) => r[0] > m ? r[0] : m, '');
  const deps = {};
  for (const r of rows) if (r[0] === last) deps[r[1]] = [Number(r[2]) || 1, Number(r[3]) || 1];
  // bulletin trop vieux (fin de saison) : rien à afficher
  const fresh = Date.now() - new Date(last).getTime() < 36 * 3600000;
  console.log(`Feux de forêt : bulletin du ${last}, ${Object.keys(deps).length} départements${fresh ? '' : ' (hors saison, ignoré)'}`);
  return { date: last, deps: fresh ? deps : {} };
}

// ---------- cyclones ----------
async function cyclones() {
  const out = [];
  try {
    const j = await get('https://www.nhc.noaa.gov/CurrentStorms.json');
    for (const s of j.activeStorms || []) out.push({ id: `nhc-${s.id}`, name: s.name, kind: s.classification, lat: Number(s.latitudeNumeric), lon: Number(s.longitudeNumeric), wind: s.intensity ? Math.round(Number(s.intensity) * 1.852) : null, src: 'NHC (NOAA)', url: 'https://www.nhc.noaa.gov' });
  } catch (e) { console.log(`NHC : ${e.message}`); }
  try {
    const j = await get('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC');
    for (const f of j.features || []) {
      const p = f.properties || {};
      if (p.iscurrent === 'false' || p.iscurrent === false) continue;
      const c = f.geometry && f.geometry.coordinates;
      out.push({ id: `gdacs-${p.eventid}`, name: p.eventname || p.name, kind: p.alertlevel, lat: c ? c[1] : null, lon: c ? c[0] : null, wind: null, src: 'GDACS', url: (p.url && p.url.report) || 'https://www.gdacs.org' });
    }
  } catch (e) { console.log(`GDACS : ${e.message}`); }
  console.log(`Cyclones en cours : ${out.length}`);
  return out;
}

const res = { updated: new Date().toISOString(), source: 'Vigicrues, Météo-France (Licence Ouverte), NHC (domaine public), GDACS' };
for (const [k, f] of [['crues', crues], ['forets', forets], ['cyclones', cyclones]]) {
  try { res[k] = await f(); }
  catch (e) { console.log(`${k} : échec (${e.message}), données précédentes gardées`); res[k] = before[k] || (k === 'forets' ? { date: null, deps: {} } : []); }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(res));
console.log(`Terminé : ${Math.round(JSON.stringify(res).length / 1024)} Ko`);
