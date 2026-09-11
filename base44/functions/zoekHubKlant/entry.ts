import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Zoekt bestaande bedrijven en contacten in de BMC HUB-app (CRM-app), zodat
// bij het handmatig invoeren van een lead (pagina Direct) eerst gecheckt kan
// worden of de beller al klant is.
//
// Roept de hub-endpoints hubGetCompanies en hubGetContacts aan met de
// parameter q (vrije tekstzoeking op bedrijfsnaam, contactnaam, e-mail en
// telefoonnummer). De HUB kan veel (en grote) records teruggeven, daarom
// worden de records hier server-side tot de noodzakelijke velden vermagerd
// en per soort tot MAX_RESULTATEN begrensd; het totaal wél teruggegeven.
//
// Authenticatie naar de HUB-app via de header x-hub-api-key, gelijk aan
// AppSettings.hub_api_key (record key 'main'). Aanroepen mag uitsluitend
// een ingelogde gebruiker van deze app.

const HUB_BASE_URL = 'https://bmc-zoho-i-phone-contacts-sync-960bbf07.base44.app/functions';
const MAX_RESULTATEN = 10;

const tekst = (v) => (typeof v === 'string' ? v.trim() : '');

// Vindt de eerste gevulde waarde; veldnamen in de HUB-app kunnen per koppeling verschillen
function pak(record, sleutels) {
  for (const sleutel of sleutels) {
    const v = record?.[sleutel];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function mapBedrijf(r) {
  return {
    id: tekst(r?.id),
    naam: pak(r, ['name', 'naam', 'bedrijfsnaam']),
    plaats: pak(r, ['billing_city', 'plaats', 'city']),
    email: pak(r, ['email', 'Email']),
    telefoon: pak(r, ['phone', 'telefoon']),
    website: tekst(r?.website),
    adres: pak(r, ['billing_street', 'straat']),
    postcode: pak(r, ['billing_postcode', 'postcode']),
    zoho_id: tekst(r?.zoho_id),
  };
}

function mapContact(r) {
  return {
    id: tekst(r?.id),
    voornaam: pak(r, ['first_name', 'voornaam']),
    achternaam: pak(r, ['last_name', 'achternaam']),
    naam: pak(r, ['full_name', 'naam', 'name']),
    email: pak(r, ['email', 'Email']),
    telefoon: pak(r, ['phone', 'telefoon', 'mobile', 'mobiel']),
    bedrijf: pak(r, ['company', 'bedrijf', 'company_name']),
    zoho_id: tekst(r?.zoho_id),
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const q = String(body.q || '').trim();
    if (q.length < 2) {
      return Response.json({ error: 'Zoekterm moet minimaal 2 tekens bevatten.' }, { status: 400 });
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

    const [alleBedrijven, alleContacten] = await Promise.all([lees(bedrijvenRes), lees(contactenRes)]);

    return Response.json({
      ok: true,
      q,
      totaal_bedrijven: alleBedrijven.length,
      totaal_contacten: alleContacten.length,
      bedrijven: alleBedrijven.slice(0, MAX_RESULTATEN).map(mapBedrijf),
      contacten: alleContacten.slice(0, MAX_RESULTATEN).map(mapContact),
    });
  } catch (error) {
    console.error('zoekHubKlant error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}