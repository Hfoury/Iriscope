// Diagnostic manuel (0.41.0) : nom du fichier en cours des résultats Loto et EuroMillions. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) resultats-test/1.0';
const tries = ['loto/loto_202407', 'loto/loto_202408', 'loto/loto_202410', 'loto/loto_202501', 'loto/loto', 'euromillions/euromillions_202407', 'euromillions/euromillions_202402', 'euromillions/euromillions_202501', 'euromillions/euromillions'];
for (const t of tries) {
  const u = `https://media.fdj.fr/static-draws/csv/${t}.zip`;
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, method: 'GET' }); const b = Buffer.from(await r.arrayBuffer());
    let first = '';
    if (r.ok) { const fs = await import('node:fs'); fs.writeFileSync('/tmp/x.zip', b); const { execSync } = await import('node:child_process'); first = execSync('unzip -p /tmp/x.zip | sed -n 2p | cut -c1-80').toString().trim(); }
    console.log(`${r.status} ${t} ${b.length} ${r.headers.get('last-modified')} ${first}`); }
  catch (e) { console.log(`ERR ${t} ${e.message}`); }
}
const r = await fetch('https://www.fdj.fr/jeux-de-tirage/loto/historique', { headers: { 'User-Agent': UA } }); const t = await r.text();
console.log([...new Set([...t.matchAll(/static-draws[^"'\\ ]*/g)].map(m => m[0]))].slice(0, 20).join('\n'));
console.log([...new Set([...t.matchAll(/[a-z_]*\d{6}[a-z_]*\.zip|historique[^"' ]{0,80}/gi)].map(m => m[0]))].slice(0, 20).join('\n'));
