import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { grant_code } = body;

    if (!grant_code) return Response.json({ error: 'grant_code is required' }, { status: 400 });

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: Deno.env.get('ZOHO_CLIENT_ID'),
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET'),
      code: grant_code,
    });

    const resp = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await resp.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});