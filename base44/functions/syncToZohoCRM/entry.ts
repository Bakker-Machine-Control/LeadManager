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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { leads, zoho_api_domain } = body;

    const domain = zoho_api_domain || 'https://www.zohoapis.eu';
    const accessToken = await getZohoToken();
    const results = [];

    for (const lead of leads) {
      const nameParts = (lead.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';

      const zohoLead = {
        First_Name: firstName,
        Last_Name: lastName || firstName,
        Email: lead.email || '',
        Phone: lead.phone || '',
        Company: lead.company || 'Unknown',
        ...(lead.notes ? { Description: lead.notes } : {}),
      };

      const resp = await fetch(`${domain}/crm/v2/Leads/upsert`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [zohoLead],
          duplicate_check_fields: ['Email'],
        }),
      });

      const respData = await resp.json();
      const resultItem = respData.data?.[0];
      results.push({
        smartsuite_id: lead.smartsuite_id,
        success: resultItem?.status === 'success' || resultItem?.code === 'SUCCESS',
        zoho_id: resultItem?.details?.id || null,
        message: resultItem?.message || (resp.ok ? 'OK' : `HTTP ${resp.status}`),
        raw: resultItem,
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});