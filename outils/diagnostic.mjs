// Diagnostic manuel (0.41.0) : liens utiles des DOM-TOM et champs de VigiEau. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) liens-test/1.0';
for (const u of ['https://www.info-requin.re', 'https://www.info-requin.re/', 'https://meteofrance.gp/fr/sargasses', 'https://meteofrance.mq/fr/sargasses', 'https://www.ipgp.fr/observatoire-volcanologique-du-piton-de-la-fournaise/', 'https://www.ipgp.fr/observatoires/ovpf/', 'https://meteofrance.re/fr/cyclone', 'https://meteofrance.com/meteo-des-forets', 'https://www.reunion.gouv.fr/Actions-de-l-Etat/Securite-et-protection-de-la-population/Risque-requin']) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow' }); const t = await r.text(); console.log(`${r.status} ${u} -> ${r.url} · ${(t.match(/<title>([^<]*)/i) || [])[1] || ''}`); }
  catch (e) { console.log(`ERR ${u} ${e.message}`); }
}
const z = await (await fetch('https://api.vigieau.gouv.fr/api/zones?lon=-2.92&lat=47.62&commune=56008&profil=particulier')).json();
console.log(JSON.stringify(z.map(x => { const { usages, ...rest } = x; return { ...rest, usages: usages.length }; })).slice(0, 1500));
const g = await (await fetch('https://geo.api.gouv.fr/communes?lat=47.62&lon=-2.92&fields=code&format=json')).json();
console.log('geo.api', JSON.stringify(g));
