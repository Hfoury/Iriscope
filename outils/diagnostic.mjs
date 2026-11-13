// Diagnostic manuel (0.41.0) : les sources de remplacement d'Open-Meteo et de Google Actualités répondent-elles, et avec quoi ? N'écrit rien.
const UA = 'meteo-test/1.0 (+https://github.com)';
async function show(label, url, pick) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const t = await r.text();
    let out = t.slice(0, 300);
    try { out = JSON.stringify(pick(JSON.parse(t))).slice(0, 900); } catch (e) { /* texte brut */ }
    console.log(`\n== ${label} : HTTP ${r.status}\n${out}`);
  } catch (e) { console.log(`\n== ${label} : ${e.message}`); }
}
// MET Norway (CC BY 4.0, usage commercial permis, sans clé)
await show('MET Norway prévisions Baden', 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=47.62&lon=-2.92',
  j => ({ units: j.properties.meta.units, n: j.properties.timeseries.length, first: j.properties.timeseries[0], last: j.properties.timeseries.at(-1).time }));
await show('MET Norway océan Golfe du Morbihan', 'https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=47.45&lon=-3.0',
  j => ({ units: j.properties.meta.units, n: j.properties.timeseries.length, first: j.properties.timeseries[0] }));
await show('MET Norway océan Méditerranée (Marseille)', 'https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=43.2&lon=5.3',
  j => ({ n: j.properties.timeseries.length, first: j.properties.timeseries[0] }));
await show('MET Norway lever du soleil', 'https://api.met.no/weatherapi/sunrise/3.0/sun?lat=47.62&lon=-2.92&date=2026-11-14&offset=+01:00', j => j.properties);
// GDELT (usage libre) : actualités locales en français
await show('GDELT Vannes', 'https://api.gdeltproject.org/api/v2/doc/doc?query=Vannes%20sourcelang:french&mode=artlist&format=json&maxrecords=8&timespan=7d',
  j => (j.articles || []).map(a => [a.seendate, a.domain, a.title]));
await show('GDELT Baden Morbihan', 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Baden%22%20Morbihan%20sourcelang:french&mode=artlist&format=json&maxrecords=8&timespan=14d',
  j => (j.articles || []).map(a => [a.seendate, a.domain, a.title]));
// IGN altimétrie (Licence Ouverte) pour l'altitude
await show('IGN altitude Chamonix', 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=6.87&lat=45.92&resource=ign_rge_alti_wld&zonly=true', j => j);
// Pollen : Atmo France (données ouvertes, ODbL) et CAMS
await show('Atmo France (page des données ouvertes)', 'https://admindata.atmo-france.org/api/doc/v2', j => Object.keys(j));
