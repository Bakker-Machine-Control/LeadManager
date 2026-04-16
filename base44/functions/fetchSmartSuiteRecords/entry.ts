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

    const headers = {
      'Authorization': `Token ${api_token}`,
      'ACCOUNT-ID': account_id,
      'Content-Type': 'application/json',
    };

    // Fetch records and field structure in parallel
    const [recordsResp, structureResp] = await Promise.all([
      fetch(`https://app.smartsuite.com/api/v1/applications/${table_id}/records/list/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 500, offset: 0 }),
      }),
      fetch(`https://app.smartsuite.com/api/v1/applications/${table_id}/`, {
        method: 'GET',
        headers,
      }),
    ]);

    if (!recordsResp.ok) {
      const errText = await recordsResp.text();
      return Response.json({ error: `SmartSuite API error: ${recordsResp.status} - ${errText}` }, { status: 502 });
    }

    const data = await recordsResp.json();

    // Build slug -> label map from structure
    let fieldLabels = {};
    if (structureResp.ok) {
      const structure = await structureResp.json();
      const fields = structure.structure || [];
      fields.forEach(f => {
        if (f.slug && f.label) fieldLabels[f.slug] = f.label;
      });
    }

    return Response.json({ items: data.items || [], total: data.total || 0, fieldLabels });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});