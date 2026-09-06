import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { mapRecord, upsertRecord } from '../../shared/leadMapping.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Validate webhook secret from query param or request body (body één keer lezen)
    const url = new URL(req.url);
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { body = {}; }
    const secret = url.searchParams.get('secret') || body.secret;
    if (secret !== 'leadbridge-2024') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Determine payload type: batch array or single record
    const records = body.records || (body.record ? [body.record] : []);

    if (records.length === 0) {
      return Response.json({ ok: false, error: 'No records provided' }, { status: 400 });
    }

    let created = 0, updated = 0, errors = 0;
    const errorDetails = [];

    for (const record of records) {
      try {
        if (!record.id) {
          errors++;
          errorDetails.push({ id: record.id || '?', error: 'record zonder id' });
          continue;
        }
        const leadData = mapRecord(record);
        const action = await upsertRecord(base44, leadData);
        if (action === 'created') created++;
        else updated++;
      } catch (e) {
        console.error(`Record error (${record.id || '?'}):`, e.message);
        errors++;
        errorDetails.push({ id: record.id || '?', error: e.message });
      }
    }

    return Response.json({
      ok: true,
      received: records.length,
      created,
      updated,
      errors,
      error_details: errorDetails,
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}