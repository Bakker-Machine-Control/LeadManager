import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getZohoToken() {
  const resp = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('ZOHO_CLIENT_ID'),
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET'),
      refresh_token: Deno.env.get('ZOHO_REFRESH_TOKEN'),
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Zoho token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const accessToken = await getZohoToken();
    const domain = 'https://www.zohoapis.eu';

    // Fetch all leads from Zoho
    let page = 1;
    let allLeads = [];
    let hasMore = true;

    while (hasMore) {
      const resp = await fetch(`${domain}/crm/v2/Leads?page=${page}&per_page=200`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      });
      
      if (resp.status === 429) {
        console.warn(`Rate limited on page ${page}, waiting 30 seconds...`);
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      
      const data = await resp.json();
      
      if (data.data) {
        allLeads = allLeads.concat(data.data);
      }

      hasMore = data.info?.more_records ?? false;
      page++;
      
      // Delay between pages to avoid rate limits
      if (hasMore) await new Promise(r => setTimeout(r, 2000));
    }

    // Clear existing contacts sequentially to avoid rate limits
    const existing = await base44.asServiceRole.entities.ZohoContact.list('-created_date', 10000);
    for (const record of existing) {
      await base44.asServiceRole.entities.ZohoContact.delete(record.id);
      await new Promise(r => setTimeout(r, 50));
    }

    // Bulk insert new contacts
    const contacts = allLeads.map(lead => ({
      zoho_id: lead.id,
      first_name: lead.First_Name || '',
      last_name: lead.Last_Name || '',
      email: lead.Email || '',
      phone: lead.Phone || '',
      company: lead.Company || '',
      last_synced: new Date().toISOString(),
    }));

    const BATCH_SIZE = 100;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      await base44.asServiceRole.entities.ZohoContact.bulkCreate(
        contacts.slice(i, i + BATCH_SIZE)
      );
      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return Response.json({ 
      success: true, 
      message: `Synced ${contacts.length} contacts from Zoho` 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});