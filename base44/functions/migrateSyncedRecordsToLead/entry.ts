import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// One-time migration: copy all SyncedRecord records into the new Lead entity.
// Idempotent: records whose smartsuite_id already exists in Lead are skipped,
// so the migration can safely be re-run or resumed with { start, max }.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { body = {}; }

    const start = Number(body.start || 0);
    const max = Number(body.max || 1000);
    const READ_BATCH = 100;
    const CREATE_CHUNK = 50;

    let skip = start;
    let processed = 0;
    let copied = 0;
    let skippedExisting = 0;
    let reachedEnd = false;

    while (processed < max) {
      const batch = await base44.asServiceRole.entities.SyncedRecord.list('created_date', READ_BATCH, skip);
      if (batch.length === 0) {
        reachedEnd = true;
        break;
      }
      skip += batch.length;

      // Skip records that already exist in Lead (idempotency)
      const ids = batch.map(r => r.smartsuite_id);
      const existing = await base44.asServiceRole.entities.Lead.filter({ smartsuite_id: { $in: ids } });
      const existingIds = new Set(existing.map(r => r.smartsuite_id));

      const toCreate = [];
      for (const r of batch) {
        if (existingIds.has(r.smartsuite_id)) {
          skippedExisting++;
          continue;
        }
        toCreate.push({
          smartsuite_id: r.smartsuite_id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          name: r.name || '',
          email: r.email || '',
          phone: r.phone || '',
          phone_country: r.phone_country || '',
          phone_e164: r.phone_e164 || '',
          company: r.company || '',
          city: r.city || '',
          status: 'nieuw',
          bron: 'smartsuite',
          smartsuite_status: r.smartsuite_status || '',
          lead_date: r.lead_date || '',
          raw_data: r.raw_data || {},
        });
      }
      copied += toCreate.length;

      for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
        await base44.asServiceRole.entities.Lead.bulkCreate(toCreate.slice(i, i + CREATE_CHUNK));
      }

      processed += batch.length;
      if (batch.length < READ_BATCH) {
        reachedEnd = true;
        break;
      }
    }

    return Response.json({
      ok: true,
      processed,
      copied,
      skipped_existing: skippedExisting,
      next_start: skip,
      reached_end: reachedEnd,
    });
  } catch (error) {
    console.error('migrateSyncedRecordsToLead error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}