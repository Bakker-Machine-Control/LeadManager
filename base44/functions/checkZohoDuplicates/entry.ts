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

async function searchLeads(domain, accessToken, field, value) {
  if (!value) return null;
  const url = `${domain}/crm/v2/Leads/search?criteria=(${field}:equals:${encodeURIComponent(value)})`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.data?.[0] || null;
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
      // Check by email first, then by phone
      let match = null;
      if (lead.email) {
        match = await searchLeads(domain, accessToken, 'Email', lead.email);
      }
      if (!match && lead.phone) {
        match = await searchLeads(domain, accessToken, 'Phone', lead.phone);
      }

      results.push({
        smartsuite_id: lead.smartsuite_id,
        exists_in_zoho: !!match,
        zoho_id: match?.id || null,
        zoho_name: match ? `${match.First_Name || ''} ${match.Last_Name || ''}`.trim() : null,
        matched_on: match ? (lead.email && match.Email === lead.email ? 'email' : 'phone') : null,
      });
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});