import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { zoho_access_token, zoho_api_domain, leads } = body;

    if (!zoho_access_token) {
      return Response.json({ error: 'Missing Zoho access token' }, { status: 400 });
    }

    const domain = zoho_api_domain || 'https://www.zohoapis.com';
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
      };

      const upsertUrl = `${domain}/crm/v2/Leads/upsert`;
      const resp = await fetch(upsertUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${zoho_access_token}`,
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