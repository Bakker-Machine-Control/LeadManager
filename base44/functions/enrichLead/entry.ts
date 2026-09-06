import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Versiemarkering van de scorerubriek, zodat in het antwoord zichtbaar is
// welke versie van de rubriek live draait.
const RUBRIEK_VERSIE = '2026-09-06-machinebesturing';

// ============================================================================
// SCORINGRUBRIEK — bewust als leesbare constanten bovenin, zodat de score
// uitleegbaar en aanpasbaar blijft. Het model levert alleen feiten; het
// cijfer wordt hieronder in code berekend, nooit door het model zelf.
// ============================================================================

const PUNTEN_LAND_NL_BE = 25; // NL of BE: binnen het verzorgingsgebied van BMC
const PUNTEN_SECTOR = {
  grondverzet_infra_gww: 25,
  sloop: 22,
  loonwerk_agrarisch: 15,
  bouw_aannemer_algemeen: 15,
  verhuur_materieel: 8,
  particulier_zzp: 5,
  niet_relevant: 0,
  onbekend: 5,
};
const PUNTEN_MACHINEPARK = {
  ja_graafmachines: 20,
  ja_overig_materieel: 8,
  onbekend: 4,
  nee: 0,
};
// Bedrijfsomvang en "heeft een website" wegen bewust licht: bijna elk echt
// bedrijf heeft een website, dus dat onderdeel onderscheidt nauwelijks. De
// vrijgekomen ruimte gaat naar machinebesturing, dat wel onderscheidt.
const PUNTEN_MEDEWERKERS = {
  '5_tm_50': 5,
  'meer_dan_50': 4,
  '1_tm_4': 3,
  onbekend: 2,
};
const PUNTEN_GEVONDEN_MET_WEBSITE = 5;
const PUNTEN_GEVONDEN_ZONDER_WEBSITE = 2;
const PUNTEN_BESLISSER = { ja: 10, onbekend: 3, nee: 0 };
// Werkt het bedrijf al met 3D-machinebesturing (Leica, Trimble, Topcon,
// Novatron, Xsite, Unicontrol), dan levert dat PUNten op in plaats van kost:
// een bedrijf dat er al mee werkt is bewezen overtuigd van de techniek en dus
// juist een goede prospect, geen afvaller. "nee" kost geen punten — dat is de
// normale uitgangssituatie.
const PUNTEN_MACHINEBESTURING = { ja: 10, onbekend: 0, nee: 0 };
const KORTING_ZEKERHEID_LAAG = 0.8; // bij zekerheid 'laag' wordt het eindtotaal met 20% verlaagd

// Leesbare tekst per medewerkers-indicatie, voor het veld bedrijf_omvang
const MEDEWERKERS_TEKST = {
  '1_tm_4': '1–4 medewerkers',
  '5_tm_50': '5–50 medewerkers',
  'meer_dan_50': 'meer dan 50 medewerkers',
  onbekend: 'onbekend',
};

// Gratis e-mailproviders: zo'n domein zegt niets over het bedrijf
const GRATIS_DOMEIN_DELEN = ['gmail', 'hotmail', 'outlook', 'live', 'icloud', 'ziggo', 'kpnmail', 'telenet', 'yahoo', 'proton'];

// Onderdelen voor de score_reden, in het Nederlands
const SECTOR_NAAMWOORD = {
  grondverzet_infra_gww: 'grondverzet-/GWW-bedrijf',
  sloop: 'sloopbedrijf',
  loonwerk_agrarisch: 'agrarisch loonwerkbedrijf',
  bouw_aannemer_algemeen: 'bouw- en aannemingsbedrijf',
  verhuur_materieel: 'materieelverhuurbedrijf',
  particulier_zzp: 'particulier/ZZP',
  niet_relevant: 'bedrijf buiten de doelgroep',
  onbekend: 'bedrijf met onbekende sector',
};
const MACHINEPARK_ZINSDEEL = {
  ja_graafmachines: 'met eigen graafmachines',
  ja_overig_materieel: 'met eigen overig materieel',
  nee: 'zonder eigen machinepark',
  onbekend: '',
};

