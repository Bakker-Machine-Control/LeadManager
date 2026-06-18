import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function extractLeadDate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.s0ad5216a6?.date || raw.s9bafef72f?.date || raw.first_created?.on || null;
}

function extractPhoneMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const phoneObj = raw.s2fc4c481d;
  let phoneCountry = '';
  let phoneE164 = '';
  if (phoneObj && Array.isArray(phoneObj) && phoneObj[0]) {
    phoneCountry = phoneObj[0].phone_country || '';
  }
  phoneE164 = raw.s0c5029009 || '';
  if (!phoneCountry && !phoneE164) return null;
  return { phone_country: phoneCountry, phone_e164: phoneE164 };
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
          const patch = {};

          // lead_date backfill
          if (!rec.lead_date) {
            const date = extractLeadDate(rec.raw_data);
            if (date) patch.lead_date = date;
          }

          // phone_country / phone_e164 backfill
          if (!rec.phone_country && !rec.phone_e164) {
            const meta = extractPhoneMeta(rec.raw_data);
            if (meta) {
              if (meta.phone_country) patch.phone_country = meta.phone_country;
              if (meta.phone_e164) patch.phone_e164 = meta.phone_e164;
            }
          }

          if (Object.keys(patch).length > 0) {
            updates.push({ id: rec.id, ...patch });
          }
        }

        // Update sequentially with delays
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.SyncedRecord.update(id, patch);
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
      message: `Backfill complete: ${totalUpdated} fields updated across ${totalChecked} records checked`,
    });
  } catch (error) {
    console.error('backfillLeadDates error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});