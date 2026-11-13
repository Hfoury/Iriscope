// Diagnostic manuel (0.41.0) : réponse complète de MET Norway (prévisions et océan) pour un point, pour écrire l'adaptateur de l'appli. N'écrit rien.
const UA = 'meteo-test/1.0 (+https://github.com)';
for (const u of ['https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=47.62&lon=-2.92', 'https://api.met.no/weatherapi/oceanforecast/2.0/complete?lat=47.45&lon=-3.0']) {
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  console.log('HTTP', r.status, 'CORS', r.headers.get('access-control-allow-origin'));
  console.log('JSONDEBUT' + (await r.text()) + 'JSONFIN');
}
await new Promise(r => setTimeout(r, 6000));
const g = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=%22Vannes%22%20sourcecountry:france%20sourcelang:french&mode=artlist&format=json&maxrecords=15&timespan=7d&sort=datedesc', { headers: { 'User-Agent': UA } });
console.log('GDELT HTTP', g.status, 'CORS', g.headers.get('access-control-allow-origin'));
console.log('JSONDEBUT' + (await g.text()) + 'JSONFIN');
