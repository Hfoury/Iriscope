// Diagnostic manuel (0.41.0) : où trouver les résultats officiels du Loto et d'EuroMillions avec les gains par rang. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) resultats-test/1.0';
for (const u of ['https://www.fdj.fr/jeux-de-tirage/loto/historique', 'https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique']) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } }); const t = await r.text();
    console.log(`\n== ${u} : HTTP ${r.status}`);
    console.log([...new Set([...t.matchAll(/https?:[^"' ]*\.(?:zip|csv)/g)].map(m => m[0]))].slice(0, 12).join('\n'));
  } catch (e) { console.log(`ERR ${u} ${e.message}`); }
}
for (const u of ['https://media.fdj.fr/static-draws/csv/loto/loto_201911.zip', 'https://media.fdj.fr/static-draws/csv/euromillions/euromillions_202002.zip']) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); const b = Buffer.from(await r.arrayBuffer()); console.log(`\n== ${u} : HTTP ${r.status} ${b.length} octets ${r.headers.get('last-modified')}`);
    if (r.ok) { const fs = await import('node:fs'); fs.writeFileSync('/tmp/x.zip', b); const { execSync } = await import('node:child_process'); console.log(execSync('unzip -p /tmp/x.zip | head -3 | cut -c1-900').toString()); } }
  catch (e) { console.log(`ERR ${u} ${e.message}`); }
}
