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
  phoneE164 = typeof raw.s0c5029009 === 'string' ? raw.s0c5029009 : (raw.s0c5029009?.sys_title || '');
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

    const BATCH_SIZE = 50;
    const UPDATE_DELAY = 1000;   // 1 second between individual updates
    const BATCH_DELAY = 5000;    // 5 seconds between batches
    const RATE_LIMIT_PAUSE = 15000; // 15 second cooldown after rate limit

    let skip = 0;
    let totalUpdated = 0;
    let totalChecked = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    // Initial delay
    await new Promise(r => setTimeout(r, 500));

    while (true) {
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`Aborting after ${consecutiveErrors} consecutive errors at skip=${skip}`);
        break;
      }

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

        // Update sequentially with delays + rate-limit backoff
        for (const u of updates) {
          try {
            const { id, ...patch } = u;
            await base44.asServiceRole.entities.SyncedRecord.update(id, patch);
            totalUpdated++;
            consecutiveErrors = 0;
          } catch (updateErr) {
            console.error(`Update error for record ${u.id}:`, updateErr.message);
            if (updateErr.message?.includes('Rate limit')) {
              // Pause after rate limit, then retry this record
              await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE));
              try {
                const { id, ...patch } = u;
                await base44.asServiceRole.entities.SyncedRecord.update(id, patch);
                totalUpdated++;
              } catch (retryErr) {
                console.error(`Retry also failed for ${u.id}:`, retryErr.message);
              }
            }
            // Skip record if it still fails
          }
          await new Promise(r => setTimeout(r, UPDATE_DELAY));
        }

        consecutiveErrors = 0;
        skip += BATCH_SIZE;
        await new Promise(r => setTimeout(r, BATCH_DELAY));

      } catch (e) {
        console.error(`Batch error at skip=${skip}:`, e.message);
        consecutiveErrors++;
        // Skip this batch and move on
        skip += BATCH_SIZE;
        await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE));
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