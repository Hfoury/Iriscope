// Diagnostic manuel (0.41.0) : pages d'inscription et licences d'Atmo Data (pollen) et de Copernicus Marine (houle). N'écrit rien.
const UA = 'meteo-test/1.0 (+https://github.com)';
for (const u of ['https://admindata.atmo-france.org/api/doc/v2', 'https://admindata.atmo-france.org/', 'https://www.atmo-france.org/article/acces-aux-donnees']) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA } });
    const t = await r.text();
    console.log(`\n== ${u} : HTTP ${r.status}`);
    const links = [...t.matchAll(/href="([^"]+)"[^>]*>([^<]{0,80})/g)].map(m => `${m[1]} | ${m[2].trim()}`).filter(x => /inscri|compte|login|regist|licen|odbl|cgu|condition|pollen|token/i.test(x));
    console.log([...new Set(links)].slice(0, 30).join('\n'));
    const txt = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const w of ['pollen', 'licence', 'ODbL', 'inscription', 'token', 'login']) { const i = txt.toLowerCase().indexOf(w.toLowerCase()); if (i >= 0) console.log(`[${w}] …${txt.slice(Math.max(0, i - 150), i + 250)}…`); }
  } catch (e) { console.log(`${u} : ${e.message}`); }
}
