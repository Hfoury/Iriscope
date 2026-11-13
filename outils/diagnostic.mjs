// Diagnostic manuel (0.41.0) : liens de téléchargement des résultats sur la page historique de la FDJ. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) resultats-test/1.0';
for (const page of ['https://www.fdj.fr/jeux-de-tirage/loto/historique', 'https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique']) {
  const r = await fetch(page, { headers: { 'User-Agent': UA } });
  const t = (await r.text()).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  console.log(`== ${page}`);
  console.log([...new Set([...t.matchAll(/https?:\/\/[^"'\s<>]*?(?:\.zip|\.csv|static-draws[^"'\s<>]*)/g)].map(m => m[0]))].slice(0, 25).join('\n'));
  const i = t.indexOf('telechargez'); if (i > 0) console.log(t.slice(i - 200, i + 1500).replace(/\s+/g, ' '));
}
