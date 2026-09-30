import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Webhook voor de tracking-service op de Mac Studio: verwerkt batches
// websitebezoek-events voor de bezoekersregistratie (vervanging van het
// Bezoekers-scherm van Zoho SalesIQ).
//
// Authenticatie via de header x-website-track-key, die gelijk moet zijn aan
// AppSettings.website_track_key (record key 'main'). Is het veld leeg of
// klopt de sleutel niet, dan volgt 401.
//
// Body (JSON): { events: [...] } met per event:
//   type: 'pageview' | 'heartbeat' | 'leave'
//   bezoeker_id, bezoek_id, weergave_id, timestamp (ISO)
//   pageview: url, pad, titel, referrer, utm_source, utm_medium,
//             utm_campaign, utm_content, taal, browser, besturingssysteem,
//             apparaat, ip_adres, plaats, provincie, land, landcode,
//             lat, lon, bron
//   heartbeat/leave: duur (seconden op deze pagina tot nu toe)
//   configuratie (webshop, 30-09-2026): configuratie_id, omgeving, stap, stap_titel,
//             stappen_totaal, keuzes [{sku, naam}], totaal_excl_btw, totaal_incl_btw,
//             order_ref, toestemming, plus dezelfde locatie-/browservelden als
//             pageview. bezoeker_id/bezoek_id/weergave_id zijn optioneel: zonder
//             cookietoestemming stuurt de webshop geen bezoeker_id.
//
// Antwoord: { ok: true, verwerkt: n, fouten: [...] } — één fout event stopt
// de rest van de batch niet.

