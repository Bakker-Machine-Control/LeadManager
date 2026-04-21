import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\.\(\)]/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}
    const { leads } = body;

    if (!leads || leads.length === 0) {
      return Response.json({ results: [] });
    }

    // Fetch all local Zoho contacts
    const zohoContacts = await base44.asServiceRole.entities.ZohoContact.list('-created_date', 10000);

    // Build lookup maps
    const emailMap = {};
    const phoneMap = {};
    zohoContacts.forEach(contact => {
      if (contact.email) emailMap[contact.email.toLowerCase()] = contact;
      if (contact.phone) phoneMap[normalizePhone(contact.phone)] = contact;
    });

    const results = leads.map(lead => {
      let match = null;
      let matchedOn = null;

      if (lead.email && emailMap[lead.email.toLowerCase()]) {
        match = emailMap[lead.email.toLowerCase()];
        matchedOn = 'Email';
      }
      if (!match && lead.phone && phoneMap[normalizePhone(lead.phone)]) {
        match = phoneMap[normalizePhone(lead.phone)];
        matchedOn = 'Phone';
      }

      return {
        smartsuite_id: lead.smartsuite_id,
        exists_in_zoho: !!match,
        zoho_id: match?.zoho_id || null,
        matched_on: matchedOn,
      };
    });

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});