// JSON-schema van de online zoekopdracht
const VERRIJKING_SCHEMA = {
  type: 'object',
  properties: {
    gevonden_bedrijf: { type: 'boolean' },
    zekerheid: { type: 'string', enum: ['hoog', 'midden', 'laag'] },
    bedrijfsnaam: { type: 'string' },
    website: { type: 'string' },
    kvk_nummer: { type: 'string' },
    land: { type: 'string', enum: ['NL', 'BE', 'anders', ''] },
    plaats: { type: 'string' },
    sector: { type: 'string' },
    sector_categorie: {
      type: 'string',
      enum: ['grondverzet_infra_gww', 'sloop', 'loonwerk_agrarisch', 'bouw_aannemer_algemeen', 'verhuur_materieel', 'particulier_zzp', 'niet_relevant', 'onbekend'],
    },
    activiteit: { type: 'string' },
    aantal_medewerkers_indicatie: { type: 'string', enum: ['1_tm_4', '5_tm_50', 'meer_dan_50', 'onbekend'] },
    eigen_machinepark: { type: 'string', enum: ['ja_graafmachines', 'ja_overig_materieel', 'nee', 'onbekend'] },
    machinepark_toelichting: { type: 'string' },
    gebruikt_3d_machinebesturing: { type: 'string', enum: ['ja', 'nee', 'onbekend'] },
    machinebesturing_toelichting: { type: 'string' },
    rol_persoon: { type: 'string' },
    is_beslisser: { type: 'string', enum: ['ja', 'nee', 'onbekend'] },
    bronnen: { type: 'array', items: { type: 'string' } },
    toelichting: { type: 'string' },
  },
  required: ['gevonden_bedrijf'],
};

// Domein uit een e-mailadres, of leeg
function emailDomein(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at === -1) return '';
  return s.slice(at + 1).toLowerCase();
}

// Is er genoeg om op te zoeken: een bedrijfsnaam, óf een e-maildomein
// dat geen gratis provider is
function heeftZoekgrondslag(lead) {
  if (lead.company) return true;
  const domein = emailDomein(lead.email);
  if (!domein) return false;
  return !GRATIS_DOMEIN_DELEN.some(d => domein.includes(d));
}

// Score in code berekenen uit de uitkomst van de zoekopdracht
function berekenScore(u) {
  let totaal = 0;
  if (u.land === 'NL' || u.land === 'BE') totaal += PUNTEN_LAND_NL_BE;
  totaal += PUNTEN_SECTOR[u.sector_categorie] ?? 0;
  totaal += PUNTEN_MACHINEPARK[u.eigen_machinepark] ?? 0;
  totaal += PUNTEN_MEDEWERKERS[u.aantal_medewerkers_indicatie] ?? 0;
  if (u.gevonden_bedrijf) {
    totaal += u.website ? PUNTEN_GEVONDEN_MET_WEBSITE : PUNTEN_GEVONDEN_ZONDER_WEBSITE;
  }
  totaal += PUNTEN_BESLISSER[u.is_beslisser] ?? 0;
  totaal += PUNTEN_MACHINEBESTURING[u.gebruikt_3d_machinebesturing] ?? 0;
  if (u.zekerheid === 'laag') totaal = totaal * KORTING_ZEKERHEID_LAAG;
  return Math.round(Math.max(0, Math.min(100, totaal)));
}

function scoreNaarLabel(score) {
  if (score >= 75) return 'Heet';
  if (score >= 50) return 'Warm';
  if (score >= 25) return 'Lauw';
  return 'Koud';
}

