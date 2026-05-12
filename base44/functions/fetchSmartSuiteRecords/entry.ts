import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    let { api_token, account_id, solution_id, table_id } = body;

    // If not in payload, fetch from AppSettings
    if (!api_token || !account_id || !solution_id || !table_id) {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
      if (settings.length === 0) {
        return Response.json({ error: 'No SmartSuite credentials configured' }, { status: 400 });
      }
      const s = settings[0];
      api_token = api_token || s.smartsuite_api_token;
      account_id = account_id || s.smartsuite_account_id;
      solution_id = solution_id || s.smartsuite_solution_id;
      table_id = table_id || s.smartsuite_table_id;
    }

    if (!api_token || !account_id || !solution_id || !table_id) {
      return Response.json({ error: 'Missing SmartSuite credentials in payload or settings' }, { status: 400 });
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
        body: JSON.stringify({ limit: 1000, offset: 0 }),
      }),
      fetch(`https://app.smartsuite.com/api/v1/applications/${table_id}/`, {
        method: 'GET',
        headers,
      }),
    ]);

    if (!recordsResp.ok) {
      const errText = await recordsResp.text();
      const isRateLimit = recordsResp.status === 429 || errText.includes('Just a moment');
      if (isRateLimit) {
        return Response.json({ error: 'SmartSuite API rate limit bereikt. Wacht even en probeer het opnieuw.' }, { status: 429 });
      }
      return Response.json({ error: `SmartSuite API error: ${recordsResp.status}` }, { status: 502 });
    }

    const rawText = await recordsResp.text();
    if (rawText.includes('Just a moment') || rawText.includes('challenge')) {
      return Response.json({ error: 'SmartSuite API rate limit bereikt (Cloudflare). Wacht even en probeer het opnieuw.' }, { status: 429 });
    }
    const data = JSON.parse(rawText);

    // Build slug -> label map from structure
    let fieldLabels = {};
    if (structureResp.ok) {
      const structure = await structureResp.json();
      const fields = structure.structure || [];
      fields.forEach(f => {
        if (f.slug && f.label) fieldLabels[f.slug] = f.label;
      });
    }

    const items = data.items || [];
    // Log first record keys and fieldLabels for debugging
    if (items.length > 0) {
      console.log('FIELD_LABELS:', JSON.stringify(fieldLabels));
      console.log('FIRST_RECORD_KEYS:', JSON.stringify(Object.keys(items[0])));
      console.log('FIRST_RECORD_SAMPLE:', JSON.stringify(items[0]));
    }
    return Response.json({ items, total: data.total || 0, fieldLabels });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});