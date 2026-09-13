import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { zoekPlaats, nominatimSleep } from '../../shared/nominatim.ts';

// Vult lat/lon in bij Bezoekers zonder coördinaten (bijv. geïmporteerd uit
// Zoho SalesIQ) op basis van plaats + provincie + landcode, via OpenStreetMap
// Nominatim. Resultaten worden per plaats gecachet in Plaatscoordinaat, zodat
// iedere plaats maar één keer opgezocht wordt (Nominatim: max 1 verzoek/s).
//
// Aanroepen: ingelogde gebruiker (admin) óf header x-website-track-key.
// Body (optioneel): { limit: 40 } — aantal Bezoekers per aanroep.
// Antwoord: { ok, bijgewerkt, opgezocht, nietGevonden, resterend }

const norm = (s) => String(s || '').trim().toLowerCase();

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // ---- Authenticatie: sleutel of ingelogde admin ----
    const apiKey = req.headers.get('x-website-track-key');
    let toegestaan = false;
    if (apiKey) {
      const settings = await db.AppSettings.filter({ key: 'main' });
      toegestaan = !!settings[0]?.website_track_key && apiKey === settings[0].website_track_key;
    } else {
      try { const user = await base44.auth.me(); toegestaan = !!user && user.role === 'admin'; } catch { toegestaan = false; }
    }
    if (!toegestaan) return Response.json({ error: 'Niet toegestaan' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

    // ---- Bezoekers zonder coördinaten maar met plaats ----
    const cache = new Map();
    for (const c of await db.Plaatscoordinaat.list('-created_date', 1000)) cache.set(c.sleutel, c);

    // Bezoekers zonder coördinaten, met plaats; plaatsen die al als 'niet
    // gevonden' in de cache staan worden overgeslagen.
    const kandidaten = (await db.Bezoeker.filter({ lat: null }, '-created_date', 500))
      .filter((b) => (b.lat === null || b.lat === undefined) && norm(b.plaats) && norm(b.landcode))
      .filter((b) => { const c = cache.get(`${norm(b.plaats)}|${norm(b.provincie)}|${norm(b.landcode)}`); return !c || c.gevonden; });
    const resterend = kandidaten.length;
    const batch = kandidaten.slice(0, limit);

    let bijgewerkt = 0, opgezocht = 0, nietGevonden = 0;

    for (const b of batch) {
      const sleutel = `${norm(b.plaats)}|${norm(b.provincie)}|${norm(b.landcode)}`;
      let c = cache.get(sleutel);
      if (!c) {
        opgezocht++;
        const hit = await zoekPlaats({ plaats: b.plaats, landcode: b.landcode, provincie: b.provincie });
        await nominatimSleep();
        c = await db.Plaatscoordinaat.create({
          sleutel, plaats: b.plaats, provincie: b.provincie || '', landcode: b.landcode,
          lat: hit ? Number(hit.lat) : null, lon: hit ? Number(hit.lon) : null, gevonden: !!hit,
        });
        cache.set(sleutel, c);
      }
      if (c.gevonden && c.lat !== null && c.lat !== undefined) {
        await db.Bezoeker.update(b.id, { lat: c.lat, lon: c.lon });
        bijgewerkt++;
      } else {
        nietGevonden++;
      }
    }

    return Response.json({ ok: true, bijgewerkt, opgezocht, nietGevonden, resterend: resterend - batch.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}