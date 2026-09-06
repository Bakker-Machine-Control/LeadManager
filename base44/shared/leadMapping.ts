// Gedeelde lead-logica voor de webhook-functies (smartsuiteWebhookReceiver en leadSyncWebhook)

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

// Upsert one mapped record into Lead.
// New leads get status 'nieuw' and bron 'smartsuite'.
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
    status: 'nieuw',
    bron: 'smartsuite',
  });
  return 'created';
}