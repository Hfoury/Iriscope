// Trains (0.35.0, rubrique « Mes trains » de l'appli) : horaires théoriques SNCF (TER, Intercités, TGV INOUI, OUIGO) allégés chaque nuit.
// Source : « Horaires SNCF » sur data.gouv.fr (SNCF Voyageurs, licence ODbL, gratuit et sans clé), fichier GTFS
//   https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip
// Résultat dans <sortie>/trains/ :
//   gares.json            [{ id (code UIC), n (nom), lat, lon }]
//   gares/<uic>.json      { start (AAAAMMJJ), days, items: [{ num, k (TER, TGV…), t (heure de passage), d (jours de circulation
//                           sur 'days' jours à partir de start, chaîne de 0/1), s: [[uic, heure], …] (arrêts suivants), tid: [trip_id…] }] }
// Usage : node outils/trains.mjs <dossier GTFS décompressé> <sortie> [--jours 45]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [SRC, OUT0] = process.argv.slice(2);
const DAYS = Number((process.argv.find((a, i) => process.argv[i - 1] === '--jours')) || 45);
const OUT = path.join(OUT0 || 'sortie', 'trains');
fs.mkdirSync(path.join(OUT, 'gares'), { recursive: true });

function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
async function eachRow(file, fn) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) { console.log(`(pas de ${file})`); return; }
  const rl = readline.createInterface({ input: fs.createReadStream(p, 'utf8'), crlfDelay: Infinity });
  let head = null, n = 0;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line.trim()) continue;
    const cells = splitCsv(line);
    if (!head) { head = cells.map(h => h.trim()); console.log(`${file} : ${head.join(', ')}`); continue; }
    const row = {}; head.forEach((h, i) => { row[h] = cells[i]; });
    fn(row); n++;
  }
  console.log(`  ${n} lignes`);
}
const uicOf = id => { const m = String(id || '').match(/(\d{8})\s*$/); return m ? m[1] : null; };
const kindOf = (stopId, route) => {
  const s = `${stopId} ${route || ''}`.toUpperCase();
  return /OUIGO/.test(s) ? 'OUIGO' : /INOUI|TGV|LYRIA|TER?GV/.test(s) && !/TER\b/.test(s) ? 'TGV' : /INTERCIT|\bIC\b|ICN/.test(s) ? 'Intercités' : /CAR|AUTOCAR/.test(s) ? 'Car' : 'TER';
};

/* ---------- gares ---------- */
const gares = {};
await eachRow('stops.txt', r => {
  const uic = uicOf(r.stop_id); if (!uic) return;
  const g = gares[uic] || (gares[uic] = { id: uic, n: '', lat: 0, lon: 0 });
  if (/StopArea/i.test(r.stop_id) || !g.n) { g.n = (r.stop_name || '').trim(); g.lat = Math.round(Number(r.stop_lat) * 1e4) / 1e4; g.lon = Math.round(Number(r.stop_lon) * 1e4) / 1e4; }
});

/* ---------- jours de circulation ---------- */
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const dayIndex = {}; for (let i = 0; i < DAYS; i++) dayIndex[ymd(new Date(today.getTime() + i * 86400000))] = i;
const services = {};
const svc = id => services[id] || (services[id] = new Uint8Array(DAYS));
await eachRow('calendar.txt', r => {
  const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const a = svc(r.service_id);
  for (const [k, i] of Object.entries(dayIndex)) {
    if (k < r.start_date || k > r.end_date) continue;
    const d = new Date(`${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}T12:00:00Z`);
    if (r[wd[d.getUTCDay()]] === '1') a[i] = 1;
  }
});
await eachRow('calendar_dates.txt', r => { const i = dayIndex[r.date]; if (i == null) return; svc(r.service_id)[i] = r.exception_type === '1' ? 1 : 0; });

/* ---------- trains ---------- */
const routes = {};
await eachRow('routes.txt', r => { routes[r.route_id] = `${r.route_short_name || ''} ${r.route_long_name || ''} ${r.agency_id || ''}`; });
const trips = {};
await eachRow('trips.txt', r => {
  const days = services[r.service_id];
  if (!days || !days.some(Boolean)) return;
  trips[r.trip_id] = { num: (r.trip_short_name || r.trip_headsign || '').trim(), route: routes[r.route_id] || '', days, stops: [] };
});
console.log(`${Object.keys(trips).length} trains circulent dans les ${DAYS} prochains jours`);
const hm = t => { const [h, m] = String(t || '').split(':'); return h ? `${String(Number(h) % 24).padStart(2, '0')}:${m}` : ''; };
await eachRow('stop_times.txt', r => {
  const t = trips[r.trip_id]; if (!t) return;
  const uic = uicOf(r.stop_id); if (!uic) return;
  if (!t.kind) t.kind = kindOf(r.stop_id, t.route);
  t.stops.push([Number(r.stop_sequence), uic, hm(r.departure_time || r.arrival_time), hm(r.arrival_time || r.departure_time)]);
});

/* ---------- regroupement : même numéro, mêmes arrêts et horaires, jours fusionnés ---------- */
const patterns = {};
for (const [tid, t] of Object.entries(trips)) {
  if (t.stops.length < 2) continue;
  t.stops.sort((a, b) => a[0] - b[0]);
  const key = `${t.num}|${t.stops.map(s => `${s[1]}@${s[2]}`).join(',')}`;
  const p = patterns[key] || (patterns[key] = { num: t.num, k: t.kind, stops: t.stops, days: new Uint8Array(DAYS), tid: [] });
  t.days.forEach((v, i) => { if (v) p.days[i] = 1; });
  if (p.tid.length < 6) p.tid.push(tid);
}
const byStation = {};
for (const p of Object.values(patterns)) {
  const d = Array.from(p.days).join('').replace(/0+$/, '');
  p.stops.forEach((s, i) => {
    if (i === p.stops.length - 1) return; // terminus : on n'y monte pas
    (byStation[s[1]] ||= []).push({ num: p.num, k: p.k, t: s[2], d, s: p.stops.slice(i + 1).map(x => [x[1], x[3]]), tid: p.tid });
  });
}
let max = 0, maxG = '', total = 0;
for (const [uic, list] of Object.entries(byStation)) {
  list.sort((a, b) => a.t.localeCompare(b.t));
  const txt = JSON.stringify({ start: ymd(today), days: DAYS, licence: 'Horaires SNCF Voyageurs (ODbL), data.gouv.fr', items: list });
  total += txt.length; if (txt.length > max) { max = txt.length; maxG = uic; }
  fs.writeFileSync(path.join(OUT, 'gares', `${uic}.json`), txt);
}
const list = Object.values(gares).filter(g => byStation[g.id]).sort((a, b) => a.n.localeCompare(b.n, 'fr'));
fs.writeFileSync(path.join(OUT, 'gares.json'), JSON.stringify(list));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), gares: list.length, trains: Object.keys(patterns).length }));
console.log(`${list.length} gares desservies, ${Object.keys(patterns).length} trains distincts ; ${Math.round(total / 1e6)} Mo en tout, la plus lourde ${Math.round(max / 1024)} Ko (${(gares[maxG] || {}).n || maxG})`);
const ex = (byStation['87393009'] || byStation[Object.keys(byStation)[0]] || []).slice(0, 3);
for (const e of ex) console.log(`  ex. ${e.k} ${e.num} à ${e.t} → ${e.s.slice(-1)[0].join(' ')} · ${e.tid[0]}`);
