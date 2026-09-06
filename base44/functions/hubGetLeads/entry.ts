import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const LEAD_FIELDS = [
  'smartsuite_id', 'name', 'first_name', 'last_name', 'email', 'phone',
  'phone_e164', 'company', 'city', 'smartsuite_status', 'lead_date',
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalise phone input to digits; compare on the last 9 digits.
// The pattern tolerates separators (spaces/dashes) in the stored value,
// e.g. input "0612345678" matches stored "+31612345678".
function buildPhonePattern(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (!digits) return null;
  const tail = digits.length > 9 ? digits.slice(-9) : digits;
  return tail.split('').join('\\D*') + '$';
}

function buildQuery(params) {
  const query = {};
  if (params.email) query.email = params.email;
  if (params.status) query.smartsuite_status = params.status;
  if (params.q) {
    const rx = { $regex: escapeRegex(params.q), $options: 'i' };
    query.$or = [{ name: rx }, { company: rx }, { city: rx }];
  }
  if (params.phonePattern) {
    query.phone_e164 = { $regex: params.phonePattern, $options: 'i' };
  }
  return query;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // --- authenticate via shared key header ---
    const apiKey = req.headers.get('x-hub-api-key');
    if (!apiKey) {
      return Response.json({ error: 'Missing x-hub-api-key header' }, { status: 401 });
    }
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const sharedKey = settings?.[0]?.hub_shared_key;
    if (!sharedKey || apiKey !== sharedKey) {
      return Response.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // --- params: JSON body or query string ---
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { body = {}; }
    const url = new URL(req.url);
    const getParam = (name) => {
      const v = body[name] !== undefined ? body[name] : url.searchParams.get(name);
      return v === null || v === undefined ? undefined : String(v);
    };

    const email = getParam('email');
    const status = getParam('status');
    const q = getParam('q');
    const phonePattern = buildPhonePattern(getParam('phone'));

    let limit = parseInt(getParam('limit'), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    let offset = parseInt(getParam('offset'), 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const query = buildQuery({ email, status, q, phonePattern });

    // --- count total matches in batches (never one unbounded fetch) ---
    const COUNT_BATCH = 1000;
    let total = 0;
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.Lead.filter(query, '-lead_date', COUNT_BATCH, skip);
      total += batch.length;
      if (batch.length < COUNT_BATCH) break;
      skip += COUNT_BATCH;
    }

    // --- fetch the requested page, stable sorted on lead_date desc ---
    const page = total > offset
      ? await base44.asServiceRole.entities.Lead.filter(query, '-lead_date', limit, offset)
      : [];

    const results = page.map((r) => {
      const lead = {};
      for (const f of LEAD_FIELDS) lead[f] = r[f] === undefined ? null : r[f];
      return lead;
    });

    return Response.json({
      results,
      total,
      offset,
      limit,
      returned: results.length,
      has_more: offset + results.length < total,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});