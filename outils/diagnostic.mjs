// Diagnostic manuel : combien d'événements à venir (30 jours) dans chaque territoire d'outre-mer et en Corse,
// selon OpenAgenda (source actuelle de l'appli) et DATAtourisme. N'écrit rien, affiche seulement des chiffres.
const KEY = process.env.DATATOURISME_KEY;
const day = d => d.toISOString().slice(0, 10);
const now = new Date(), from = day(now), to = day(new Date(now.getTime() + 30 * 86400000));
const ZONES = [
  ['Guadeloupe', 16.25, -61.55, 60], ['Martinique', 14.65, -61.0, 45], ['Guyane', 4.9, -52.9, 250],
  ['La Réunion', -21.13, 55.53, 50], ['Mayotte', -12.82, 45.15, 30], ['Saint-Pierre-et-Miquelon', 46.95, -56.3, 60],
  ['Saint-Martin / Saint-Barthélemy', 18.0, -62.95, 30], ['Nouvelle-Calédonie', -21.3, 165.6, 300], ['Polynésie (Tahiti)', -17.6, -149.5, 150],
  ['Wallis-et-Futuna', -13.75, -177.2, 250], ['Corse', 42.15, 9.1, 110], ['Paris (10 km)', 48.8566, 2.3522, 10], ['Lyon (10 km)', 45.76, 4.84, 10], ['Marseille (10 km)', 43.3, 5.38, 10], ['Finistère (repère)', 48.25, -4.1, 60],
];
const ODS = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records';
for (const [name, lat, lon, km] of ZONES) {
  let oa = '?', dt = '?', dtAll = '?', agendas = '';
  try {
    const w = `within_distance(location_coordinates, geom'POINT(${lon} ${lat})', ${km}km) AND lastdate_end >= date'${from}' AND firstdate_begin <= date'${to}'`;
    const j = await (await fetch(`${ODS}?limit=0&where=${encodeURIComponent(w)}`)).json();
    oa = j.total_count ?? JSON.stringify(j).slice(0, 120);
    const g = await (await fetch(`${ODS}?limit=6&select=${encodeURIComponent('count(*) as n')}&group_by=originagenda_title&order_by=${encodeURIComponent('n desc')}&where=${encodeURIComponent(w)}`)).json();
    agendas = (g.results || []).map(r => `${r.originagenda_title} (${r.n})`).join(' ; ');
  } catch (e) { oa = 'erreur ' + e.message; }
  try {
    const u = new URL('https://api.datatourisme.fr/v1/entertainmentAndEvent');
    u.searchParams.set('page_size', '1'); u.searchParams.set('fields', 'uuid'); u.searchParams.set('geo_distance', `${lat},${lon},${km}km`);
    const all = await (await fetch(u, { headers: { 'X-API-Key': KEY } })).json();
    dtAll = all.meta ? all.meta.total : JSON.stringify(all).slice(0, 120);
    u.searchParams.set('filters', `takesPlaceAt.endDate[gte]=${from} AND takesPlaceAt.startDate[lte]=${to}`);
    const soon = await (await fetch(u, { headers: { 'X-API-Key': KEY } })).json();
    dt = soon.meta ? soon.meta.total : JSON.stringify(soon).slice(0, 120);
  } catch (e) { dt = 'erreur ' + e.message; }
  console.log(`${name} | OpenAgenda 30 j : ${oa} | DATAtourisme 30 j : ${dt} (toutes dates : ${dtAll})`);
  if (agendas) console.log(`   agendas : ${agendas}`);
}

// Paris a aussi son propre agenda en données ouvertes (« Que faire à Paris », licence ODbL)
try {
  const u = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=0&where=' + encodeURIComponent(`date_end >= date'${from}' AND date_start <= date'${to}'`);
  const j = await (await fetch(u)).json();
  console.log('Que faire à Paris (opendata.paris.fr) 30 j :', j.total_count ?? JSON.stringify(j).slice(0, 200));
} catch (e) { console.log('Que faire à Paris : erreur', e.message); }
