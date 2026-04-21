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

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\.\(\)]/g, '');
}

async function searchZoho(domain, accessToken, field, value) {
  if (!value || value.trim() === '') return [];
  const url = `${domain}/crm/v2/Leads/search?criteria=(${field}:equals:${encodeURIComponent(value.trim())})&fields=id,First_Name,Last_Name,Email,Phone`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
  });
  const text = await resp.text();
  if (!resp.ok || !text) return [];
  try {
    const data = JSON.parse(text);
    return data.data || [];
  } catch (_) {
    return [];
  }
}

// Run tasks with max concurrency to avoid overloading Zoho API
async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
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
    const { leads, zoho_api_domain } = body;

    if (!leads || leads.length === 0) {
      return Response.json({ results: [] });
    }

    const domain = zoho_api_domain || 'https://www.zohoapis.eu';
    const accessToken = await getZohoToken();

    const emails = [...new Set(leads.map(l => l.email).filter(Boolean))];
    const phones = [...new Set(leads.map(l => l.phone ? normalizePhone(l.phone) : null).filter(Boolean))];

    // Max 10 concurrent calls to avoid Zoho rate limits & timeouts
    const emailTasks = emails.map(e => () => searchZoho(domain, accessToken, 'Email', e).then(hits => hits.map(h => ({ ...h, _matched_email: e }))));
    const phoneTasks = phones.map(p => () => searchZoho(domain, accessToken, 'Phone', p).then(hits => hits.map(h => ({ ...h, _matched_phone: p }))));

    const [emailResults, phoneResults] = await Promise.all([
      runWithConcurrency(emailTasks, 10),
      runWithConcurrency(phoneTasks, 10),
    ]);

    const emailMap = {};
    emailResults.flat().forEach(h => { emailMap[h._matched_email.toLowerCase()] = h; });
    const phoneMap = {};
    phoneResults.flat().forEach(h => {
      phoneMap[h._matched_phone] = h;
      if (h.Phone) phoneMap[normalizePhone(h.Phone)] = h;
    });

    const results = leads.map(lead => {
      let match = null;
      let matchedOn = null;

      if (lead.email) {
        match = emailMap[lead.email.toLowerCase()] || null;
        if (match) matchedOn = 'email';
      }
      if (!match && lead.phone) {
        match = phoneMap[normalizePhone(lead.phone)] || null;
        if (match) matchedOn = 'phone';
      }

      return {
        smartsuite_id: lead.smartsuite_id,
        exists_in_zoho: !!match,
        zoho_id: match?.id || null,
        zoho_name: match ? `${match.First_Name || ''} ${match.Last_Name || ''}`.trim() : null,
        matched_on: matchedOn,
      };
    });

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});