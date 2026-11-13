// Lecture minimale d'un flux GTFS temps réel (protobuf) : retards, suppressions et alertes SNCF. Sans bibliothèque.
// Même code que src/gtfsrt.js de l'appli.
function reader(buf) {
  let p = 0;
  // entier variable ; au-delà de 5 octets, c'est un int32/int64 négatif : on rend les 32 bits bas, signés
  const varint = () => {
    let r = 0, s = 1, b, lo = 0, i = 0;
    do { b = buf[p++]; r += (b & 0x7f) * s; s *= 128; if (i < 4) lo |= (b & 0x7f) << (7 * i); else if (i === 4) lo |= (b & 0x0f) << 28; i++; } while (b & 0x80);
    return i > 5 ? lo | 0 : r;
  };
  return {
    end: () => p >= buf.length,
    tag: () => { const t = varint(); return [Math.floor(t / 8), t & 7]; },
    varint,
    bytes: () => { const n = varint(); const out = buf.subarray(p, p + n); p += n; return out; },
    skip: w => { if (w === 0) varint(); else if (w === 1) p += 8; else if (w === 2) { const n = varint(); p += n; } else if (w === 5) p += 4; else throw new Error('protobuf'); },
  };
}
const dec = new TextDecoder();
const str = b => dec.decode(b);
const sint = v => v > 0x7fffffff && v < 0x100000000 ? v - 0x100000000 : v;
function msg(buf, fields) {
  const r = reader(buf), o = {};
  while (!r.end()) {
    const [f, w] = r.tag(), spec = fields[f];
    if (!spec) { r.skip(w); continue; }
    const [name, kind, sub, rep] = spec;
    let v;
    if (kind === 'v') v = r.varint(); else if (kind === 's') v = str(r.bytes()); else if (kind === 'm') v = msg(r.bytes(), sub); else { r.skip(w); continue; }
    if (rep) (o[name] ||= []).push(v); else o[name] = v;
  }
  return o;
}
const TRIP = { 1: ['tripId', 's'], 2: ['startTime', 's'], 3: ['startTime', 's'], 4: ['startDate', 's'], 5: ['routeId', 's'], 6: ['rel', 'v'] };
const EVENT = { 1: ['delay', 'v'], 2: ['time', 'v'] };
const STU = { 1: ['seq', 'v'], 2: ['arrival', 'm', EVENT], 3: ['departure', 'm', EVENT], 4: ['stopId', 's'], 5: ['rel', 'v'] };
const TU = { 1: ['trip', 'm', TRIP], 2: ['stops', 'm', STU, true], 4: ['timestamp', 'v'], 5: ['delay', 'v'] };
const TRANS = { 1: ['translation', 'm', { 1: ['text', 's'], 2: ['lang', 's'] }, true] };
const SEL = { 1: ['agencyId', 's'], 2: ['routeId', 's'], 3: ['routeType', 'v'], 4: ['trip', 'm', TRIP], 5: ['stopId', 's'] };
const ALERT = { 1: ['periods', 'm', { 1: ['start', 'v'], 2: ['end', 'v'] }, true], 5: ['entities', 'm', SEL, true], 6: ['cause', 'v'], 7: ['effect', 'v'], 10: ['header', 'm', TRANS], 11: ['text', 'm', TRANS] };
const ENTITY = { 1: ['id', 's'], 2: ['deleted', 'v'], 3: ['tripUpdate', 'm', TU], 5: ['alert', 'm', ALERT] };
const FEED = { 1: ['header', 'm', { 3: ['timestamp', 'v'] }], 2: ['entity', 'm', ENTITY, true] };
const fr = t => { const l = (t && t.translation) || []; return ((l.find(x => /^fr/i.test(x.lang || '')) || l[0] || {}).text || '').trim(); };
export const EFFECTS = { 1: 'Pas de service', 2: 'Service réduit', 3: 'Retards importants', 4: 'Détour', 5: 'Service supplémentaire', 6: 'Service modifié', 7: 'Autre', 8: 'Effet inconnu', 9: 'Arrêt déplacé' };
// Renvoie { at, trips: [{ tripId, date, canceled, delayMin, skipped:[stopId], stops }], alerts: [{ id, effect, title, text, from, to, trips:[tripId], stops:[stopId], routes:[routeId] }] }
export function decodeFeed(buf) {
  const f = msg(buf instanceof Uint8Array ? buf : new Uint8Array(buf), FEED);
  const trips = [], alerts = [];
  for (const e of f.entity || []) {
    if (e.tripUpdate) {
      const t = e.tripUpdate, st = t.stops || [];
      const delays = st.map(s => sint(((s.departure || s.arrival || {}).delay) || 0));
      trips.push({ tripId: (t.trip || {}).tripId || '', date: (t.trip || {}).startDate || '', canceled: (t.trip || {}).rel === 3,
        delayMin: Math.round(Math.max(sint(t.delay || 0), ...delays, 0) / 60), skipped: st.filter(s => s.rel === 1).map(s => s.stopId),
        stops: st.map(s => ({ stopId: s.stopId, delayMin: Math.round(sint(((s.departure || s.arrival || {}).delay) || 0) / 60) })) });
    }
    if (e.alert) {
      const a = e.alert, ents = a.entities || [];
      alerts.push({ id: e.id, effect: a.effect || 0, title: fr(a.header), text: fr(a.text), from: ((a.periods || [])[0] || {}).start || 0, to: ((a.periods || [])[0] || {}).end || 0,
        trips: ents.map(x => x.trip && x.trip.tripId).filter(Boolean), stops: ents.map(x => x.stopId).filter(Boolean), routes: ents.map(x => x.routeId).filter(Boolean) });
    }
  }
  return { at: ((f.header || {}).timestamp || 0) * 1000, trips, alerts };
}
