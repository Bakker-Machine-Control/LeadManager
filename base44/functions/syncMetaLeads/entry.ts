import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// BMC's eigen Facebook-pagina (asset uit Meta Business Suite, business 113727034677197)
const PAGE_ID = '113725064677394';
const GRAPH = 'https://graph.facebook.com/v25.0';

// Vertaling van Meta-veldnamen naar Lead-velden. Meta gebruikt per taal andere
// standaardnamen (bijv. 'volledige_naam' in NL-formulieren); al het andere
// (vrije vragen) gaat naar aangeleverde_tekst.
const VELD_ALIASEN = {
  full_name: 'naam', volledige_naam: 'naam', name: 'naam',
  email: 'email', 'e-mailadres': 'email', email_address: 'email',
  phone_number: 'telefoon', telefoonnummer: 'telefoon', phone: 'telefoon',
  city: 'plaats', plaats: 'plaats', stad: 'plaats',
  company_name: 'bedrijf', bedrijfsnaam: 'bedrijf', company: 'bedrijf',
  country: 'land', land: 'land',
};

// Haalt alle pagina's van een Graph API endpoint op (volgt paging.next)
async function fetchAll(url) {
  const items = [];
  let next = url;
  while (next) {
    const resp = await fetch(next);
    const data = await resp.json();
    if (data.error) throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
    items.push(...(data.data || []));
    next = (data.paging && data.paging.next) || null;
  }
  return items;
}

// Zet een Meta leadgen-lead om naar een Lead-record
function mapLead(metaLead, formulierNaam) {
  const fields = {};
  for (const fd of metaLead.field_data || []) {
    fields[fd.name] = (fd.values || []).join(', ');
  }

  const naam = fields.full_name || '';
  const spatie = naam.indexOf(' ');

  // Vrije-vraag-antwoorden samenvoegen als aangeleverde tekst
  const vrijeTekst = Object.entries(fields)
    .filter(([k]) => !BEKENDE_VELDEN.includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return {
    smartsuite_id: `meta_${metaLead.id}`, // verplicht veld; eigen prefix zodat Meta-leads herkenbaar zijn
    name: naam,
    first_name: spatie > 0 ? naam.slice(0, spatie) : naam,
    last_name: spatie > 0 ? naam.slice(spatie + 1) : '',
    email: fields.email || '',
    phone: fields.phone_number || '',
    phone_e164: (fields.phone_number || '').replace(/\s+/g, ''),
    company: fields.company_name || '',
    city: fields.city || '',
    status: 'Nieuw',
    lead_date: metaLead.created_time || '',
    bron: 'meta',
    meta_lead_id: metaLead.id,
    ad_id: metaLead.ad_id || '',
    ad_naam: metaLead.ad_name || '',
    campagne: metaLead.campaign_name || '',
    formulier: formulierNaam,
    platform: metaLead.platform || '',
    aangeleverde_tekst: vrijeTekst || '',
    raw_data: { bron: 'meta_leadgen', field_data: metaLead.field_data || [] },
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Handmatige aanroep (knop op de Meta-pagina): alleen beheerders.
    // Geplande aanroep (automatisering) heeft geen gebruiker en geeft via_planner mee.
    let user = null;
    try { user = await base44.auth.me(); } catch (e) { user = null; }
    if (user) {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Alleen beheerders kunnen de Meta-sync starten' }, { status: 403 });
      }
    } else {
      let body = {};
      try { body = await req.json(); } catch (e) { body = {}; }
      if (!body.via_planner) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const token = secrets.get('META_SYSTEM_USER_TOKEN');
    if (!token) {
      return Response.json({ error: 'META_SYSTEM_USER_TOKEN is niet ingesteld' }, { status: 400 });
    }

    // Het systeemgebruikerstoken moet eerst worden omgewisseld voor een pagina-token
    // (Meta vereist een Page Access Token voor leadformulieren)
    const tokenResp = await fetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${token}`);
    const tokenData = await tokenResp.json();
    if (tokenData.error) {
      return Response.json(
        {
          error: `Kon geen pagina-token krijgen: ${tokenData.error.message}. ` +
            'Controleer of de systeemgebruiker in Meta Business Settings de pagina 113725064677394 als asset heeft met paginarechten.',
        },
        { status: 400 }
      );
    }
    const pageToken = tokenData.access_token;

    // Alle leadformulieren van de pagina ophalen
    const formUrl = `${GRAPH}/${PAGE_ID}/leadgen_forms?fields=id,name,status&access_token=${pageToken}&limit=100`;
    const forms = await fetchAll(formUrl);
    console.log(`${forms.length} leadformulieren gevonden op de pagina`);

    let received = 0;
    let created = 0;
    let updated = 0;
    const errors = [];

    for (const form of forms) {
      try {
        const leadsUrl = `${GRAPH}/${form.id}/leads?fields=id,ad_id,ad_name,campaign_name,platform,created_time,field_data&access_token=${pageToken}&limit=100`;
        const metaLeads = await fetchAll(leadsUrl);
        received += metaLeads.length;

        for (const metaLead of metaLeads) {
          try {
            const mapped = mapLead(metaLead, form.name);

            // Upsert op meta_lead_id: bestaat de lead al, dan alleen bijwerken
            const bestaand = await base44.asServiceRole.entities.Lead.filter({ meta_lead_id: metaLead.id });
            if (bestaand.length > 0) {
              await base44.asServiceRole.entities.Lead.update(bestaand[0].id, mapped);
              updated++;
            } else {
              await base44.asServiceRole.entities.Lead.create(mapped);
              created++;
            }
          } catch (leadError) {
            console.log(`Fout bij lead ${metaLead.id}: ${leadError.message}`);
            errors.push(`Lead ${metaLead.id}: ${leadError.message}`);
          }
        }
        console.log(`Formulier '${form.name}': ${metaLeads.length} leads verwerkt`);
      } catch (formError) {
        console.log(`Fout bij formulier ${form.id}: ${formError.message}`);
        errors.push(`Formulier ${form.id}: ${formError.message}`);
      }
    }

    const status = errors.length === 0 ? 'success' : (created + updated > 0 ? 'partial' : 'error');
    const message = `Meta-sync: ${received} leads opgehaald uit ${forms.length} formulieren (${created} nieuw, ${updated} bijgewerkt${errors.length ? `, ${errors.length} fouten` : ''})`;

    try {
      await base44.asServiceRole.entities.SyncLog.create({
        action: 'sync',
        status,
        message,
        records_affected: created + updated,
        details: { bron: 'meta', forms: forms.length, received, created, updated, errors: errors.slice(0, 10) },
      });
    } catch (logError) {
      console.log(`Kon synclog niet wegschrijven: ${logError.message}`);
    }

    return Response.json({ forms: forms.length, received, created, updated, errors: errors.length, status, message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}