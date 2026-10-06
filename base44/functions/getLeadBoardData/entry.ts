import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Leads voor het Kanban-bord en de Meta-pagina, in lichtgewicht vorm (zonder raw_data).
//
// Standaard (kolommodus): geeft per werkstatus het exacte totaal én de eerste
// kaarten terug, met paginering per kolom via `offsets`.
//   invoer:   { per_kolom: 100, score_label: '', offsets: { Nieuw: 0, Contacten: 0, ... } }
//   antwoord: { ok, per_kolom, wachtend_op_verrijking, kolommen: { Nieuw: { totaal, leads }, ... } }
//   Optioneel `alleen: 'Nieuw'` om uitsluitend één kolom te verversen (voor "Meer laden").
//
// Lijstmodus ({ modus: 'lijst', skip, limit, bron }): platte pagina met leads,
// gebruikt door de Meta-pagina. Optioneel `bron` filtert serverzijdig op
// herkomst (bijv. 'meta' voor BMC's eigen Meta-advertenties).

const STATUSSEN = ['Nieuw', 'Contacten', 'Afspraak', 'Afgerond', 'Afgewezen'];
const SCAN = 1000;

// Alleen de velden die het bord en de Meta-pagina nodig hebben
function leanLead(l) {
  return {
    id: l.id,
    smartsuite_id: l.smartsuite_id || '',
    name: l.name || '',
    company: l.company || '',
    city: l.city || '',
    phone: l.phone || '',
    phone_e164: l.phone_e164 || '',
    lead_date: l.lead_date || '',
    status: l.status || 'Nieuw',
    bron: l.bron || '',
    meta_lead_id: l.meta_lead_id || '',
    ad_id: l.ad_id || '',
    ad_naam: l.ad_naam || '',
    campagne: l.campagne || '',
    formulier: l.formulier || '',
    platform: l.platform || '',
    aangeleverde_tekst: l.aangeleverde_tekst || '',
    score: l.score ?? null,
    score_label: l.score_label || '',
    verrijking_status: l.verrijking_status || 'niet_verrijkt',
    bedrijf_adres: l.bedrijf_adres || '',
    bedrijf_postcode: l.bedrijf_postcode || '',
  };
}

// Telt het aantal leads dat aan de query voldoet. Bij grote bestanden is alles
// ophalen te zwaar, dus we tellen met lichtgewicht sondes (maximaal 1 record
// per aanroep) via skip in stappen van 1000: eerst wordt bepaald tussen welke
// twee posities de grens ligt, daarna verfijnt een binaire zoek de exacte
// telling. Elke ophaalactie blijft zo begrensd.
async function telLeads(base44, query) {
  const sonde = async (skip) =>
    (await base44.asServiceRole.entities.Lead.filter(query, '-created_date', 1, skip)).length > 0;

  if (!(await sonde(0))) return 0;

  // Grens bepalen in stappen van 1000: `laag` bestaat, `hoog` is leeg
  let laag = 0;
  let hoog = SCAN;
  while (await sonde(hoog)) {
    laag = hoog;
    hoog += SCAN;
    if (hoog > 200000) return laag; // veiligheidsklep
  }

  // Binaire verfijning tussen de laatste bestaande en de eerste lege positie
  while (hoog - laag > 1) {
    const midden = Math.floor((laag + hoog) / 2);
    if (await sonde(midden)) laag = midden;
    else hoog = midden;
  }
  return laag + 1;
}

// Kolompagina voor "Nieuw", op score aflopend.
//
// Of de databank leads zónder score vooraan of achteraan zet bij een aflopende
// sortering is niet gegarandeerd. Daarom wordt de pagina uit twee gescheiden
// stromen opgebouwd: eerst de leads mét score (score aflopend), daarna de nog
// niet verrijkte leads (nieuwste eerst). Zo staan verrijkte leads altijd
// bovenaan de kolom.
function nieuwPaginaUitMemory(rijen, perKolom, offset) {
  const metScore = rijen.filter((l) => l.score != null).sort((a, b) => b.score - a.score);
  const zonderScore = rijen
    .filter((l) => l.score == null)
    .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
  const alle = [...metScore, ...zonderScore];
  return alle.slice(offset, offset + perKolom);
}

// Kolompagina's en totalen verwerken voor de scanmodus (één ophaalbeurt).
function verwerkUitMemory(alles, doelStatussen, scoreLabel, perKolom, offsets, alleen) {
  const kolommen = {};
  let wachtendOpVerrijking = 0;
  for (const status of doelStatussen) {
    const rijen = alles.filter((l) => (l.status || 'Nieuw') === status);
    const offset = Math.max(Number(offsets[status]) || 0, 0);
    const pagina = status === 'Nieuw'
      ? nieuwPaginaUitMemory(rijen, perKolom, offset)
      : rijen
          .sort((a, b) => String(b.lead_date || '').localeCompare(String(a.lead_date || '')))
          .slice(offset, offset + perKolom);
    kolommen[status] = { totaal: rijen.length, leads: pagina.map(leanLead) };
  }
  if (!alleen) {
    wachtendOpVerrijking = alles.filter(
      (l) => (l.status || 'Nieuw') === 'Nieuw'
        && ['niet_verrijkt', 'mislukt'].includes(l.verrijking_status || 'niet_verrijkt'),
    ).length;
  }
  return { kolommen, wachtendOpVerrijking };
}

