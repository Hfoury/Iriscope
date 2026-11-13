// Calendrier et scores de foot pour le « Prono entre amis » (0.41.0), chaque soir, publiés sur la branche « scores ».
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
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(out));
console.log(`Terminé : ${out.leagues.length} championnats`);
if (!out.leagues.length) process.exit(1);
