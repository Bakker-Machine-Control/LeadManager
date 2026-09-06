// Gedeelde lead-logica voor de webhook-functies (leadSyncWebhook en smartsuiteWebhookReceiver)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Helper: get string from a SmartSuite field value
export function getStr(val) {
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

// Meta-advertentiegegevens uit een SmartSuite-record.
// Question 1 t/m Answer 3 worden bewust niet overgenomen — die velden zijn leeg.
export function extractMetaFields(r) {
  return {
    meta_lead_id: getStr(r.s9feaf3fda),
    ad_id: getStr(r.sa4e1203ff),
    ad_naam: getStr(r.sa4820cf90),
    campagne: getStr(r.s924edf549),
    formulier: getStr(r.s351517cff),
    platform: getStr(r.s335a1f6d0),
    aangeleverde_tekst: getStr(r.sfa31637c2),
  };
}

// Map a single SmartSuite record to Lead fields.
// Naamregels: bevat de naam meerdere woorden, dan is het eerste woord de voornaam
// en de rest de achternaam (NL tussenvoegsels vallen zo bij de achternaam:
// Danique de Leeuw -> Danique + de Leeuw). Eén woord = alleen voornaam.
// Het veld `name` houdt altijd de originele tekst.
export function mapRecord(record) {
  const r = record;
  const smartsuiteId = r.id;

  const fullName = (((r.s3430826e2?.first_name) || '') + ' ' + ((r.s3430826e2?.last_name) || '')).trim()
    || getStr(r.s527015a79) || getStr(r.title) || getStr(r.name) || getStr(r.full_name) || smartsuiteId;
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return {
    smartsuite_id: smartsuiteId,
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: getStr(r.s19d20e4c1) || r.email || '',
    phone: r.s2fc4c481d?.[0]?.sys_title || '',
    phone_country: r.s2fc4c481d?.[0]?.phone_country || '',
    phone_e164: typeof r.s0c5029009 === 'string' ? r.s0c5029009 : (r.s0c5029009?.sys_title || ''),
    company: getStr(r.sfbbd03935),
    city: r.s778b5be05?.location_city || '',
    smartsuite_status: r.status?.value || '',
    lead_date: r.s0ad5216a6?.date || r.s9bafef72f?.date || r.first_created?.on || '',
    ...extractMetaFields(r),
    raw_data: record,
  };
}

// Upsert one mapped record into Lead.
// New leads get status 'Nieuw' and bron 'smartsuite'.
// Existing leads only get their instroom fields refreshed —
// the werkstatus (status, bron, eigenaar, opvolgdatum, ...) is never touched.
export async function upsertRecord(base44, leadData) {
  const existing = await base44.asServiceRole.entities.Lead.filter({
    smartsuite_id: leadData.smartsuite_id
  });

  if (existing.length > 0) {
    await base44.asServiceRole.entities.Lead.update(existing[0].id, leadData);
    return 'updated';
  }

  await base44.asServiceRole.entities.Lead.create({
    ...leadData,
    status: 'Nieuw',
    bron: 'smartsuite',
  });
  return 'created';
}

// Complete webhook-afhandeling, gedeeld door leadSyncWebhook en smartsuiteWebhookReceiver.
// De sleutel staat in AppSettings (veld lead_webhook_key) — niet in de broncode.
// Is het veld leeg of klopt de sleutel niet, dan volgt 401.
export async function handleLeadWebhook(req) {
  try {
    const base44 = createClientFromRequest(req);

    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const webhookKey = settings[0]?.lead_webhook_key || '';

    const url = new URL(req.url);
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { body = {}; }
    const secret = url.searchParams.get('secret') || body.secret;
    if (!webhookKey || secret !== webhookKey) {
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