// Eén zin in het Nederlands met de twee of drie zwaarstwegende onderdelen
function bouwScoreReden(u) {
  if (!u.gevonden_bedrijf) {
    return 'Geen bedrijf met redelijke zekerheid aan deze lead te koppelen.';
  }
  const landPrefix = u.land === 'NL' ? 'Nederlands ' : u.land === 'BE' ? 'Belgisch ' : '';
  let sector = SECTOR_NAAMWOORD[u.sector_categorie] || 'bedrijf met onbekende sector';
  if (u.land === 'anders') sector += ' buiten Nederland en België';
  const onderdelen = [(landPrefix + sector).trim()];
  const machineparkZinsdeel = MACHINEPARK_ZINSDEEL[u.eigen_machinepark] || '';
  if (machineparkZinsdeel) onderdelen.push(machineparkZinsdeel);
  let zin = onderdelen.join(' ');
  const omvang = MEDEWERKERS_TEKST[u.aantal_medewerkers_indicatie];
  if (omvang && omvang !== 'onbekend') zin += `, ${omvang}`;
  if (u.gebruikt_3d_machinebesturing === 'ja') zin += ', werkt al met 3D-machinebesturing';
  if (zin === 'bedrijf met onbekende sector') {
    return 'Onvoldoende online informatie voor een goede inschatting.';
  }
  return zin + '.';
}

