import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Validate SmartSuite webhook secret from query param
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    if (secret !== 'leadbridge-2024') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const event = body.event; // 'record.created' or 'record.updated'
    const record = body.record || {};

    if (!record.id) {
      return Response.json({ error: 'Missing record ID' }, { status: 400 });
    }

    const smartsuiteId = record.id;
    
    // Helper: get string from a smart field value
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

    const r = record;

    // Use exact SmartSuite field slugs per user spec
    const firstName = (r.s3430826e2?.first_name) || getStr(r.s527015a79) || '';
    const lastName = r.s3430826e2?.last_name || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || r.title || r.name || r.full_name || smartsuiteId);
    const email = getStr(r.s19d20e4c1) || r.email || '';
    const phone = r.s2fc4c481d?.[0]?.sys_title || '';
    const city = r.s778b5be05?.location_city || '';
    const country = getStr(r.s84ca80bb4);
    const smartsuiteStatus = r.status?.value || '';

    const leadData = {
      smartsuite_id: smartsuiteId,
      first_name: firstName,
      last_name: lastName,
      name: fullName,
      email,
      phone,
      company: '',
      city,
      smartsuite_status: smartsuiteStatus,
      raw_data: record,
    };

    // Check if record already exists
    const existing = await base44.asServiceRole.entities.SyncedRecord.filter({ smartsuite_id: smartsuiteId });

    if (existing.length > 0) {
      // Update existing
      await base44.asServiceRole.entities.SyncedRecord.update(existing[0].id, {
        ...leadData,
        sync_status: existing[0].sync_status || 'pending',
      });
      console.log(`Updated: ${leadData.name}`);
    } else {
      // Create new
      await base44.asServiceRole.entities.SyncedRecord.create({
        ...leadData,
        sync_status: 'pending',
      });
      console.log(`Created: ${leadData.name}`);
    }

    return Response.json({ success: true, action: existing.length > 0 ? 'updated' : 'created' });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});