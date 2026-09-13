import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Statistieken voor de Website-pagina (tab Overzicht en Kaart).
//
// invoer:   { periode: 'vandaag' | '7d' | '30d' | 'eigen', van?, tot? }
//           Bij 'eigen' zijn van en tot de ISO- of datumstrings van het formulier.
// antwoord: { ok, van, tot, bezoekers, bezoeken, nieuw, terugkerend, gem_duur,
//             top_paginas, bronnen, provincies, landen, nu_op_site, kaart }

function groepeer(items, sleutel) {
  const map = new Map();
  for (const item of items) {
    const waarde = item[sleutel];
    if (!waarde) continue;
    map.set(waarde, (map.get(waarde) || 0) + 1);
  }
  return [...map.entries()]
    .map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => b.aantal - a.aantal);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const nu = new Date();
    let van;
    let tot;
    const periode = typeof body.periode === 'string' && body.periode.trim() ? body.periode.trim() : '7d';
    if (periode === 'eigen') {
      van = new Date(body.van || nu.getTime() - 7 * 86400000);
      tot = new Date(body.tot || nu);
      if (isNaN(van.getTime())) van = new Date(nu.getTime() - 7 * 86400000);
      if (isNaN(tot.getTime())) tot = nu;
    } else if (periode === 'vandaag') {
      van = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()));
      tot = nu;
    } else {
      const dagen = periode === '30d' ? 30 : 7;
      van = new Date(nu.getTime() - dagen * 86400000);
      tot = nu;
    }
    const vanISO = van.toISOString();
    const totISO = tot.toISOString();

    const db = base44.asServiceRole.entities;

    // Bezoeken in de periode
    const bezoeken = await db.Bezoek.filter(
      { gestart_op: { $gte: vanISO, $lte: totISO } },
      '-gestart_op',
      1000
    );
    const bezoekerIds = new Set(bezoeken.map(b => b.bezoeker_id).filter(Boolean));

    // Bezoekers met activiteit in de periode (laatste bezoek binnen of na de start)
    const bezoekersRuim = await db.Bezoeker.filter(
      { laatste_bezoek: { $gte: vanISO } },
      '-laatste_bezoek',
      1000
    );
    const inPeriode = bezoekersRuim.filter(b => bezoekerIds.has(b.bezoeker_id));

    const vanMs = van.getTime();
    const nieuw = inPeriode.filter(b => new Date(b.eerste_bezoek || 0).getTime() >= vanMs).length;
    const terugkerend = inPeriode.length - nieuw;

    // Gemiddelde bezoekduur over bezoeken mét duur
    const metDuur = bezoeken.filter(b => b.duur > 0);
    const gemDuur = metDuur.length > 0
      ? Math.round(metDuur.reduce((som, b) => som + b.duur, 0) / metDuur.length)
      : null;

    // Top-10 pagina's
    const weergaven = await db.Paginaweergave.filter(
      { gestart_op: { $gte: vanISO, $lte: totISO } },
      '-gestart_op',
      1000
    );
    const perPad = new Map();
    for (const w of weergaven) {
      const pad = w.pad || w.url || '(onbekend)';
      const huidig = perPad.get(pad) || { pad, titel: '', weergaven: 0, duurTotaal: 0, metDuur: 0 };
      huidig.weergaven++;
      if (w.titel && !huidig.titel) huidig.titel = w.titel;
      if (w.duur > 0) {
        huidig.duurTotaal += w.duur;
        huidig.metDuur++;
      }
      perPad.set(pad, huidig);
    }
    const topPaginas = [...perPad.values()]
      .sort((a, b) => b.weergaven - a.weergaven)
      .slice(0, 10)
      .map(p => ({
        pad: p.pad,
        titel: p.titel,
        weergaven: p.weergaven,
        gem_duur: p.metDuur > 0 ? Math.round(p.duurTotaal / p.metDuur) : null,
      }));

    // Verdelingen
    const bronnen = groepeer(bezoeken, 'bron');
    const provincies = groepeer(inPeriode, 'provincie').slice(0, 10);
    const landen = groepeer(inPeriode, 'land').slice(0, 10);

    // Nu op de site: actieve bezoeken met een hartslag in de laatste 2 minuten
    const nuMs = Date.now();
    const live = (await db.Bezoek.filter({ actief: true }, '-gestart_op', 100)).filter(b => {
      const referentie = b.beeindigd_op || b.gestart_op;
      return referentie && new Date(referentie).getTime() >= nuMs - 2 * 60 * 1000;
    });
    const liveBezoekers = new Map(inPeriode.map(b => [b.bezoeker_id, b]));
    for (const id of new Set(live.map(b => b.bezoeker_id).filter(Boolean))) {
      if (!liveBezoekers.has(id)) {
        const gevonden = await db.Bezoeker.filter({ bezoeker_id: id }, '-created_date', 1);
        if (gevonden[0]) liveBezoekers.set(id, gevonden[0]);
      }
    }
    const nuOpSite = live.map(b => {
      const bz = liveBezoekers.get(b.bezoeker_id) || {};
      return {
        bezoek_id: b.bezoek_id,
        bezoeker_id: b.bezoeker_id,
        huidige_pagina: b.huidige_pagina || '',
        gestart_op: b.gestart_op,
        naam: bz.naam || '',
        bedrijf: bz.bedrijf || '',
        plaats: bz.plaats || '',
        landcode: bz.landcode || '',
      };
    });

    // Bezoekers voor de kaart (met coördinaten)
    const kaart = inPeriode
      .filter(b => b.lat != null && b.lon != null)
      .slice(0, 500)
      .map(b => ({
        bezoeker_id: b.bezoeker_id,
        naam: b.naam || '',
        bedrijf: b.bedrijf || '',
        plaats: b.plaats || '',
        land: b.land || '',
        landcode: b.landcode || '',
        lat: b.lat,
        lon: b.lon,
        laatste_bezoek: b.laatste_bezoek || '',
      }));

    return Response.json({
      ok: true,
      van: vanISO,
      tot: totISO,
      bezoekers: inPeriode.length,
      bezoeken: bezoeken.length,
      nieuw,
      terugkerend,
      gem_duur: gemDuur,
      top_paginas: topPaginas,
      bronnen,
      provincies,
      landen,
      nu_op_site: nuOpSite,
      kaart,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}