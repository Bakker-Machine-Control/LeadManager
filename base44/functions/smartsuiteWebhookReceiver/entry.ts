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
    
    // Extract fields (same logic as Dashboard)
    function extractFieldValue(val) {
      if (val === undefined || val === null || val === '') return '';
      if (Array.isArray(val)) {
        const first = val[0];
        if (!first) return '';
        if (typeof first === 'string') return first;
        return first.phone_number || first.value || first.name || String(first);
      }
      if (typeof val === 'object') {
        if (val.location_city) return val.location_city;
        if (val.sys_root) return val.sys_root.replace(/,\s*[\w\s]+$/, '').trim();
        if (val.date) return val.date;
        return val.value || val.name || val.label || '';
      }
      return String(val);
    }

    // Build lead data from record
    const leadData = {
      smartsuite_id: smartsuiteId,
      name: extractFieldValue(record.title || record.name || record.full_name) || smartsuiteId,
      email: '',
      phone: '',
      company: '',
      city: '',
      smartsuite_status: '',
      raw_data: record,
    };

    // Try to find email, phone, company, city fields dynamically
    for (const [key, val] of Object.entries(record)) {
      if (key.startsWith('s') || key.startsWith('sf')) {
        const v = extractFieldValue(val);
        if (!v) continue;
        const lower = v.toLowerCase();
        if (!leadData.email && (lower.includes('@') || key.includes('email'))) leadData.email = v;
        else if (!leadData.phone && /\d/.test(v) && v.length >= 8 && v.length <= 15) leadData.phone = v;
        else if (!leadData.company && v.length > 2 && !lower.includes('@')) leadData.company = v;
      }
    }

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