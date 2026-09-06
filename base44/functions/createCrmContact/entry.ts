// Maakt automatisch een contactpersoon aan in de CRM-app (Base44 hub-app)
// zodra een lead van "Nieuw" naar "Contacten" gaat. Wordt aangeroepen door de
// entity-automation op Lead, maar kan ook handmatig met { lead_id }.
// De CRM-ontvanger staat in AppSettings (crm_webhook_url + crm_api_key).
// De koppeling terug wordt op de Lead opgeslagen in contact_fsm_id
// (en de directe link in crm_contact_url).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

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

    await svc.entities.Lead.update(lead.id, { contact_fsm_id: contactId, crm_contact_url: contactUrl });
    await svc.entities.SyncLog.create({
      action: 'sync',
      status: 'success',
      message: `Contactpersoon aangemaakt in de CRM-app voor lead ${lead.name || lead.id}`,
      records_affected: 1,
      details: { lead_id: lead.id, contact_fsm_id: contactId, crm_contact_url: contactUrl },
    });

    return Response.json({ success: true, contact_fsm_id: contactId, crm_contact_url: contactUrl });
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