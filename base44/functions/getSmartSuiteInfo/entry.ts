import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { api_token } = body;

    if (!api_token) {
      return Response.json({ error: 'Missing api_token' }, { status: 400 });
    }

    const headers = {
      'Authorization': `Token ${api_token}`,
      'Content-Type': 'application/json',
    };

    // Fetch solutions list (no account ID needed for this endpoint)
    const resp = await fetch('https://app.smartsuite.com/api/v1/solutions/', {
      method: 'GET',
      headers,
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json({ error: `SmartSuite error: ${resp.status}`, details: text.slice(0, 300) }, { status: 502 });
    }

    const solutions = await resp.json();
    console.log('Solutions response:', JSON.stringify(solutions).slice(0, 500));

    // For each solution, fetch its applications (tables)
    const enriched = await Promise.all((solutions || []).map(async (sol) => {
      try {
        const appsResp = await fetch(`https://app.smartsuite.com/api/v1/applications/?solution=${sol.id}`, {
          method: 'GET',
          headers: {
            ...headers,
            'ACCOUNT-ID': sol.account_id || '',
          },
        });
        if (appsResp.ok) {
          const apps = await appsResp.json();
          console.log(`Apps for solution ${sol.id}:`, JSON.stringify(apps).slice(0, 300));
          return { ...sol, applications: Array.isArray(apps) ? apps.map(a => ({ id: a.id, name: a.name })) : [] };
        }
      } catch (e) {
        console.log('Error fetching apps:', e.message);
      }
      return { ...sol, applications: [] };
    }));

    return Response.json({ solutions: enriched });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});