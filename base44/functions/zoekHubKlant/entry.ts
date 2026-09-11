import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Zoekt bestaande bedrijven en contacten in de BMC HUB-app (CRM-app), zodat
// bij het handmatig invoeren van een lead (pagina Direct) eerst gecheckt kan
// worden of de beller al klant is.
//
// Roept de hub-endpoints hubGetCompanies en hubGetContacts aan met de
// parameter q (vrije tekstzoeking op bedrijfsnaam, contactnaam, e-mail en
// telefoonnummer — zodra de HUB-app die ondersteunt).
//
// Authenticatie naar de HUB-app via de header x-hub-api-key, gelijk aan
// AppSettings.hub_api_key (record key 'main'). Aanroepen mag uitsluitend
// een ingelogde gebruiker van deze app.

const HUB_BASE_URL = 'https://bmc-zoho-i-phone-contacts-sync-960bbf07.base44.app/functions';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const q = String(body.q || '').trim();
    if (!q) {
      return Response.json({ error: 'Zoekterm ontbreekt.' }, { status: 400 });
    }

    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const hubApiKey = settings[0]?.hub_api_key;
    if (!hubApiKey) {
      return Response.json(
        { error: 'Geen HUB API-sleutel geconfigureerd. Vul de BMC HUB API-sleutel in bij Instellingen.' },
        { status: 400 },
      );
    }

    const headers = { 'x-hub-api-key': hubApiKey };
    const url = (endpoint) => `${HUB_BASE_URL}/${endpoint}?q=${encodeURIComponent(q)}`;

    const [bedrijvenRes, contactenRes] = await Promise.all([
      fetch(url('hubGetCompanies'), { headers }),
      fetch(url('hubGetContacts'), { headers }),
    ]);

    // Responsvorm van de HUB-app kan per versie verschillen: array of
    // genest onder data / results / bedrijven / contacten.
    const lees = async (res) => {
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) return data;
      for (const sleutel of ['data', 'results', 'bedrijven', 'contacten']) {
        if (Array.isArray(data?.[sleutel])) return data[sleutel];
      }
      return [];
    };

    const [bedrijven, contacten] = await Promise.all([lees(bedrijvenRes), lees(contactenRes)]);

    return Response.json({ ok: true, q, bedrijven, contacten });
  } catch (error) {
    console.error('zoekHubKlant error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}