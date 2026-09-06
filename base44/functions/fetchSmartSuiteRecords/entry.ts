import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAGE_SIZE = 1000;
const INTERPAGE_DELAY_MS = 300;
const MAX_RETRIES = 5;

// Haalt één pagina records op, met retry/backoff voor rate limits (429 of Cloudflare-challenge)
async function fetchRecordsPage(listUrl, headers, offset) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(listUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: PAGE_SIZE, offset }),
      });
      const rawText = await resp.text();
      const isChallenge = rawText.includes('Just a moment') || rawText.includes('challenge') || rawText.includes('cf-');
      if (resp.ok && !isChallenge) {
        return { ok: true, data: JSON.parse(rawText) };
      }
      const isRateLimit = resp.status === 429 || isChallenge;
      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const delayMs = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s, 40s
        console.log(`Rate limit (status=${resp.status}) bij offset=${offset}, retry ${attempt + 1}/${MAX_RETRIES} over ${delayMs / 1000}s`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      if (isRateLimit) {
        return { ok: false, rateLimit: true, error: 'SmartSuite API rate limit bereikt (Cloudflare). Wacht even en probeer het opnieuw.' };
      }
      return { ok: false, rateLimit: false, error: `SmartSuite API error: ${resp.status} - ${rawText.substring(0, 100)}` };
    } catch (fetchError) {
      console.log(`Fetch error bij offset=${offset}, poging ${attempt + 1}: ${fetchError.message}`);
      if (attempt === MAX_RETRIES - 1) {
        return { ok: false, rateLimit: false, error: `Netwerkfout: ${fetchError.message}` };
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 5000));
    }
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    let { api_token, account_id, solution_id, table_id } = body;

    // If not in payload, fetch from AppSettings
    if (!api_token || !account_id || !solution_id || !table_id) {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
      if (settings.length === 0) {
        return Response.json({ error: 'No SmartSuite credentials configured' }, { status: 400 });
      }
      const s = settings[0];
      api_token = api_token || s.smartsuite_api_token;
      account_id = account_id || s.smartsuite_account_id;
      solution_id = solution_id || s.smartsuite_solution_id;
      table_id = table_id || s.smartsuite_table_id;
    }

    if (!api_token || !account_id || !solution_id || !table_id) {
      return Response.json({ error: 'Missing SmartSuite credentials in payload or settings' }, { status: 400 });
    }

    const headers = {
      'Authorization': `Token ${api_token}`,
      'ACCOUNT-ID': account_id,
      'Content-Type': 'application/json',
    };
    const listUrl = `https://app.smartsuite.com/api/v1/applications/${table_id}/records/list/`;

    // Tabelstructuur (slug -> label) één keer ophalen
    let fieldLabels = {};
    try {
      const structureResp = await fetch(`https://app.smartsuite.com/api/v1/applications/${table_id}/`, {
        method: 'GET',
        headers,
      });
      if (structureResp.ok) {
        const structure = await structureResp.json();
        const fields = structure.structure || [];
        fields.forEach(f => {
          if (f.slug && f.label) fieldLabels[f.slug] = f.label;
        });
      }
    } catch (structureError) {
      console.log('Kon tabelstructuur niet ophalen: ' + structureError.message);
    }

    // Pagineer met offset door alle records tot een pagina minder dan PAGE_SIZE teruggeeft
    const items = [];
    let pages = 0;
    let offset = 0;
    let total = 0;

    while (true) {
      const page = await fetchRecordsPage(listUrl, headers, offset);
      if (!page.ok) {
        return Response.json(
          { error: page.error, pages, fetchedSoFar: items.length },
          { status: page.rateLimit ? 429 : 502 }
        );
      }
      pages++;
      const pageItems = page.data.items || [];
      total = page.data.total || total;
      items.push(...pageItems);
      console.log(`Pagina ${pages} opgehaald: ${pageItems.length} records (offset=${offset}, totaal nu ${items.length})`);

      offset += PAGE_SIZE;
      if (pageItems.length < PAGE_SIZE) break;

      // Korte pauze tussen pagina's om rate limits te ontlopen
      await new Promise(r => setTimeout(r, INTERPAGE_DELAY_MS));
    }

    console.log(`Sync voltooid: ${pages} pagina's, ${items.length} records opgehaald (SmartSuite totaal: ${total})`);
    if (items.length > 0) {
      console.log('FIRST_RECORD_KEYS:', JSON.stringify(Object.keys(items[0])));
    }

    return Response.json({ total, pages, fetched: items.length, fieldLabels, items });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}