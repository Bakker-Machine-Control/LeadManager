import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getZohoToken() {
  const resp = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('ZOHO_CLIENT_ID'),
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET'),
      refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN'),
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Zoho token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Zoho upsert supports max 100 records per call
async function upsertBatch(leads, domain, accessToken) {
  const zohoLeads = leads.map(lead => {
    const nameParts = (lead.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Onbekend';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;
    const obj = {
      First_Name: firstName,
      Last_Name: lastName,
      Phone: lead.phone || '',
      Company: lead.company || 'Onbekend',
      City: lead.city || '',
      ...(lead.email ? { Email: lead.email } : {}),
      ...(lead.notes ? { Description: lead.notes } : {}),
    };
    return obj;
  });

  // Use Phone as duplicate check (always present), add Email if available
  const hasMail = leads.some(l => l.email);
  const duplicateFields = hasMail ? ['Email', 'Phone'] : ['Phone'];

  const resp = await fetch(`${domain}/crm/v2/Leads/upsert`, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: zohoLeads,
      duplicate_check_fields: duplicateFields,
    }),
  });

  const respData = await resp.json();
  return respData.data || [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { leads, zoho_api_domain } = body;

    const domain = zoho_api_domain || 'https://www.zohoapis.eu';
    const accessToken = await getZohoToken();

    const BATCH_SIZE = 100;
    const results = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      const batchResults = await upsertBatch(batch, domain, accessToken);

      batch.forEach((lead, idx) => {
        const resultItem = batchResults[idx];
        const success = resultItem?.status === 'success' || resultItem?.code === 'SUCCESS';
        // Build a meaningful error message if not successful
        let message = resultItem?.message || 'Onbekende fout';
        if (!success && resultItem?.details) {
          const details = Object.entries(resultItem.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          message = `${message} (${details})`;
        }
        results.push({
          smartsuite_id: lead.smartsuite_id,
          success,
          zoho_id: resultItem?.details?.id || null,
          message,
          raw: resultItem,
        });
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});