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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const domain = body.zoho_api_domain || 'https://www.zohoapis.eu';
    const accessToken = await getZohoToken();

    const [meetingsResp, tasksResp] = await Promise.all([
      fetch(`${domain}/crm/v2/Events?fields=Subject,Start_DateTime,End_DateTime,Status,Description,Contact_Name,Event_Title&per_page=50`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      }),
      fetch(`${domain}/crm/v2/Tasks?fields=Subject,Due_Date,Status,Description,Contact_Name,Priority&per_page=50`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
      }),
    ]);

    let meetings = [];
    let tasks = [];

    if (meetingsResp.ok) {
      const md = await meetingsResp.json();
      meetings = (md.data || []).map(m => ({ ...m, _type: 'Meeting' }));
    } else {
      const errText = await meetingsResp.text();
      console.log('Meetings fetch error:', meetingsResp.status, errText);
    }

    if (tasksResp.ok) {
      const td = await tasksResp.json();
      tasks = (td.data || []).map(t => ({ ...t, _type: 'Task' }));
    } else {
      const errText = await tasksResp.text();
      console.log('Tasks fetch error:', tasksResp.status, errText);
    }

    return Response.json({ meetings, tasks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});