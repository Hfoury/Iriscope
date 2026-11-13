// Avis de la communauté Iriscope : regroupe toutes les 3 heures les avis envoyés sur le sujet ntfy public (gardés 12 h par ntfy)
// dans un fichier durable, publié sur la branche « avis » (avis/index.json) et lu par l'appli.
// Un avis par téléphone et par sortie (le plus récent remplace l'ancien). Un avis signalé par deux téléphones différents est masqué.
// Usage : node outils/avis.mjs sortie [--ancien ancien-index.json]
import fs from 'node:fs';
import path from 'node:path';

const TOPIC = 'iriscope-avis-c35db7675af9';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'avis');
let idx = { items: {}, hidden: [], reports: {}, titles: {} };
try { if (opt('--ancien')) idx = { ...idx, ...JSON.parse(fs.readFileSync(opt('--ancien'), 'utf8')) }; } catch (e) { /* premier passage */ }
const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=all`, { headers: { 'User-Agent': 'iriscope-avis/1.0' } });
if (!res.ok) throw new Error(`ntfy : HTTP ${res.status}`);
const lines = (await res.text()).split('\n').filter(Boolean);
let added = 0, reports = 0;
const hidden = new Set(idx.hidden);
for (const line of lines) {
  let m, r; try { m = JSON.parse(line); r = JSON.parse(m.message); } catch (e) { continue; }
  if (m.event !== 'message' || !r || r.v !== 1) continue;
  const dev = String(r.d || '').slice(0, 40);
  if (r.report) {
    const list = new Set(idx.reports[r.report] || []); list.add(dev || m.id);
    idx.reports[r.report] = [...list]; reports++;
    if (list.size >= 2) hidden.add(r.report);
    continue;
  }
  if (!r.k || !(r.s >= 1 && r.s <= 5) || !dev) continue;
  const key = String(r.k).slice(0, 120), rid = `${key}|${dev}`;
  const b = idx.items[key] || (idx.items[key] = { list: [] });
  const old = b.list.find(x => x.id === rid);
  const t = Number(r.t) || m.time * 1000;
  if (old && old.t >= t) continue;
  b.list = [{ id: rid, s: Math.round(r.s), c: String(r.c || '').replace(/\s+/g, ' ').trim().slice(0, 280), n: String(r.n || '').trim().slice(0, 30), t, d: dev }, ...b.list.filter(x => x.id !== rid)].slice(0, 200);
  if (r.ti) idx.titles[key] = String(r.ti).slice(0, 80);
  added++;
}
for (const [k, b] of Object.entries(idx.items)) {
  b.list = b.list.filter(x => !hidden.has(x.id)).sort((x, y) => y.t - x.t);
  if (!b.list.length) { delete idx.items[k]; continue; }
  b.n = b.list.length; b.avg = Math.round(b.list.reduce((s, x) => s + x.s, 0) / b.n * 10) / 10;
}
idx.hidden = [...hidden];
idx.updated = new Date().toISOString();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
console.log(`${lines.length} messages lus, ${added} avis ajoutés ou mis à jour, ${reports} signalements ; ${Object.keys(idx.items).length} sorties ou parcours notés, ${idx.hidden.length} avis masqués`);
