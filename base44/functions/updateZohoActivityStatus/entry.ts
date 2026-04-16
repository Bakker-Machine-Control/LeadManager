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
    const { record_id, module, status, zoho_api_domain } = body;

    if (!record_id || !module) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const domain = zoho_api_domain || 'https://www.zohoapis.eu';
    const accessToken = await getZohoToken();

    const resp = await fetch(`${domain}/crm/v2/${module}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
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