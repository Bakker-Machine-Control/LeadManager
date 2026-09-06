// Maakt automatisch een contactpersoon in Zoho CRM aan zodra een lead van
// "Nieuw" naar "Contacten" gaat (Kanban-bord). Wordt aangeroepen door de
// entity-automation op Lead, maar kan ook handmatig met { lead_id }.
// De koppeling wordt op de Lead opgeslagen in zoho_contact_id / zoho_contact_url,
// en in de omschrijving van het Zoho-contact staat de verwijzing naar de lead-app.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Eerst EU proberen (Nederlands account), daarna de mondiale datacenter.
const ACCOUNT_HOSTS = ['https://accounts.zoho.eu', 'https://accounts.zoho.com'];

async function haalAccessToken() {
  const clientId = secrets.get('ZOHO_CLIENT_ID');
  const clientSecret = secrets.get('ZOHO_CLIENT_SECRET');
  const refreshToken = secrets.get('ZOHO_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho-secrets ontbreken (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN)');
  }
  let laatsteFout = null;
  for (const host of ACCOUNT_HOSTS) {
    const url = `${host}/oauth/v2/token?${new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })}`;
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (data.access_token) {
      const apiDomain = (data.api_domain || 'https://www.zohoapis.eu').replace(/\/$/, '');
      const crmHost = apiDomain.includes('.eu') ? 'crm.zoho.eu' : 'crm.zoho.com';
      return { accessToken: data.access_token, apiDomain, crmHost };
    }
    laatsteFout = data.error || `HTTP ${res.status}`;
  }
  throw new Error(`Geen Zoho-access-token ontvangen: ${laatsteFout}`);
}

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
    if (lead.zoho_contact_id) {
      return Response.json({ skipped: true, reden: 'Contactpersoon bestaat al in Zoho CRM', zoho_contact_id: lead.zoho_contact_id });
    }

    const { accessToken, apiDomain, crmHost } = await haalAccessToken();

    // Naam opdelen: first/last_name gaat voor, anders de volledige naam splitsen.
    const volledigeNaam = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || (lead.name || '').trim();
    const naamDelen = volledigeNaam.split(/\s+/).filter(Boolean);
    const firstName = lead.first_name || naamDelen[0] || 'Onbekend';
    const lastName = lead.last_name || naamDelen.slice(1).join(' ') || lead.company || 'Onbekend';

    const beschrijvingRegels = [
      `Contactpersoon uit de BMC lead-app (lead id: ${lead.id})`,
      `SmartSuite-lead: ${lead.smartsuite_id}`,
      lead.company ? `Bedrijf: ${lead.company}` : null,
      lead.bedrijf_sector ? `Sector: ${lead.bedrijf_sector}` : null,
      lead.bedrijf_activiteit ? `Activiteit: ${lead.bedrijf_activiteit}` : null,
      lead.machinepark ? `Machinepark: ${lead.machinepark}` : null,
      lead.score != null ? `Lead-score: ${lead.score} (${lead.score_label || 'onbekend'})` : null,
      lead.campagne ? `Campagne: ${lead.campagne}` : null,
      lead.bron ? `Bron: ${lead.bron}` : null,
      'Lead-app: https://adept-flow-bridge-sync.base44.app',
    ].filter(Boolean);

    const contact = {
      First_Name: firstName,
      Last_Name: lastName,
      Email: lead.email || undefined,
      Phone: lead.phone_e164 || lead.phone || undefined,
      Mailing_City: lead.bedrijf_plaats || lead.city || undefined,
      Mailing_Country: lead.phone_country || undefined,
      Department: lead.company || undefined,
      Lead_Source: 'Lead-app BMC',
      Description: beschrijvingRegels.join('\n'),
    };

    const maakRes = await fetch(`${apiDomain}/crm/v3/Contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [contact] }),
    });
    const maakData = await maakRes.json().catch(() => ({}));
    const record = maakData?.data?.[0];
    if (!record || record.code === 'ERROR' || !record.details?.id) {
      throw new Error(`Zoho weigerde de contactpersoon: ${JSON.stringify(record || maakData).slice(0, 300)}`);
    }
    const zohoContactId = record.details.id;

    // Directe link naar het contact opbouwen (hiervoor is het org-id nodig).
    let zohoContactUrl = null;
    try {
      const orgRes = await fetch(`${apiDomain}/crm/v3/org`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      const orgData = await orgRes.json().catch(() => ({}));
      const orgId = orgData?.org?.[0]?.id;
      if (orgId) zohoContactUrl = `https://${crmHost}/crm/${orgId}/tab/Contacts/${zohoContactId}`;
    } catch (e) { /* URL is nice-to-have; het ID is de koppeling */ }

    await svc.entities.Lead.update(lead.id, { zoho_contact_id: zohoContactId, zoho_contact_url: zohoContactUrl });
    await svc.entities.SyncLog.create({
      action: 'sync',
      status: 'success',
      message: `Contactpersoon aangemaakt in Zoho CRM voor lead ${lead.name || lead.id}`,
      records_affected: 1,
      details: { lead_id: lead.id, zoho_contact_id: zohoContactId, zoho_contact_url: zohoContactUrl },
    });

    return Response.json({ success: true, zoho_contact_id: zohoContactId, zoho_contact_url: zohoContactUrl });
  } catch (error) {
    try {
      await base44.asServiceRole.entities.SyncLog.create({
        action: 'sync',
        status: 'error',
        message: `Zoho-contact aanmaken mislukt: ${error.message}`,
      });
    } catch (e) { /* loggen mag niet blokkeren */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
}