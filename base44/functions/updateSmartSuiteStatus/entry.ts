import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_token, account_id, solution_id, table_id, record_id, status_field_slug, status_value } = body;

    if (!api_token || !account_id || !solution_id || !table_id || !record_id) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const url = `https://app.smartsuite.com/api/v1/applications/${solution_id}/records/${record_id}/`;
    const patchBody = {};
    patchBody[status_field_slug || 'status'] = status_value;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${api_token}`,
        'ACCOUNT-ID': account_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `SmartSuite PATCH error: ${response.status} - ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    return Response.json({ success: true, record: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});