const tekst = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const getal = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const VERSIE = '2026-09-30-configuratie';
const zonderLeeg = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // ---- Authenticatie via x-website-track-key ----
    const apiKey = req.headers.get('x-website-track-key');
    if (!apiKey) {
      return Response.json({ error: 'Missing x-website-track-key header' }, { status: 401 });
    }
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const trackKey = settings[0]?.website_track_key;
    if (!trackKey || apiKey !== trackKey) {
      return Response.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // ---- Invoer ----
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const events = Array.isArray(body.events) ? body.events : [];
    if (events.length === 0) {
      return Response.json({ ok: true, versie: VERSIE, verwerkt: 0, fouten: [] });
    }

    const db = base44.asServiceRole.entities;
    const fouten = [];
    let verwerkt = 0;

    // Caches binnen deze batch: voorkomen dat herhaalde events in één batch
    // dezelfde records meerdere keren ophalen of aanmaken.
    const bezoekersCache = new Map();
    const bezoekenCache = new Map();

    const haalBezoeker = async (bezoekerId) => {
      if (bezoekersCache.has(bezoekerId)) return bezoekersCache.get(bezoekerId);
      const gevonden = await db.Bezoeker.filter({ bezoeker_id: bezoekerId }, '-created_date', 1);
      const record = gevonden[0] || null;
      bezoekersCache.set(bezoekerId, record);
      return record;
    };
    const haalBezoek = async (bezoekId) => {
      if (bezoekenCache.has(bezoekId)) return bezoekenCache.get(bezoekId);
      const gevonden = await db.Bezoek.filter({ bezoek_id: bezoekId }, '-created_date', 1);
      const record = gevonden[0] || null;
      bezoekenCache.set(bezoekId, record);
      return record;
    };

    // ---- Configuratie uit de webshop: upsert op configuratie_id ----
    const verwerkConfiguratie = async (event, timestamp) => {
      const configuratieId = tekst(event.configuratie_id);
      if (!configuratieId) throw new Error('configuratie_id ontbreekt');
      const keuzes = Array.isArray(event.keuzes)
        ? event.keuzes.slice(0, 40).map((k) => ({ sku: tekst(k?.sku), naam: tekst(k?.naam) }))
        : null;
      const stap = getal(event.stap);
      const orderRef = tekst(event.order_ref);
      const gegevens = zonderLeeg({
        omgeving: ['staging', 'productie'].includes(tekst(event.omgeving)) ? tekst(event.omgeving) : '',
        laatst_actief: timestamp,
        stappen_totaal: getal(event.stappen_totaal),
        totaal_excl_btw: getal(event.totaal_excl_btw),
        totaal_incl_btw: getal(event.totaal_incl_btw),
        toestemming: event.toestemming === true,
        bezoeker_id: event.toestemming === true ? tekst(event.bezoeker_id) : '',
        bezoek_id: event.toestemming === true ? tekst(event.bezoek_id) : '',
        plaats: tekst(event.plaats),
        provincie: tekst(event.provincie),
        land: tekst(event.land),
        landcode: tekst(event.landcode),
        lat: getal(event.lat),
        lon: getal(event.lon),
        ip_adres: tekst(event.ip_adres),
        browser: tekst(event.browser),
        besturingssysteem: tekst(event.besturingssysteem),
        apparaat: ['desktop', 'mobiel', 'tablet'].includes(tekst(event.apparaat)) ? tekst(event.apparaat) : '',
      });
      if (keuzes) {
        gegevens.keuzes = keuzes;
        gegevens.keuzes_tekst = keuzes.map((k) => k.naam || k.sku).filter(Boolean).join(', ');
      }
      if (orderRef) {
        gegevens.order_ref = orderRef;
        gegevens.status = 'aangevraagd';
      }
      const bestaand = (await db.Configuratie.filter({ configuratie_id: configuratieId }, '-created_date', 1))[0];
      if (!bestaand) {
        await db.Configuratie.create({
          configuratie_id: configuratieId,
          gestart_op: timestamp,
          status: orderRef ? 'aangevraagd' : 'bezig',
          laatste_stap: stap ?? 1,
          laatste_stap_titel: tekst(event.stap_titel),
          referrer: tekst(event.referrer),
          bron: tekst(event.bron),
          utm_source: tekst(event.utm_source),
          utm_medium: tekst(event.utm_medium),
          utm_campaign: tekst(event.utm_campaign),
          ...gegevens,
        });
        return;
      }
      // Nooit terug in de tijd: hoogste stap blijft staan, 'aangevraagd' blijft aangevraagd.
      if (stap !== null && stap > (bestaand.laatste_stap || 0)) {
        gegevens.laatste_stap = stap;
        gegevens.laatste_stap_titel = tekst(event.stap_titel);
      }
      if (bestaand.status === 'aangevraagd') delete gegevens.status;
      await db.Configuratie.update(bestaand.id, gegevens);
    };

    for (const event of events) {
      try {
        const type = tekst(event?.type);
        if (type === 'configuratie') {
          await verwerkConfiguratie(event, tekst(event?.timestamp) || new Date().toISOString());
          verwerkt++;
          continue;
        }
        const bezoekerId = tekst(event?.bezoeker_id);
        const bezoekId = tekst(event?.bezoek_id);
        const weergaveId = tekst(event?.weergave_id);
        const timestamp = tekst(event?.timestamp) || new Date().toISOString();

        if (!['pageview', 'heartbeat', 'leave'].includes(type)) {
          throw new Error(`onbekend event-type: ${type || '(leeg)'}`);
        }
        if (!bezoekerId || !bezoekId || !weergaveId) {
          throw new Error('bezoeker_id, bezoek_id of weergave_id ontbreekt');
        }

        if (type === 'pageview') {
          // ---- Bezoeker upserten ----
          const locatieEnBrowser = zonderLeeg({
            plaats: tekst(event.plaats),
            provincie: tekst(event.provincie),
            land: tekst(event.land),
            landcode: tekst(event.landcode),
            lat: getal(event.lat),
            lon: getal(event.lon),
            browser: tekst(event.browser),
            besturingssysteem: tekst(event.besturingssysteem),
            apparaat: tekst(event.apparaat),
            taal: tekst(event.taal),
            ip_adres: tekst(event.ip_adres),
          });

          let bezoeker = await haalBezoeker(bezoekerId);
          if (!bezoeker) {
            bezoeker = await db.Bezoeker.create({
              bezoeker_id: bezoekerId,
              eerste_bezoek: timestamp,
              laatste_bezoek: timestamp,
              eerste_bron: tekst(event.bron) || 'direct',
              eerste_referrer: tekst(event.referrer),
              aantal_bezoeken: 0,
              aantal_paginas_totaal: 0,
              totale_duur: 0,
              status: 'anoniem',
              ...locatieEnBrowser,
            });
          } else {
            bezoeker = await db.Bezoeker.update(bezoeker.id, {
              laatste_bezoek: timestamp,
              ...locatieEnBrowser,
            });
          }
          bezoekersCache.set(bezoekerId, bezoeker);

          // ---- Bezoek upserten ----
          let bezoek = await haalBezoek(bezoekId);
          const nieuwBezoek = !bezoek;
          if (nieuwBezoek) {
            bezoek = await db.Bezoek.create({
              bezoek_id: bezoekId,
              bezoeker_id: bezoekerId,
              gestart_op: timestamp,
              landingspagina: tekst(event.url),
              referrer: tekst(event.referrer),
              bron: tekst(event.bron) || 'direct',
              utm_source: tekst(event.utm_source),
              utm_medium: tekst(event.utm_medium),
              utm_campaign: tekst(event.utm_campaign),
              utm_content: tekst(event.utm_content),
              aantal_paginas: 0,
              actief: true,
              huidige_pagina: tekst(event.pad),
            });
          }

          // ---- Paginaweergave idempotent aanmaken ----
          const bestaande = await db.Paginaweergave.filter({ weergave_id: weergaveId }, '-created_date', 1);
          if (bestaande.length === 0) {
            await db.Paginaweergave.create({
              weergave_id: weergaveId,
              bezoek_id: bezoekId,
              bezoeker_id: bezoekerId,
              url: tekst(event.url),
              pad: tekst(event.pad),
              titel: tekst(event.titel),
              gestart_op: timestamp,
              volgorde: (bezoek.aantal_paginas || 0) + 1,
            });
            bezoek = await db.Bezoek.update(bezoek.id, {
              aantal_paginas: (bezoek.aantal_paginas || 0) + 1,
              huidige_pagina: tekst(event.pad),
              uitgangspagina: tekst(event.url),
              actief: true,
            });
          } else {
            bezoek = await db.Bezoek.update(bezoek.id, {
              huidige_pagina: tekst(event.pad),
              uitgangspagina: tekst(event.url),
              actief: true,
            });
          }
          bezoekenCache.set(bezoekId, bezoek);

          // ---- Nieuw bezoek telt op het bezoekerstotaal ----
          if (nieuwBezoek) {
            bezoekersCache.set(
              bezoekerId,
              await db.Bezoeker.update(bezoeker.id, {
                aantal_bezoeken: (bezoeker.aantal_bezoeken || 0) + 1,
              })
            );
          }
        } else {
          // ---- heartbeat of leave ----
          const duur = getal(event.duur);
          // Bezoeker in de cache zetten zodat de totalen na de batch ook
          // herberekend worden als deze batch geen pageview bevat.
          await haalBezoeker(bezoekerId);

          const bestaande = await db.Paginaweergave.filter({ weergave_id: weergaveId }, '-created_date', 1);
          if (bestaande.length > 0 && duur !== null && (bestaande[0].duur || 0) < duur) {
            await db.Paginaweergave.update(bestaande[0].id, { duur });
          }

          const bezoek = await haalBezoek(bezoekId);
          if (bezoek) {
            const gestartMs = new Date(bezoek.gestart_op).getTime();
            const beeindigdMs = new Date(timestamp).getTime();
            const bezoekDuur =
              Number.isFinite(gestartMs) && beeindigdMs > gestartMs
                ? Math.round((beeindigdMs - gestartMs) / 1000)
                : bezoek.duur || 0;
            const update = { beeindigd_op: timestamp, duur: bezoekDuur };
            if (type === 'leave') update.actief = false;
            bezoekenCache.set(bezoekId, await db.Bezoek.update(bezoek.id, update));
          }
        }

        verwerkt++;
      } catch (eventFout) {
        fouten.push({
          weergave_id: tekst(event?.weergave_id),
          type: tekst(event?.type),
          fout: eventFout.message,
        });
      }
    }

    // ---- Totalen van de geraakte bezoekers herberekenen ----
    for (const bezoekerId of bezoekersCache.keys()) {
      const bezoeker = bezoekersCache.get(bezoekerId);
      if (!bezoeker) continue;
      const alleBezoeken = await db.Bezoek.filter({ bezoeker_id: bezoekerId }, '-gestart_op', 500);
      const totaleDuur = alleBezoeken.reduce((som, b) => som + (b.duur || 0), 0);
      const paginasTotaal = alleBezoeken.reduce((som, b) => som + (b.aantal_paginas || 0), 0);
      await db.Bezoeker.update(bezoeker.id, { totale_duur: totaleDuur, aantal_paginas_totaal: paginasTotaal });
    }

    return Response.json({ ok: true, versie: VERSIE, verwerkt, fouten });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}