// Retards, suppressions et alertes SNCF en temps réel (GTFS-RT, data.gouv.fr « Horaires SNCF », ODbL, sans clé), en JSON lisible par l'appli.
// Usage : node outils/trains-direct.mjs <sortie>  → <sortie>/trains/direct.json
import fs from 'node:fs';
import path from 'node:path';
import { decodeFeed, EFFECTS } from './gtfsrt.mjs';

const OUT = path.join(process.argv[2] || 'sortie', 'trains');
fs.mkdirSync(OUT, { recursive: true });
const URLS = { tu: 'https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-trip-updates', sa: 'https://proxy.transport.data.gouv.fr/resource/sncf-gtfs-rt-service-alerts' };
async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'iriscope-trains/1.0' }, signal: AbortSignal.timeout(60000) });
  console.log(`${url} : HTTP ${res.status}, ${res.headers.get('content-type')}, CORS ${res.headers.get('access-control-allow-origin') || 'absent'}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
const out = { updated: new Date().toISOString(), licence: 'SNCF Voyageurs (ODbL), data.gouv.fr', trips: [], alerts: [] };
try {
  const b = await get(URLS.tu); const f = decodeFeed(b);
  console.log(`Temps réel : ${b.length} octets, ${f.trips.length} trains suivis, ${f.trips.filter(t => t.canceled).length} supprimés, ${f.trips.filter(t => t.delayMin >= 5).length} avec 5 min de retard ou plus`);
  out.trips = f.trips.filter(t => t.canceled || t.delayMin >= 5 || t.skipped.length).map(t => ({ id: t.tripId, d: t.date, x: t.canceled ? 1 : 0, r: t.delayMin, sk: t.skipped.length ? t.skipped : undefined }));
  console.log('  exemples :', f.trips.slice(0, 3).map(t => `${t.tripId} ${t.date} ${t.canceled ? 'supprimé' : `+${t.delayMin} min`}`).join(' | '));
} catch (e) { console.log('Trip updates indisponibles :', e.message); }
try {
  const b = await get(URLS.sa); const f = decodeFeed(b);
  console.log(`Alertes : ${b.length} octets, ${f.alerts.length} alertes`);
  out.alerts = f.alerts.map(a => ({ id: a.id, e: a.effect, h: a.title.slice(0, 200), t: a.text.slice(0, 600), from: a.from, to: a.to, trips: a.trips.length ? a.trips : undefined, stops: a.stops.length ? a.stops : undefined, routes: a.routes.length ? a.routes : undefined }));
  for (const a of f.alerts.slice(0, 5)) console.log(`  ex. [${EFFECTS[a.effect] || a.effect}] ${a.title.slice(0, 90)} · trains ${a.trips.slice(0, 2).join(',')} · arrêts ${a.stops.slice(0, 2).join(',')}`);
} catch (e) { console.log('Alertes indisponibles :', e.message); }
fs.writeFileSync(path.join(OUT, 'direct.json'), JSON.stringify(out));
console.log(`direct.json : ${out.trips.length} trains perturbés, ${out.alerts.length} alertes`);
