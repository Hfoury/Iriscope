// Diagnostic manuel : sorties à venir (30 jours) dans les grandes métropoles, selon OpenAgenda (source actuelle de l'appli)
// et DATAtourisme. Les ateliers emploi et la Semaine de l'industrie sont comptés à part : ce ne sont pas des sorties.
// N'écrit rien, affiche seulement des chiffres.
const KEY = process.env.DATATOURISME_KEY;
const day = d => d.toISOString().slice(0, 10);
const now = new Date(), from = day(now), to = day(new Date(now.getTime() + 30 * 86400000));
const ZONES = [
  ['Paris', 48.8566, 2.3522], ['Marseille', 43.2965, 5.3698], ['Lyon', 45.764, 4.8357], ['Toulouse', 43.6047, 1.4442], ['Nice', 43.7102, 7.262],
  ['Nantes', 47.2184, -1.5536], ['Montpellier', 43.6108, 3.8767], ['Strasbourg', 48.5734, 7.7521], ['Bordeaux', 44.8378, -0.5792], ['Lille', 50.6292, 3.0573],
  ['Rennes', 48.1173, -1.6778], ['Reims', 49.2583, 4.0317], ['Saint-Étienne', 45.4397, 4.3872], ['Toulon', 43.1242, 5.928], ['Le Havre', 49.4944, 0.1079],
  ['Grenoble', 45.1885, 5.7245], ['Dijon', 47.322, 5.0415], ['Angers', 47.4784, -0.5632], ['Nîmes', 43.8367, 4.3601], ['Clermont-Ferrand', 45.7772, 3.087],
  ['Brest', 48.3904, -4.4861], ['Tours', 47.3941, 0.6848], ['Rouen', 49.4432, 1.0993], ['Metz', 49.1193, 6.1757], ['Nancy', 48.6921, 6.1844],
];
const ODS = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records';
const NOISE = `(originagenda_title like "France Travail" OR originagenda_title like "Semaine de l'industrie")`;
const count = async w => { const j = await (await fetch(`${ODS}?limit=0&where=${encodeURIComponent(w)}`)).json(); return j.total_count ?? ('? ' + JSON.stringify(j).slice(0, 100)); };
for (const [name, lat, lon] of ZONES) {
  let all = '?', noise = '?', dt = '?', agendas = '';
  try {
    const w = `within_distance(location_coordinates, geom'POINT(${lon} ${lat})', 10km) AND lastdate_end >= date'${from}' AND firstdate_begin <= date'${to}'`;
    all = await count(w); noise = await count(`${w} AND ${NOISE}`);
    const g = await (await fetch(`${ODS}?limit=5&select=${encodeURIComponent('count(*) as n')}&group_by=originagenda_title&order_by=${encodeURIComponent('n desc')}&where=${encodeURIComponent(`${w} AND NOT ${NOISE}`)}`)).json();
    agendas = (g.results || []).map(r => `${r.originagenda_title} (${r.n})`).join(' ; ');
  } catch (e) { all = 'erreur ' + e.message; }
  try {
    const u = new URL('https://api.datatourisme.fr/v1/entertainmentAndEvent');
    u.searchParams.set('page_size', '1'); u.searchParams.set('fields', 'uuid'); u.searchParams.set('geo_distance', `${lat},${lon},10km`);
    u.searchParams.set('filters', `takesPlaceAt.endDate[gte]=${from} AND takesPlaceAt.startDate[lte]=${to}`);
    const soon = await (await fetch(u, { headers: { 'X-API-Key': KEY } })).json();
    dt = soon.meta ? soon.meta.total : JSON.stringify(soon).slice(0, 120);
  } catch (e) { dt = 'erreur ' + e.message; }
  const real = Number.isFinite(all - noise) ? all - noise : '?';
  console.log(`${name} | OpenAgenda vraies sorties : ${real} (+ ${noise} emploi/industrie) | DATAtourisme : ${dt}`);
  if (agendas) console.log(`   agendas : ${agendas}`);
}
// Agendas propres aux villes, en données ouvertes
const tryCount = async (label, url) => { try { const j = await (await fetch(url)).json(); console.log(label, ':', j.total_count ?? JSON.stringify(j).slice(0, 160)); } catch (e) { console.log(label, ': erreur', e.message); } };
await tryCount('Que faire à Paris (opendata.paris.fr) 30 j', 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=0&where=' + encodeURIComponent(`date_end >= date'${from}' AND date_start <= date'${to}'`));
// portails opendatasoft des métropoles : y a-t-il un jeu « agenda » ?
for (const [city, host] of [['Toulouse', 'data.toulouse-metropole.fr'], ['Nantes', 'data.nantesmetropole.fr'], ['Bordeaux', 'opendata.bordeaux-metropole.fr'], ['Lille', 'opendata.lillemetropole.fr'], ['Rennes', 'data.rennesmetropole.fr'], ['Strasbourg', 'data.strasbourg.eu'], ['Montpellier', 'data.montpellier3m.fr'], ['Nice', 'opendata.nicecotedazur.org'], ['Lyon', 'data.grandlyon.com'], ['Marseille', 'data.ampmetropole.fr']]) {
  try {
    const j = await (await fetch(`https://${host}/api/explore/v2.1/catalog/datasets?limit=8&where=${encodeURIComponent('search("agenda") OR search("evenements") OR search("manifestations")')}&select=dataset_id`, { signal: AbortSignal.timeout(15000) })).json();
    console.log(`Portail ${city} (${host}) :`, (j.results || []).map(r => r.dataset_id).join(', ') || JSON.stringify(j).slice(0, 120));
  } catch (e) { console.log(`Portail ${city} (${host}) : pas d'API de ce type (${e.message})`); }
}
