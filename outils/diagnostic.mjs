// Diagnostic manuel (0.41.0) : adresse utilisée par la page historique de la FDJ pour télécharger les derniers tirages. N'écrit rien.
const UA = 'Mozilla/5.0 (Linux; Android 14) resultats-test/1.0';
const page = 'https://www.fdj.fr/jeux-de-tirage/loto/historique';
const t = (await (await fetch(page, { headers: { 'User-Agent': UA } })).text()).replace(/\\u002F/gi, '/');
const hits = new Set();
for (const m of t.matchAll(/["'](\/?[a-z0-9_\-/.:]*(?:draw|tirage|archive|csv|zip|download)[a-z0-9_\-/.?=&:]*)["']/gi)) if (m[1].length < 160) hits.add(m[1]);
console.log([...hits].slice(0, 60).join('\n'));
const scripts = [...t.matchAll(/src="([^"]+\.js)"/g)].map(m => new URL(m[1], page).href);
console.log('scripts', scripts.length);
for (const s of scripts) {
  try { const js = await (await fetch(s, { headers: { 'User-Agent': UA } })).text();
    const f = [...new Set([...js.matchAll(/["'`]([^"'`]{0,60}(?:static-draws|service-draw|draws\/|\.zip)[^"'`]{0,80})["'`]/g)].map(m => m[1]))];
    if (f.length) console.log(s.split('/').pop(), '=>', f.slice(0, 10).join(' | ')); } catch (e) { /* suivant */ }
}
