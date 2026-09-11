// Maakt automatisch een contactpersoon én bedrijf aan in de CRM-app (Base44
// hub-app) zodra een lead van "Nieuw" naar "Contacten" gaat. Wordt aangeroepen
// door de entity-automation op Lead, maar kan ook handmatig met { lead_id }.
// De CRM-ontvanger staat in AppSettings (crm_webhook_url + crm_api_key).
// Bestaat het bedrijf al in de CRM-app (exacte naamtreffer via hubGetCompanies),
// dan wordt het id meegepast zodat de ontvanger koppelt i.p.v. dupliceert.
// De koppelingen terug worden op de Lead opgeslagen in contact_fsm_id en
// company_fsm_id (plus de directe link in crm_contact_url).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { HUB_BASE_URL } from '../../shared/hubApp.ts';

export default async function(req) {
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;
  try {
    const payload = await req.json().catch(() => ({}));
    const leadId = payload.lead_id || payload.event?.entity_id || payload.data?.id;
    if (!leadId) return Response.json({ error: 'lead_id ontbreekt' }, { status: 400 });

    const lead = await svc.entities.Lead.get(leadId);
    if (!lead) return Response.json({ error: 'Lead niet gevonden' }, { status: 404 });
    if (lead.status !== 'Contacten') {
      return Response.json({ skipped: true, reden: `Status is "${lead.status}" \u2014 contactpersoon wordt alleen aangemaakt bij Contacten` });
    }
    if (lead.contact_fsm_id) {
      return Response.json({ skipped: true, reden: 'Contactpersoon bestaat al in de CRM-app', contact_fsm_id: lead.contact_fsm_id });
    }

    const settings = await svc.entities.AppSettings.filter({ key: 'main' });
    const instelling = settings?.[0];
    const webhookUrl = instelling?.crm_webhook_url;
    const apiKey = instelling?.crm_api_key;
    if (!webhookUrl || !apiKey) {
      throw new Error('CRM-koppeling is niet geconfigureerd \u2014 vul de CRM Webhook URL en API-sleutel in bij Instellingen');
    }

    // Bestaand bedrijf opzoeken in de CRM-app, zodat de ontvanger kan
    // koppelen in plaats van een dubbel bedrijf aan te maken. Alleen bij
    // een exacte naamtreffer wordt het id meegegeven.
    let bestaandBedrijfId = lead.company_fsm_id || null;
    let bestaandBedrijfNaam = null;
    const bedrijfsNaam = (lead.company || '').trim();
    if (!bestaandBedrijfId && bedrijfsNaam && instelling?.hub_api_key) {
      try {
        const zoekRes = await fetch(
          `${HUB_BASE_URL}/hubGetCompanies?q=${encodeURIComponent(bedrijfsNaam)}`,
          { headers: { 'x-hub-api-key': instelling.hub_api_key } },
        );
        if (zoekRes.ok) {
          const zoekData = await zoekRes.json().catch(() => null);
          const lijst = Array.isArray(zoekData)
            ? zoekData
            : (zoekData?.data || zoekData?.results || zoekData?.bedrijven || []);
          const exact = lijst.find((b) =>
            typeof b?.name === 'string' && b.name.trim().toLowerCase() === bedrijfsNaam.toLowerCase());
          if (exact) {
            bestaandBedrijfId = exact.id;
            bestaandBedrijfNaam = exact.name;
          }
        }
      } catch { /* bedrijf zoeken mag de contactpersoon-push niet blokkeren */ }
    }

    // Alle leadgegevens + de koppeling terug naar de lead-app meesturen.
    const body = {
      lead_app_id: lead.id,
      lead_app_url: 'https://adept-flow-bridge-sync.base44.app',
      smartsuite_id: lead.smartsuite_id,
      first_name: lead.first_name || null,
      last_name: lead.last_name || null,
      name: lead.name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      phone_e164: lead.phone_e164 || null,
      phone_country: lead.phone_country || null,
      company: lead.company || null,
      city: lead.city || null,
      status: lead.status,
      lead_date: lead.lead_date || null,
      eigenaar: lead.eigenaar || null,
      opvolgdatum: lead.opvolgdatum || null,
      bron: lead.bron || null,
      score: lead.score != null ? lead.score : null,
      score_label: lead.score_label || null,
      score_reden: lead.score_reden || null,
      verrijking_status: lead.verrijking_status || null,
      bedrijf_website: lead.bedrijf_website || null,
      bedrijf_sector: lead.bedrijf_sector || null,
      bedrijf_omvang: lead.bedrijf_omvang || null,
      bedrijf_plaats: lead.bedrijf_plaats || null,
      bedrijf_activiteit: lead.bedrijf_activiteit || null,
      machinepark: lead.machinepark || null,
      campagne: lead.campagne || null,
      ad_naam: lead.ad_naam || null,
      platform: lead.platform || null,
      // Bedrijf: de ontvanger koppelt het bestaande bedrijf (id) of maakt
      // een nieuw bedrijf aan met onderstaande gegevens.
      bestaand_bedrijf_id: bestaandBedrijfId,
      bestaand_bedrijf_naam: bestaandBedrijfNaam,
      bedrijf_adres: lead.bedrijf_adres || null,
      bedrijf_postcode: lead.bedrijf_postcode || null,
      bedrijf_kvk: lead.bedrijf_kvk || null,
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`CRM-app weigerde het contact (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
    }

    const contactId = data.contact_id || data.id || data?.contact?.id;
    if (!contactId) {
      throw new Error(`CRM-app stuurde geen contact_id terug: ${JSON.stringify(data).slice(0, 300)}`);
    }
    const contactUrl = data.contact_url || data.contact?.url || null;
    // Optioneel: als de ontvanger ook het bedrijf (heeft) aangemaakt, wordt
    // het id hier opgehaald en op de lead opgeslagen in company_fsm_id.
    const companyId = data.company_id || data.bedrijf_id || data?.company?.id || bestaandBedrijfId || null;

    await svc.entities.Lead.update(lead.id, {
      contact_fsm_id: contactId,
      crm_contact_url: contactUrl,
      ...(companyId ? { company_fsm_id: companyId } : {}),
    });
    await svc.entities.SyncLog.create({
      action: 'sync',
      status: 'success',
      message: `Contactpersoon${companyId ? ' en bedrijf' : ''} aangemaakt in de CRM-app voor lead ${lead.name || lead.id}`,
      records_affected: 1,
      details: { lead_id: lead.id, contact_fsm_id: contactId, crm_contact_url: contactUrl, company_fsm_id: companyId },
    });

    return Response.json({ success: true, contact_fsm_id: contactId, crm_contact_url: contactUrl, company_fsm_id: companyId });
  } catch (error) {
    try {
      await base44.asServiceRole.entities.SyncLog.create({
        action: 'sync',
        status: 'error',
        message: `CRM-contact aanmaken mislukt: ${error.message}`,
      });
    } catch (e) { /* loggen mag niet blokkeren */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
}