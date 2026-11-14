// Diagnostic manuel (0.42.1) : ce que renvoie VigiEau pour quelques communes. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) diagnostic/1.0';
for (const [n, lon, lat, c] of [['Rennes', -1.68, 48.111, '35238'], ['Chateauneuf-du-Faou', -3.818, 48.188, '29027'], ['Troyes', 4.074, 48.297, '10387']]) {
  try {
    const r = await fetch(`https://api.vigieau.gouv.fr/api/zones?lon=${lon}&lat=${lat}&commune=${c}&profil=particulier`, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    console.log(`== ${n} HTTP ${r.status} ${t.length} car.`);
    let j; try { j = JSON.parse(t); } catch (e) { console.log(t.slice(0, 300)); continue; }
    const list = Array.isArray(j) ? j : [j];
    for (const z of list) console.log(JSON.stringify({ id: z.id, nom: z.nom, type: z.type, niveauGravite: z.niveauGravite, keys: Object.keys(z).join(','), arrete: z.arrete && { debut: z.arrete.dateDebutValidite, fin: z.arrete.dateFinValidite } }));
  } catch (e) { console.log(n, 'erreur', e.message); }
}
