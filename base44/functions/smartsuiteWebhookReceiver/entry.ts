import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Helper: get string from a SmartSuite field value
function getStr(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) {
    const first = val[0];
    if (!first) return '';
    if (typeof first === 'string') return first;
    return first.sys_title || first.phone_number || first.value || first.name || '';
  }
  if (typeof val === 'object') {
    return val.location_city || val.sys_title || val.value || '';
  }
  return String(val);
}

// Map a single SmartSuite record to SyncedRecord fields
function mapRecord(record) {
  const r = record;
  const smartsuiteId = r.id;

  const firstName = (r.s3430826e2?.first_name) || getStr(r.s527015a79) || '';
  const lastName = r.s3430826e2?.last_name || '';
  const fullName = firstName && lastName
    ? `${firstName} ${lastName}`
    : (firstName || lastName || getStr(r.title) || getStr(r.name) || getStr(r.full_name) || smartsuiteId);
  const email = getStr(r.s19d20e4c1) || r.email || '';
  const phone = r.s2fc4c481d?.[0]?.sys_title || '';
  const phoneCountry = r.s2fc4c481d?.[0]?.phone_country || '';
  const phoneE164 = typeof r.s0c5029009 === 'string' ? r.s0c5029009 : (r.s0c5029009?.sys_title || '');
  const city = r.s778b5be05?.location_city || '';
  const smartsuiteStatus = r.status?.value || '';
  const company = getStr(r.sfbbd03935);
  const leadDate = r.s0ad5216a6?.date || r.s9bafef72f?.date || r.first_created?.on || '';

  return {
    smartsuite_id: smartsuiteId,
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email,
    phone,
    phone_country: phoneCountry,
    phone_e164: phoneE164,
    company,
    city,
    smartsuite_status: smartsuiteStatus,
    lead_date: leadDate,
    raw_data: record,
  };
}

// Upsert one mapped record into SyncedRecord (always sets sync_status = 'pending')
async function upsertRecord(base44, leadData) {
  const existing = await base44.asServiceRole.entities.SyncedRecord.filter({
    smartsuite_id: leadData.smartsuite_id
  });

  if (existing.length > 0) {
    await base44.asServiceRole.entities.SyncedRecord.update(existing[0].id, {
      ...leadData,
      sync_status: 'pending',
    });
    return 'updated';
  } else {
    await base44.asServiceRole.entities.SyncedRecord.create({
      ...leadData,
      sync_status: 'pending',
    });
    return 'created';
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Validate webhook secret from query param
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    if (secret !== 'leadbridge-2024') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Determine payload type: batch array or single record
    const records = body.records || (body.record ? [body.record] : []);

    if (records.length === 0) {
      return Response.json({ ok: false, error: 'No records provided' }, { status: 400 });
    }

    let created = 0, updated = 0, errors = 0;

    for (const record of records) {
      try {
        if (!record.id) {
          errors++;
          continue;
        }
        const leadData = mapRecord(record);
        const action = await upsertRecord(base44, leadData);
        if (action === 'created') created++;
        else updated++;
      } catch (e) {
        console.error(`Record error (${record.id || '?'}):`, e.message);
        errors++;
      }
    }

    return Response.json({
      ok: true,
      received: records.length,
      created,
      updated,
      errors,
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});