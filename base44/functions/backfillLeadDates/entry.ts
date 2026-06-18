import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function extractLeadDate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.s0ad5216a6?.date || raw.s9bafef72f?.date || raw.first_created?.on || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const BATCH_SIZE = 200;
    let skip = 0;
    let totalUpdated = 0;
    let totalChecked = 0;

    // Initial delay to avoid burst
    await new Promise(r => setTimeout(r, 200));

    while (true) {
      try {
        const records = await base44.asServiceRole.entities.SyncedRecord.list('-created_date', BATCH_SIZE, skip);
        if (records.length === 0) break;

        totalChecked += records.length;

        const updates = [];
        for (const rec of records) {
          if (rec.lead_date) continue; // already has a date
          const date = extractLeadDate(rec.raw_data);
          if (date) {
            updates.push({ id: rec.id, lead_date: date });
          }
        }

        // Update sequentially with delays
        for (const u of updates) {
          await base44.asServiceRole.entities.SyncedRecord.update(u.id, { lead_date: u.lead_date });
          await new Promise(r => setTimeout(r, 100));
        }

        totalUpdated += updates.length;
        skip += BATCH_SIZE;

        // Delay between batches
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`Batch error at skip=${skip}:`, e.message);
        // Wait longer and retry the same batch
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return Response.json({
      ok: true,
      total_checked: totalChecked,
      total_updated: totalUpdated,
      message: `Backfill complete: ${totalUpdated} records updated out of ${totalChecked} checked`,
    });
  } catch (error) {
    console.error('backfillLeadDates error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});