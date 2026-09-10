import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Webhook voor de hub-app: maakt een lead aan vanuit een telefoongesprek
// (Voys). Authenticatie via de header x-lead-create-key, die gelijk moet
// zijn aan AppSettings.lead_create_key (record key 'main'). Is het veld
// leeg of klopt de sleutel niet, dan volgt 401.
//
// Body (JSON): { voys_call_id (verplicht), name, company, phone, email,
//                city, gesprek_samenvatting }
//
// Idempotent op voys_call_id; bestaat het gesprek al, dan wordt de
// bestaande lead teruggegeven zonder iets aan te maken.

// Telefoonpatroon op de laatste 9 cijfers — zelfde logica als
// buildPhonePattern in hubGetLeads: scheidingstekens in het opgeslagen
// nummer worden getolereerd, en +31- en 0-nummers matchen op de laatste
// 9 cijfers.
function buildPhonePattern(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (!digits) return null;
  const tail = digits.length > 9 ? digits.slice(-9) : digits;
  return tail.split('').join('\\D*') + '$';
}

// Nederlands nummer naar +31-vorm; geen Nederlands nummer -> leeg
function naarNederlandsE164(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0031')) return '+' + digits.slice(2);
  if (digits.startsWith('31') && digits.length >= 11) return '+' + digits;
  if (digits.startsWith('0')) return '+31' + digits.slice(1);
  return '';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // ---- Authenticatie via x-lead-create-key ----
    const apiKey = req.headers.get('x-lead-create-key');
    if (!apiKey) {
      return Response.json({ error: 'Missing x-lead-create-key header' }, { status: 401 });
    }
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const createKey = settings[0]?.lead_create_key;
    if (!createKey || apiKey !== createKey) {
      return Response.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // ---- Invoer ----
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const tekst = (v) => (typeof v === 'string' ? v.trim() : '');

    const voysCallId = tekst(body.voys_call_id);
    if (!voysCallId) {
      return Response.json({ ok: false, error: 'voys_call_id ontbreekt.' }, { status: 400 });
    }

    const name = tekst(body.name);
    const company = tekst(body.company);
    const phone = tekst(body.phone);
    const email = tekst(body.email);
    const city = tekst(body.city);
    const samenvatting = tekst(body.gesprek_samenvatting);

    // ---- Idempotentie: bestaat er al een lead met dit gesprek? ----
    const bestaand = await base44.asServiceRole.entities.Lead.filter({ voys_call_id: voysCallId });
    if (bestaand.length > 0) {
      return Response.json({
        ok: true,
        created: false,
        lead_id: bestaand[0].id,
        reden: 'bestaand voys_call_id',
      });
    }

    // ---- Ontdubbelen op telefoonnummer (laatste 9 cijfers) ----
    const pattern = buildPhonePattern(phone);
    if (pattern) {
      const match = await base44.asServiceRole.entities.Lead.filter({
        phone_e164: { $regex: pattern, $options: 'i' },
      });
      if (match.length > 0) {
        await base44.asServiceRole.entities.LeadContactmoment.create({
          lead_id: match[0].id,
          datum: new Date().toISOString(),
          wie: 'Voys (automatisch)',
          kanaal: 'telefoon',
          notitie: samenvatting,
          voys_call_id: voysCallId,
        });
        return Response.json({
          ok: true,
          created: false,
          lead_id: match[0].id,
          reden: 'bestaande lead op telefoonnummer',
        });
      }
    }

    // ---- Nieuwe lead aanmaken ----
    // Naamregels als in mapRecord (base44/shared/leadMapping.ts): meerdere
    // woorden -> eerste woord voornaam, rest achternaam; één woord -> alleen
    // voornaam. Het veld `name` houdt de originele tekst.
    const nameParts = name.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const e164 = naarNederlandsE164(phone);

    const lead = await base44.asServiceRole.entities.Lead.create({
      name,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      phone_e164: e164 || phone,
      company,
      city,
      bron: 'telefoon',
      status: 'Nieuw',
      verrijking_status: 'niet_verrijkt',
      voys_call_id: voysCallId,
      gesprek_samenvatting: samenvatting,
      lead_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.LeadContactmoment.create({
      lead_id: lead.id,
      datum: new Date().toISOString(),
      wie: 'Voys (automatisch)',
      kanaal: 'telefoon',
      notitie: samenvatting,
      voys_call_id: voysCallId,
    });

    return Response.json({ ok: true, created: true, lead_id: lead.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}