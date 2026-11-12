// Diagnostic manuel : structure des agendas ouverts de Paris et de Bordeaux Métropole (un exemple de chaque).
// N'écrit rien, affiche seulement.
const show = async (label, url) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); const t = await r.text(); console.log(`\n== ${label} (HTTP ${r.status})\n${t.slice(0, 3500)}`); } catch (e) { console.log(`\n== ${label} : erreur ${e.message}`); } };
const day = new Date().toISOString().slice(0, 10);
await show('Paris, exemple', 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=1&where=' + encodeURIComponent(`date_end >= date'${day}'`));
await show('Paris, licence', 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-?select=metas');
await show('Paris, près de Bastille 2 km', 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=0&where=' + encodeURIComponent(`within_distance(lat_lon, geom'POINT(2.369 48.853)', 2km) AND date_end >= date'${day}'`));
for (const d of ['met_agenda', 'tal_agenda', 'ci_evenmt_p']) {
  await show(`Bordeaux ${d}, fiche`, `https://opendata.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/${d}?select=dataset_id,metas`);
  await show(`Bordeaux ${d}, exemple`, `https://opendata.bordeaux-metropole.fr/api/explore/v2.1/catalog/datasets/${d}/records?limit=1`);
}
