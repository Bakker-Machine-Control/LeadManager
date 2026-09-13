// Gedeelde Nominatim-hulpstukken voor plaatsgeocoding. Gebruikt door
// geocodeBezoekers (bezoekerslocaties) en geocodeLeadPlaatsen (lead-plaatsen).

const UA = 'BMC-Sales-tool/1.0 (support@bmc-consultancy.com)';

// Kies uit de Nominatim-resultaten de eigenlijke plaats (city/town/village)
// in plaats van de gemeente-grens. Nominatim zet de gemeente (administrative
// boundary) vaak bovenaan, maar het middelpunt van een gemeentegebied ligt
// kilometer(s) naast het dorp zelf. Voorkeur voor place-typen, en daarbinnen
// voor het kleinste (nauwkeurigste) omsluitende vlak.
export const kiesBeste = (lijst) => {
  if (!Array.isArray(lijst) || lijst.length === 0) return null;
  const voorkeur = ['city', 'town', 'village', 'hamlet', 'suburb', 'borough', 'quarter'];
  const score = (r) => {
    const isPlaats = r.class === 'place' || voorkeur.includes(r.addresstype);
    let opp = 1e12;
    if (Array.isArray(r.boundingbox) && r.boundingbox.length === 4) {
      const [z, n, w, o] = r.boundingbox.map(Number);
      opp = Number.isFinite(z) ? Math.abs((n - z) * (o - w)) : 1e12;
    }
    return (isPlaats ? 0 : 1) * 1e12 + opp;
  };
  return lijst.slice().sort((a, b) => score(a) - score(b))[0];
};

// Nominatim vraagt maximaal 1 verzoek per seconde — altijd even wachten.
export const nominatimSleep = (ms = 1100) => new Promise((r) => setTimeout(r, ms));

// Zoek de beste coördinaat voor een plaats via Nominatim structured search.
// Eerst mét provincie (indien gegeven), daarna zonder als dat niets oplevert.
// Geeft { lat, lon } terug, of null als de plaats niet gevonden wordt.
export const zoekPlaats = async ({ plaats, landcode, provincie }) => {
  const params = new URLSearchParams({ city: plaats, country: landcode, format: 'json', limit: '5' });
  if (provincie) params.set('state', provincie);
  const headers = { 'User-Agent': UA, 'Accept-Language': 'nl' };
  let hit = null;
  try {
    let r = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), { headers });
    let lijst = r.ok ? await r.json() : [];
    if ((!Array.isArray(lijst) || lijst.length === 0) && params.get('state')) {
      // Tweede poging zonder provincie (provincienamen uit externe bronnen zijn niet altijd zuiver)
      await nominatimSleep();
      params.delete('state');
      r = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), { headers });
      lijst = r.ok ? await r.json() : [];
    }
    hit = kiesBeste(Array.isArray(lijst) ? lijst : []);
  } catch { hit = null; }
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
};