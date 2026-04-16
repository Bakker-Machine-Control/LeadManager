import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_token, account_id, solution_id, table_id } = body;

    if (!api_token || !account_id || !solution_id || !table_id) {
      return Response.json({ error: 'Missing required SmartSuite credentials' }, { status: 400 });
    }

    const url = `https://app.smartsuite.com/api/v1/applications/${solution_id}/records/list/`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${api_token}`,
        'ACCOUNT-ID': account_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: 200, offset: 0 }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `SmartSuite API error: ${response.status} - ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    return Response.json({ items: data.items || [], total: data.total || 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});