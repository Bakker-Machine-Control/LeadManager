import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_token, account_id } = body;

    if (!api_token || !account_id) {
      return Response.json({ error: 'Missing api_token or account_id' }, { status: 400 });
    }

    const headers = {
      'Authorization': `Token ${api_token}`,
      'ACCOUNT-ID': account_id,
      'Content-Type': 'application/json',
    };

    // Fetch all applications/solutions
    const resp = await fetch('https://app.smartsuite.com/api/v1/applications/', {
      method: 'GET',
      headers,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `SmartSuite API error: ${resp.status} - ${errText}` }, { status: resp.status });
    }

    const data = await resp.json();
    const applications = data.applications || [];

    // Find "Lead Bridge UK & Netherlands"
    const leadBridge = applications.find(app => 
      app.name && app.name.toLowerCase().includes('lead bridge') && 
      (app.name.toLowerCase().includes('uk') || app.name.toLowerCase().includes('netherlands'))
    );

    if (!leadBridge) {
      return Response.json({ 
        error: 'Lead Bridge UK & Netherlands not found',
        available: applications.map(a => ({ id: a.id, name: a.name }))
      }, { status: 404 });
    }

    return Response.json({
      solution_id: leadBridge.id,
      table_id: leadBridge.id,
      name: leadBridge.name,
      all_apps: applications.map(a => ({ id: a.id, name: a.name }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});