// Valback voor bestanden van SCAN records en meer: per kolom tellen met
// lichtgewicht sondes en per kolom één pagina ophalen. De kolommen worden na
// elkaar verwerkt: de data-API begrenst het aantal gelijktijdige aanroepen en
// het tellen doet veel kleine zoekopdrachten — parallel loopt dat tegen de
// snelheidslimiet aan.
async function verwerkMetSondes(base44, doelStatussen, scoreLabel, perKolom, offsets, alleen) {
  const kolommen = {};
  let wachtendOpVerrijking = 0;

  const taken = [];
  doelStatussen.forEach((status) => taken.push(async () => {
    const query = { status };
    if (scoreLabel) query.score_label = scoreLabel;

    const totaal = await telLeads(base44, query);

    let leads = [];
    const offset = Math.max(Number(offsets[status]) || 0, 0);
    if (totaal > offset) {
      // De kolom "Nieuw" staat op score aflopend (score eerst, daarna de nog
      // niet verrijkte leads op nieuwste eerst), de overige kolommen op
      // lead_date aflopend. Per kolom worden hoogstens per_kolom (max. 200)
      // records opgehaald, dus het blijft licht.
      let pagina;
      if (status === 'Nieuw') {
        const metScore = { ...query, score: { $ne: null } };
        const zonderScore = { ...query, score: null };
        const aantalMetScore = await telLeads(base44, metScore);
        pagina = [];
        if (offset < aantalMetScore) {
          const nodig = Math.min(perKolom, aantalMetScore - offset);
          pagina.push(...await base44.asServiceRole.entities.Lead.filter(metScore, '-score', nodig, offset));
        }
        if (pagina.length < perKolom) {
          const zonderOffset = Math.max(0, offset - aantalMetScore);
          pagina.push(...await base44.asServiceRole.entities.Lead.filter(
            zonderScore, '-created_date', perKolom - pagina.length, zonderOffset,
          ));
        }
      } else {
        pagina = await base44.asServiceRole.entities.Lead.filter(query, '-lead_date', perKolom, offset);
      }
      leads = pagina.map(leanLead);
    }
    kolommen[status] = { totaal, leads };
  }));

  // Teller "wachtend op verrijking": status Nieuw en nog niet (of mislukt) verrijkt
  if (!alleen) {
    taken.push(async () => {
      wachtendOpVerrijking = await telLeads(base44, {
        status: 'Nieuw',
        verrijking_status: { $in: ['niet_verrijkt', 'mislukt'] },
      });
    });
  }

  for (const taak of taken) await taak();
  return { kolommen, wachtendOpVerrijking };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    // --- lijstmodus: platte pagina, gebruikt door de Meta-pagina ---
    if (body.modus === 'lijst') {
      const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 1000);
      const skip = Math.max(Number(body.skip) || 0, 0);
      const bron = typeof body.bron === 'string' && body.bron.trim() ? body.bron.trim() : null;
      const query = bron ? { bron } : {};
      const batch = await base44.asServiceRole.entities.Lead.filter(query, '-created_date', limit, skip);
      return Response.json({
        ok: true,
        leads: batch.map(leanLead),
        has_more: batch.length === limit,
      });
    }

    // --- kolommodus voor het Kanban-bord ---
    let perKolom = Number(body.per_kolom);
    if (!Number.isFinite(perKolom) || perKolom < 1) perKolom = 100;
    if (perKolom > 200) perKolom = 200; // harde bovengrens voor de performance

    const scoreLabel = typeof body.score_label === 'string' ? body.score_label.trim() : '';
    const offsets = body.offsets && typeof body.offsets === 'object' ? body.offsets : {};
    const alleen = typeof body.alleen === 'string' && STATUSSEN.includes(body.alleen) ? body.alleen : null;
    const doelStatussen = alleen ? [alleen] : STATUSSEN;

    // Snelpad: één volledige ophaalbeurt is genoeg zolang de database onder de
    // scanlimiet blijft — alle kolommen worden dan in het geheugen verwerkt,
    // met slechts één databaseaanroep in plaats van tientallen sondes.
    const scanQuery = scoreLabel ? { score_label: scoreLabel } : {};
    const alles = await base44.asServiceRole.entities.Lead.filter(scanQuery, '-created_date', SCAN, 0);
    const uitMemory = alles.length < SCAN
      ? verwerkUitMemory(alles, doelStatussen, scoreLabel, perKolom, offsets, alleen)
      : null;

    const { kolommen, wachtendOpVerrijking } = uitMemory || await verwerkMetSondes(
      base44, doelStatussen, scoreLabel, perKolom, offsets, alleen,
    );

    return Response.json({
      ok: true,
      per_kolom: perKolom,
      ...(alleen ? {} : { wachtend_op_verrijking: wachtendOpVerrijking }),
      kolommen,
    });
  } catch (error) {
    console.error('getLeadBoardData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}