import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DISTRIBUTOR_TABLE_ID = '67c02e0e0cf3caaa80b1ae2e';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_token, account_id } = body;

    if (!api_token || !account_id) {
      return Response.json({ error: 'Missing api_token or account_id' }, { status: 400 });
    }

    const headers = {
      'Authorization': `Token ${api_token}`,
      'ACCOUNT-ID': account_id,
      'Content-Type': 'application/json',
    };

    const resp = await fetch(`https://app.smartsuite.com/api/v1/applications/${DISTRIBUTOR_TABLE_ID}/records/list/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ limit: 500, offset: 0 }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `SmartSuite error: ${resp.status} - ${errText}` }, { status: 502 });
    }

    const data = await resp.json();
    const items = data.items || [];

    // Each record: id = internal SmartSuite ID, title field = name
    // Log first item to inspect structure
    if (items.length > 0) console.log('First distributor record keys:', JSON.stringify(Object.keys(items[0])));
    if (items.length > 0) console.log('First distributor record:', JSON.stringify(items[0]));

    const distributors = items.map(item => ({
      smartsuite_id: item.id,
      name: item.title || item.name ||
        Object.entries(item).find(([k, v]) => typeof v === 'string' && v.length > 2 && k !== 'id' && k !== 'application_id' && k !== 'application_slug')?.[1] ||
        item.id,
    })).filter(d => d.name);

    // Clear existing and re-insert using bulk operations
    const existing = await base44.asServiceRole.entities.Distributor.list();
    await Promise.all(existing.map(d => base44.asServiceRole.entities.Distributor.delete(d.id)));
    await base44.asServiceRole.entities.Distributor.bulkCreate(distributors);

    return Response.json({ count: distributors.length, distributors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});