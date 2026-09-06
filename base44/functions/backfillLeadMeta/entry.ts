import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getStr } from '../../shared/leadMapping.ts';

// Eenmalige backfill: vult de Meta-velden (meta_lead_id, ad_id, ad_naam, campagne,
// formulier, platform, aangeleverde_tekst) uit de opgeslagen raw_data.
// Question 1 t/m Answer 3 worden bewust niet overgenomen — die velden zijn leeg.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const BATCH_SIZE = 200;
    const CHUNK_SIZE = 50;
    const BATCH_DELAY = 500;

    const META_FIELDS = {
      meta_lead_id: 's9feaf3fda',
      ad_id: 'sa4e1203ff',
      ad_naam: 'sa4820cf90',
      campagne: 's924edf549',
      formulier: 's351517cff',
      platform: 's335a1f6d0',
      aangeleverde_tekst: 'sfa31637c2',
    };

    let skip = 0;
    let checked = 0;
    let updated = 0;

    while (true) {
      const batch = await base44.asServiceRole.entities.Lead.list('-created_date', BATCH_SIZE, skip);
      if (batch.length === 0) break;
      checked += batch.length;

      const updates = [];
      for (const rec of batch) {
        const raw = rec.raw_data;
        if (!raw || typeof raw !== 'object') continue;
        const patch = {};
        for (const [field, slug] of Object.entries(META_FIELDS)) {
          if (!rec[field]) {
            const value = getStr(raw[slug]);
            if (value) patch[field] = value;
          }
        }
        if (Object.keys(patch).length > 0) updates.push({ id: rec.id, ...patch });
      }

      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        await base44.asServiceRole.entities.Lead.bulkUpdate(updates.slice(i, i + CHUNK_SIZE));
      }
      updated += updates.length;

      if (batch.length < BATCH_SIZE) break;
      skip += BATCH_SIZE;
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    return Response.json({
      ok: true,
      checked,
      updated,
      message: `Meta-backfill klaar: ${updated} van ${checked} leads bijgewerkt.`,
    });
  } catch (error) {
    console.error('backfillLeadMeta error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}