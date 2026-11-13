// Diagnostic manuel (0.41.0) : sources des alertes et risques (crues, eau, feux, séismes, cyclones). N'écrit rien.
const UA = 'risques-test/1.0 (+https://github.com)';
async function show(label, url, pick, raw = false) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    const buf = Buffer.from(await r.arrayBuffer());
    let t = buf.toString('utf8');
    if (raw) { const { gunzipSync } = await import('node:zlib'); try { t = gunzipSync(buf).toString('utf8'); } catch (e) { /* pas compressé */ } }
    let out = t.slice(0, 500);
    if (pick) try { out = JSON.stringify(pick(raw ? t : JSON.parse(t))).slice(0, 1500); } catch (e) { out = `(lecture : ${e.message}) ${t.slice(0, 400)}`; }
    console.log(`\n== ${label} : HTTP ${r.status} · CORS ${r.headers.get('access-control-allow-origin')} · ${buf.length} octets\n${out}`);
  } catch (e) { console.log(`\n== ${label} : ${e.message}`); }
}
await show('Vigicrues tronçons (geojson)', 'https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.geojson', j => ({ n: j.features.length, f: j.features.slice(0, 2).map(f => f.properties) }));
await show('Vigicrues v1 (json)', 'https://www.vigicrues.gouv.fr/services/v1.1/TronEntVigiCru.json/?TypEntVigiCru=8', j => JSON.stringify(j).slice(0, 800));
await show('Hub\'Eau hydrométrie Blavet', 'https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=J5', j => ({ count: j.count, d: (j.data || []).slice(0, 2) }));
await show('VigiEau zones Baden', 'https://api.vigieau.gouv.fr/api/zones?lon=-2.92&lat=47.62&commune=56008&profil=particulier', j => j);
await show('VigiEau Guadeloupe (Pointe-à-Pitre)', 'https://api.vigieau.gouv.fr/api/zones?lon=-61.53&lat=16.24&commune=97120&profil=particulier', j => j);
await show('VigiEau données ouvertes', 'https://www.data.gouv.fr/api/1/datasets/?q=vigieau%20restrictions&page_size=3', j => j.data.map(d => [d.title, d.license, d.resources.slice(0, 3).map(r => r.url)]));
await show('Météo des forêts 2026', 'https://meteofrance.s3.sbg.io.cloud.ovh.net/data/BULLETIN/MDF/mdf_2026.csv.gz', t => { const l = t.split('\n'); return { lignes: l.length, head: l.slice(0, 3), fin: l.slice(-4) }; }, true);
await show('USGS séismes 2,5+ semaine', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', j => ({ n: j.features.length, f: j.features.slice(0, 2).map(f => [f.properties.mag, f.properties.place, f.properties.time, f.geometry.coordinates]) }));
await show('NHC cyclones Atlantique', 'https://www.nhc.noaa.gov/CurrentStorms.json', j => j);
await show('GDACS événements', 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtypes=TC,EQ,VO,FL', j => ({ n: j.features.length, f: j.features.slice(0, 3).map(f => [f.properties.eventtype, f.properties.name, f.properties.alertlevel, f.properties.country, f.properties.fromdate]) }));
await show('GDACS conditions', 'https://www.gdacs.org/About/termofuse.aspx', null);
await show('Météo-France vigilance outre-mer (données ouvertes ?)', 'https://www.data.gouv.fr/api/1/datasets/?q=vigilance%20outre-mer%20meteo-france&page_size=5', j => j.data.map(d => [d.title, d.license, d.organization && d.organization.name]));
