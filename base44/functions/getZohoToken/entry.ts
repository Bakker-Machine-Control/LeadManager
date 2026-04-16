import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns a fresh Zoho access token using the stored refresh token
async function refreshZohoToken() {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
  const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');

  const resp = await fetch('https://accounts.zoho.eu/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`Failed to get Zoho token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const access_token = await refreshZohoToken();
    return Response.json({ access_token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});