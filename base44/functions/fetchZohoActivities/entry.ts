import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { zoho_access_token, zoho_api_domain } = body;

    if (!zoho_access_token) {
      return Response.json({ error: 'Missing Zoho access token' }, { status: 400 });
    }

    const domain = zoho_api_domain || 'https://www.zohoapis.com';

    // Fetch Meetings and Tasks in parallel
    const [meetingsResp, tasksResp] = await Promise.all([
      fetch(`${domain}/crm/v2/Meetings?fields=Subject,Start_DateTime,End_DateTime,Status,Description,Contact_Name,Meeting_Type&per_page=50`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${zoho_access_token}` },
      }),
      fetch(`${domain}/crm/v2/Tasks?fields=Subject,Due_Date,Status,Description,Contact_Name,Priority&per_page=50`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${zoho_access_token}` },
      }),
    ]);

    let meetings = [];
    let tasks = [];

    if (meetingsResp.ok) {
      const md = await meetingsResp.json();
      meetings = (md.data || []).map(m => ({ ...m, _type: 'Meeting' }));
    }

    if (tasksResp.ok) {
      const td = await tasksResp.json();
      tasks = (td.data || []).map(t => ({ ...t, _type: 'Task' }));
    }

    return Response.json({ meetings, tasks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});