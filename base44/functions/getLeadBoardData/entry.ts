import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Leads voor het Kanban-bord en de Meta-pagina, in lichtgewicht vorm (zonder raw_data).
//
// Standaard (kolommodus): geeft per werkstatus het exacte totaal én de eerste
// kaarten terug, met paginering per kolom via `offsets`.
//   invoer:   { per_kolom: 100, score_label: '', offsets: { Nieuw: 0, Contacten: 0, ... } }
//   antwoord: { ok, per_kolom, wachtend_op_verrijking, kolommen: { Nieuw: { totaal, leads }, ... } }
//   Optioneel `alleen: 'Nieuw'` om uitsluitend één kolom te verversen (voor "Meer laden").
//
// Lijstmodus ({ modus: 'lijst', skip, limit }): platte pagina met alle leads,
// gebruikt door de Meta-pagina.

const STATUSSEN = ['Nieuw', 'Contacten', 'Afspraak', 'Afgerond', 'Afgewezen'];
const STAP = 1000;

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
  };
}

// Telt het aantal leads dat aan de query voldoet. Bij 14k+ leads is alles
// ophalen veel te zwaar, dus we tellen met lichtgewicht sondes (maximaal 1
// record per aanroep) via skip in stappen van 1000: eerst wordt bepaald
// tussen welke twee posities de grens ligt, daarna verfijnt een binaire
// zoek de exacte telling. Elke ophaalactie blijft zo begrensd.
async function telLeads(base44, query) {
  const sonde = async (skip) =>
    (await base44.asServiceRole.entities.Lead.filter(query, '-created_date', 1, skip)).length > 0;

  if (!(await sonde(0))) return 0;

  // Grens bepalen in stappen van 1000: `laag` bestaat, `hoog` is leeg
  let laag = 0;
  let hoog = STAP;
  while (await sonde(hoog)) {
    laag = hoog;
    hoog += STAP;
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

// Eén pagina voor de kolom "Nieuw", op score aflopend.
//
// Of de databank leads zónder score vooraan of achteraan zet bij een aflopende
// sortering is niet gegarandeerd. Daarom wordt de pagina uit twee gescheiden
// stromen opgebouwd: eerst de leads mét score (score aflopend), daarna de nog
// niet verrijkte leads (nieuwste eerst). Zo staan verrijkte leads altijd
// bovenaan de kolom — over álle leads, niet alleen over de geladen pagina.
async function haalNieuwPagina(base44, query, perKolom, offset) {
  const metScore = { ...query, score: { $ne: null } };
  const aantalMetScore = await telLeads(base44, metScore);

  const pagina = [];
  if (offset < aantalMetScore) {
    const nodig = Math.min(perKolom, aantalMetScore - offset);
    pagina.push(...await base44.asServiceRole.entities.Lead.filter(metScore, '-score', nodig, offset));
  }
  if (pagina.length < perKolom) {
    const zonderScore = { ...query, score: null };
    const zonderOffset = Math.max(0, offset - aantalMetScore);
    pagina.push(...await base44.asServiceRole.entities.Lead.filter(
      zonderScore, '-created_date', perKolom - pagina.length, zonderOffset,
    ));
  }
  return pagina;
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
      const batch = await base44.asServiceRole.entities.Lead.list('-created_date', limit, skip);
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

    const kolommen = {};
    let wachtendOpVerrijking = 0;

    // De kolommen worden parallel verwerkt zodat het bord snel laadt
    const taken = doelStatussen.map(async (status) => {
      const query = { status };
      if (scoreLabel) query.score_label = scoreLabel;

      const totaal = await telLeads(base44, query);

      let leads = [];
      const offset = Math.max(Number(offsets[status]) || 0, 0);
      if (totaal > offset) {
        // De kolom "Nieuw" staat op score aflopend (zie haalNieuwPagina), de
        // overige kolommen op lead_date aflopend. Per kolom worden hoogstens
        // per_kolom (max. 200) records opgehaald, dus het blijft licht.
        const pagina = status === 'Nieuw'
          ? await haalNieuwPagina(base44, query, perKolom, offset)
          : await base44.asServiceRole.entities.Lead.filter(query, '-lead_date', perKolom, offset);
        leads = pagina.map(leanLead);
      }
      kolommen[status] = { totaal, leads };
    });

    // Teller "wachtend op verrijking": status Nieuw en nog niet (of mislukt) verrijkt
    if (!alleen) {
      taken.push(telLeads(base44, {
        status: 'Nieuw',
        verrijking_status: { $in: ['niet_verrijkt', 'mislukt'] },
      }).then(t => { wachtendOpVerrijking = t; }));
    }

    await Promise.all(taken);

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