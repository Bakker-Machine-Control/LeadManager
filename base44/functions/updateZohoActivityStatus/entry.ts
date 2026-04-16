import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { zoho_access_token, zoho_api_domain, record_id, module, status } = body;

    if (!zoho_access_token || !record_id || !module) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const domain = zoho_api_domain || 'https://www.zohoapis.com';
    const url = `${domain}/crm/v2/${module}`;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${zoho_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [{ id: record_id, Status: status }] }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `Zoho error: ${resp.status} - ${errText}` }, { status: 502 });
    }

    const data = await resp.json();
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});