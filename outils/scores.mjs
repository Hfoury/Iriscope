// Calendrier et scores de foot et de rugby (Top 14) pour le « Prono entre amis » (0.41.0), chaque soir, publiés sur la branche « scores ».
// - calendrier : openfootball (domaine public), Ligue 1, Premier League, Liga, Bundesliga, Serie A ;
// - scores : Wikipédia (CC BY-SA, source citée) pour la Ligue 1, mis à jour quelques heures après les matchs ;
//   à défaut, les scores d'openfootball (souvent en retard).
// Résultat : <dossier>/scores/index.json { updated, source, leagues: [{ k, name, tz, matches: [{ id, date, time, home, away, score }] }] }
// Seuls les matchs de 15 jours en arrière à 30 jours en avant sont gardés.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const OUT = path.join(args.find(a => !a.startsWith('--')) || 'sortie', 'scores');
const UA = 'Iriscope-donnees/1.0 (prono entre amis)';
const now = new Date();
const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
const SEASON = `${y}-${String(y + 1).slice(2)}`;
const LEAGUES = [
  ['fr.1', 'Ligue 1', 'Europe/Paris', `Championnat_de_France_de_football_${y}-${y + 1}`],
  ['en.1', 'Premier League', 'Europe/London', null],
  ['es.1', 'Liga', 'Europe/Madrid', null],
  ['de.1', 'Bundesliga', 'Europe/Berlin', null],
  ['it.1', 'Serie A', 'Europe/Rome', null],
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(fc|ac|sc|as|rc|ogc|club|football|de|du|la|le|1)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
async function get(url, json = true) {
  let last;
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return json ? await r.json() : await r.text(); }
    catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (k + 1))); }
  }
  throw last;
}
// Tableau des résultats de Wikipédia (modèle « Foot résultat ») : ligne = équipe à domicile, colonne = équipe à l'extérieur
function wikiResults(text) {
  const rows = [...text.matchAll(/\{\{Foot résultat\|([^\n]+)\}\}/g)].map(m => m[1].split('|'));
  const teamOf = cell => { const m = cell.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/); return m ? (m[2] || m[1]) : cell; };
  // une cellule [[A|B]] est coupée en deux par split('|') : on recolle
  const fix = parts => { const out = []; for (let i = 0; i < parts.length; i++) { if (/\[\[[^\]]*$/.test(parts[i]) && parts[i + 1]) { out.push(`${parts[i]}|${parts[i + 1]}`); i++; } else out.push(parts[i]); } return out; };
  const table = rows.map(fix).filter(r => r.length > 5);
  const teams = table.map(r => teamOf(r[0]));
  const res = [];
  table.forEach((r, i) => r.slice(1).forEach((c, j) => { const m = c.trim().match(/^(\d+)\s*[-–]\s*(\d+)/); if (m && teams[j]) res.push({ home: teams[i], away: teams[j], score: [+m[1], +m[2]] }); }));
  return res;
}
const out = { updated: now.toISOString(), source: 'Calendrier : openfootball (domaine public) · scores : Wikipédia (CC BY-SA) et openfootball', leagues: [] };
for (const [k, name, tz, wiki] of LEAGUES) {
  try {
    const j = await get(`https://raw.githubusercontent.com/openfootball/football.json/master/${SEASON}/${k}.json`);
    let matches = (j.matches || []).map(m => ({ id: `${k}-${m.date}-${norm(m.team1).replace(/ /g, '')}-${norm(m.team2).replace(/ /g, '')}`, date: m.date, time: m.time || null, home: m.team1, away: m.team2,
      score: m.score && m.score.ft ? m.score.ft : null, round: m.round || '' }));
    let fromWiki = 0;
    if (wiki) {
      try {
        const res = wikiResults(await get(`https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(wiki)}&action=raw`, false));
        // chaque équipe de Wikipédia est reliée à l'équipe d'openfootball qui partage le plus de mots (« Paris FC » ≠ « Paris Saint-Germain »)
        const ofTeams = [...new Set(matches.flatMap(m => [m.home, m.away]))];
        const words = t => new Set(norm(t).split(' ').filter(w => w.length > 1));
        const sim = (a, b) => { const A = words(a), B = words(b); const inter = [...A].filter(w => B.has(w)).length; return inter / (A.size + B.size - inter || 1); };
        const link = new Map();
        for (const t of new Set(res.flatMap(r => [r.home, r.away]))) {
          const best = ofTeams.map(o => [o, norm(o) === norm(t) ? 2 : sim(o, t)]).sort((a, b) => b[1] - a[1])[0];
          if (best && best[1] >= 0.3) link.set(t, best[0]);
        }
        for (const r of res) {
          const h = link.get(r.home), a = link.get(r.away);
          const m = h && a && matches.find(x => x.home === h && x.away === a);
          if (m && !m.score) { m.score = r.score; fromWiki++; } else if (m) m.score = r.score;
        }
        console.log(`${name} : ${res.length} scores lus sur Wikipédia, ${fromWiki} ajoutés`);
      } catch (e) { console.log(`${name} : Wikipédia indisponible (${e.message})`); }
    }
    const lo = new Date(now.getTime() - 15 * 86400000).toISOString().slice(0, 10), hi = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    matches = matches.filter(m => m.date >= lo && m.date <= hi);
    out.leagues.push({ k, name, tz, matches });
    console.log(`${name} : ${matches.length} matchs gardés, ${matches.filter(m => m.score).length} avec score`);
  } catch (e) { console.log(`${name} : échec (${e.message})`); }
}
// ---------- rugby : Top 14 (Wikipédia, CC BY-SA), une ligne par match dans « Détails des résultats » ----------
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function top14(text) {
  const clean = c => c.replace(/'''/g, '').replace(/\{\{bonus\|[^}]*\}\}/g, '').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').trim();
  const out = [];
  let round = '', date = null;
  for (const line of text.split('\n')) {
    const r = line.match(/^;;\s*\{\{(\d+)(?:re|e)\|journée\}\}/);
    if (r) { round = `Journée ${r[1]}`; date = null; continue; }
    const p = line.match(/^\{\{Petit\|([^}]+)\}\}/);
    if (p && round) {
      const t = p[1].toLowerCase();
      const d = t.match(/(\d{1,2})(?:er)?/); const mo = MOIS.findIndex(m => t.includes(m)); const yy = t.match(/(20\d\d)/);
      if (d && mo >= 0 && yy) {
        // l'année écrite est celle du dernier jour : un week-end « 31 décembre et 1er janvier » commence l'année d'avant
        const firstMo = MOIS.map((m, i) => [i, t.indexOf(m)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1])[0][0];
        const lastMo = MOIS.map((m, i) => [i, t.lastIndexOf(m)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1])[0][0];
        const year = +yy[1] - (firstMo > lastMo ? 1 : 0);
        date = `${year}-${String(firstMo + 1).padStart(2, '0')}-${String(+d[1]).padStart(2, '0')}`;
      }
      continue;
    }
    if (!round || !date || !line.startsWith('|') || line.startsWith('|-') || line.startsWith('|}') || line.startsWith('|+')) continue;
    const c = line.slice(1).split('||');
    if (c.length < 5) continue;
    const home = clean(c[1]), away = clean(c[4]);
    if (!home || !away || /width|colspan/.test(home)) continue;
    const sh = clean(c[2]), sa = clean(c[3]);
    const score = /^\d+$/.test(sh) && /^\d+$/.test(sa) ? [+sh, +sa] : null;
    out.push({ id: `top14-${date}-${norm(home).replace(/ /g, '')}-${norm(away).replace(/ /g, '')}`, date, time: null, home, away, score, round });
  }
  return out;
}
try {
  const raw = await get(`https://fr.wikipedia.org/w/index.php?title=${encodeURIComponent(`Championnat_de_France_de_rugby_à_XV_${y}-${y + 1}`)}&action=raw`, false);
  const lo = new Date(now.getTime() - 15 * 86400000).toISOString().slice(0, 10), hi = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const all = top14(raw);
  const matches = all.filter(m => m.date >= lo && m.date <= hi);
  out.leagues.push({ k: 'top14', name: 'Top 14', tz: 'Europe/Paris', sport: 'rugby', matches });
  out.source += ' · Top 14 : Wikipédia (CC BY-SA)';
  console.log(`Top 14 : ${all.length} matchs lus, ${matches.length} gardés, ${matches.filter(m => m.score).length} avec score`);
} catch (e) { console.log(`Top 14 : échec (${e.message})`); }

// ---------- EuroMillions : historique officiel publié en CSV par la loterie nationale britannique (mêmes numéros dans tous les pays) ----------
// Le Loto français n'a pas de source ouverte : ses numéros restent à taper par un membre du groupe.
try {
  const csv = await get('https://www.national-lottery.co.uk/results/euromillions/draw-history/csv', false);
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(',').map(c => c.trim().toLowerCase());
  const at = re => cols.findIndex(c => re.test(c));
  const iDate = at(/date/), iBalls = cols.map((c, i) => (/^ball/.test(c) ? i : -1)).filter(i => i >= 0), iStars = cols.map((c, i) => (/star/.test(c) ? i : -1)).filter(i => i >= 0);
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const draws = [];
  for (const r of rows) {
    const c = r.split(',').map(x => x.trim());
    const m = (c[iDate] || '').match(/(\d{1,2})[-\s/]([A-Za-z]{3})[a-z]*[-\s/](\d{4})/);
    if (!m || !MON[m[2].toLowerCase()]) continue;
    const nums = iBalls.map(i => +c[i]).filter(Boolean).sort((a, b) => a - b), extra = iStars.map(i => +c[i]).filter(Boolean).sort((a, b) => a - b);
    if (nums.length !== 5 || extra.length !== 2) continue;
    draws.push({ game: 'em', date: `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`, nums, extra });
  }
  draws.sort((a, b) => b.date.localeCompare(a.date));
  out.draws = draws.slice(0, 30);
  out.source += ' · EuroMillions : historique officiel (National Lottery, Royaume-Uni)';
  console.log(`EuroMillions : ${draws.length} tirages lus, dernier le ${draws[0] && draws[0].date}`);
  if (!draws.length) console.log(`EuroMillions : format inattendu, début : ${JSON.stringify(csv.slice(0, 1200))}`);
} catch (e) { console.log(`EuroMillions : échec (${e.message})`); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(out));
console.log(`Terminé : ${out.leagues.length} championnats`);
if (!out.leagues.length) process.exit(1);
