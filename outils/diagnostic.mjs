// Diagnostic manuel : champs de l'agenda ouvert de Paris (hors textes longs) et test de la requête de l'appli. N'écrit rien.
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const base = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records';
const where = `within_distance(lat_lon, geom'POINT(2.369 48.853)', 3km) AND date_end >= date'${day(0)}' AND date_start <= date'${day(14)}'`;
const r = await fetch(`${base}?limit=3&offset=0&order_by=${encodeURIComponent('date_start desc')}&where=${encodeURIComponent(where)}`);
const j = await r.json();
console.log('HTTP', r.status, 'total', j.total_count, j.message || '');
for (const rec of j.results || []) {
  const o = {}; for (const [k, v] of Object.entries(rec)) o[k] = typeof v === 'string' && v.length > 160 ? v.slice(0, 160) + '…' : v;
  console.log(JSON.stringify(o, null, 1));
}
const m = await (await fetch('https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-')).json();
console.log('Licence :', JSON.stringify(m.metas && m.metas.default && { license: m.metas.default.license, license_url: m.metas.default.license_url, publisher: m.metas.default.publisher, modified: m.metas.default.modified }));