// Online zoeken naar het bedrijf achter de lead
async function zoekOnline(base44, lead) {
  const naam = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name || '';
  const domein = emailDomein(lead.email);

  const prompt = `Je bent een onderzoeker voor een verkoper van 3D-machinebesturing voor graafmachines (BMC Consultancy).
Zoek ONLINE informatie op over het BEDRIJF achter de onderstaande lead.

GEGEVENS VAN DE LEAD:
- Naam: ${naam || 'onbekend'}
- Bedrijf: ${lead.company || 'onbekend'}
- Plaats: ${lead.city || 'onbekend'}
- E-maildomein: ${domein || 'onbekend'}
- Telefoonlandcode: ${lead.phone_country || 'onbekend'}
- Meta-campagne: ${lead.campagne || 'onbekend'}
- Meta-advertentie: ${lead.ad_naam || 'onbekend'}
- Meta-formulier: ${lead.formulier || 'onbekend'}
- Aangeleverde tekst: ${lead.aangeleverde_tekst || 'onbekend'}

STRIKTE REGELS:
1. Zoek uitsluitend naar het BEDRIJF, niet naar de persoon privé. Alleen de zakelijke rol van de persoon is relevant.
2. Verzin niets: laat een veld leeg ("") als het niet online te vinden is.
3. Zet gevonden_bedrijf op false als er geen bedrijf met redelijke zekerheid aan deze lead te koppelen is.
4. De doelgroep van de verkoper: Nederlandse en Belgische grondverzet-, infra-, GWW-, sloop- en loonwerkbedrijven met een eigen machinepark.
5. Let apart op of het bedrijf al met 3D-machinebesturing of maaiveldbesturing werkt (merken: Leica, Trimble, Topcon, Novatron, Xsite, MOBA, Unicontrol), bijvoorbeeld genoemd op de website, in projectfoto's of in vacatures. Zet gebruikt_3d_machinebesturing op "ja" alleen als daar een concrete aanwijzing voor is, anders "onbekend".
6. Vul tekstvelden in het Nederlands in en gebruik bij enumvelden precies de voorgeschreven waarden.`;

  const u = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    add_context_from_internet: true,
    model: 'gemini_3_flash',
    response_json_schema: VERRIJKING_SCHEMA,
  });

  if (!u || typeof u !== 'object' || typeof u.gevonden_bedrijf !== 'boolean') {
    throw new Error('Geen geldig antwoord van de online zoekopdracht.');
  }
  return u;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // ---- Toegang: ingelogde app-gebruiker óf x-hub-api-key (AppSettings.hub_shared_key) ----
    let toegang = false;
    try {
      const user = await base44.auth.me();
      if (user) toegang = true;
    } catch { /* niet ingelogd: probeer de API-sleutel */ }
    if (!toegang) {
      const apiKey = req.headers?.get?.('x-hub-api-key') || '';
      if (apiKey) {
        const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
        // hub_shared_key wordt hier uitsluitend gelezen, nooit geschreven
        if (settings[0]?.hub_shared_key && apiKey === settings[0].hub_shared_key) toegang = true;
      }
    }
    if (!toegang) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ---- Invoer: één lead of een partij ----
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    let leads = [];
    if (body.lead_id) {
      let lead = null;
      try {
        lead = await base44.asServiceRole.entities.Lead.get(body.lead_id);
      } catch { /* lead bestaat niet */ }
      if (!lead) {
        return Response.json({ ok: false, error: 'Lead niet gevonden.', rubriek_versie: RUBRIEK_VERSIE }, { status: 404 });
      }
      leads = [lead];
    } else {
      // Partij: hard maximaal 50, nieuwste eerst, alleen (nog) niet succesvol verrijkte leads
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
      const query = { verrijking_status: { $in: ['niet_verrijkt', 'mislukt'] } };
      if (body.status) query.status = body.status;
      leads = await base44.asServiceRole.entities.Lead.filter(query, '-created_date', limit);
    }

    // ---- Per lead verrijken; één fout mag de partij niet stoppen ----
    let gelukt = 0;
    let onvoldoende = 0;
    let mislukt = 0;
    const resultaten = [];

    for (const lead of leads) {
      try {
        if (!heeftZoekgrondslag(lead)) {
          await base44.asServiceRole.entities.Lead.update(lead.id, {
            verrijking_status: 'onvoldoende_gegevens',
            score_label: 'Onbekend',
            score_reden: 'Geen bedrijfsnaam en geen zakelijk e-maildomein om op te zoeken.',
          });
          onvoldoende++;
          resultaten.push({ lead_id: lead.id, naam: lead.name, score: null, score_label: 'Onbekend' });
          continue;
        }

        const u = await zoekOnline(base44, lead);
        const score = berekenScore(u);
        const scoreLabel = scoreNaarLabel(score);

        // Alleen verrijkingsvelden wegschrijven — status, eigenaar, opvolgdatum,
        // bron en raw_data blijven onaangetast
        await base44.asServiceRole.entities.Lead.update(lead.id, {
          score,
          score_label: scoreLabel,
          score_reden: bouwScoreReden(u),
          verrijkt_op: new Date().toISOString(),
          verrijking_status: 'gelukt',
          bedrijf_website: u.website || '',
          bedrijf_kvk: u.kvk_nummer || '',
          bedrijf_sector: u.sector || '',
          bedrijf_omvang: MEDEWERKERS_TEKST[u.aantal_medewerkers_indicatie] || 'onbekend',
          bedrijf_plaats: u.plaats || '',
          bedrijf_activiteit: u.activiteit || '',
          machinepark: u.machinepark_toelichting || '',
          gebruikt_machinebesturing: u.gebruikt_3d_machinebesturing === 'ja'
            ? (u.machinebesturing_toelichting || 'Ja, werkt al met 3D-machinebesturing')
            : '',
          verrijking: u,
        });

        gelukt++;
        resultaten.push({ lead_id: lead.id, naam: lead.name, score, score_label: scoreLabel });
      } catch (e) {
        console.error(`Verrijking mislukt voor lead ${lead.id}: ${e.message}`);
        try {
          await base44.asServiceRole.entities.Lead.update(lead.id, { verrijking_status: 'mislukt' });
        } catch { /* lead kon niet meer worden bijgewerkt */ }
        mislukt++;
        resultaten.push({ lead_id: lead.id, naam: lead.name, score: null, score_label: null });
      }
    }

    // ---- SyncLog per aanroep ----
    await base44.asServiceRole.entities.SyncLog.create({
      action: 'verrijking',
      status: mislukt === 0 ? 'success' : (gelukt + onvoldoende > 0 ? 'partial' : 'error'),
      message: `Leadverrijking: ${gelukt} gelukt, ${onvoldoende} onvoldoende gegevens, ${mislukt} mislukt (van ${leads.length} leads).`,
      records_affected: gelukt + onvoldoende,
      details: { rubriek_versie: RUBRIEK_VERSIE, gelukt, onvoldoende_gegevens: onvoldoende, mislukt, resultaten },
    });

    return Response.json({
      ok: true,
      rubriek_versie: RUBRIEK_VERSIE,
      verwerkt: leads.length,
      gelukt,
      onvoldoende_gegevens: onvoldoende,
      mislukt,
      resultaten,
    });
  } catch (error) {
    console.error('enrichLead error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}