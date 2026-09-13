import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { zoekPlaats, nominatimSleep } from '../../shared/nominatim.ts';

// Zoekt coördinaten bij plaatsen van leads (kaart op de SmartSuite-pagina):
// de client stuurt een lijst unieke plaatsen mee, deze functie lost ze op via
// OpenStreetMap Nominatim met cache in Plaatscoordinaat. Elke plaats wordt
// maar één keer opgezocht (Nominatim: max 1 verzoek/s).
//
// Aanroepen: ingelogde gebruiker. Body: { plaatsen: [{ plaats, landcode }] }.
// Per aanroep worden maximaal 60 nieuwe plaatsen opgezocht; plaatsen die niet
// meer behandeld konden worden komen terug als `resterend`, zodat de client
// opnieuw kan vragen voor de rest.
// Antwoord: { ok, resultaten: { "<plaats>||<landcode>": {lat, lon} of null },
//             opgezocht, resterend }

const norm = (s) => String(s || '').trim().toLowerCase();
const MAX_LOOKUPS = 60;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Niet aangemeld' }, { status: 401 });
    const db = base44.asServiceRole.entities;

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const aangevraagd = Array.isArray(body.plaatsen) ? body.plaatsen.slice(0, 500) : [];

    // Unieke, geldige plaatsen (hoofdletterongevoelig, landcode = 2 letters)
    const gevraagd = [];
    const gezien = new Set();
    for (const p of aangevraagd) {
      const plaats = String(p?.plaats || '').trim();
      const landcode = String(p?.landcode || '').trim().toLowerCase();
      if (!plaats || !/^[a-z]{2}$/.test(landcode)) continue;
      const sleutel = `${norm(plaats)}||${landcode}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      gevraagd.push({ plaats, landcode, sleutel });
    }

    // Cache laden; hergebruik ook entries met een provincie-sleutel (uit de
    // bezoekersgeocoding), zodat dezelfde plaats niet twee keer opgezocht wordt.
    const opSleutel = new Map();
    const opPlaatsLand = new Map();
    for (const c of await db.Plaatscoordinaat.list('-created_date', 2000)) {
      opSleutel.set(c.sleutel, c);
      const k = `${norm(c.plaats)}|${norm(c.landcode)}`;
      const cur = opPlaatsLand.get(k);
      if (!cur || (!cur.gevonden && c.gevonden)) opPlaatsLand.set(k, c);
    }

    let opgezocht = 0;
    const resultaten = {};
    let resterend = 0;

    for (const g of gevraagd) {
      let c = opSleutel.get(g.sleutel);
      const alt = opPlaatsLand.get(`${norm(g.plaats)}|${g.landcode}`);
      if (!c || (!c.gevonden && alt?.gevonden)) c = alt;

      if (!c) {
        if (opgezocht >= MAX_LOOKUPS) { resterend++; continue; }
        const hit = await zoekPlaats({ plaats: g.plaats, landcode: g.landcode });
        opgezocht++;
        await nominatimSleep();
        c = await db.Plaatscoordinaat.create({
          sleutel: g.sleutel, plaats: g.plaats, provincie: '', landcode: g.landcode,
          lat: hit ? hit.lat : null, lon: hit ? hit.lon : null, gevonden: !!hit,
        });
        opSleutel.set(g.sleutel, c);
      }

      resultaten[g.sleutel] = c.gevonden && c.lat != null ? { lat: c.lat, lon: c.lon } : null;
    }

    return Response.json({ ok: true, resultaten, opgezocht, resterend });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}