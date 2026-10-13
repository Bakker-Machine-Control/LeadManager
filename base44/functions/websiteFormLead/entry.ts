import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Webhook voor Webflow (trigger 'form_submission'): elke inzending van het
// contact- of offerteformulier op www.bmc-consultancy.com wordt een Lead met
// bron 'website' en status 'Nieuw', plus een e-mailmelding naar sales.
// Vervangt het oude Zoho CRM-webformulier (okt 2026).
//
// Authenticatie: Webflow kan geen eigen headers meesturen, dus de sleutel
// staat in de URL: ...?secret=<AppSettings.website_form_key>. Leeg veld of
// verkeerde sleutel = 401.
//
// Body (Webflow v2): { triggerType, payload: { name, data: {veld: waarde},
//   submittedAt, id, formId, pageId, publishedPath, pageUrl } }
// Ook een platte body { name, data, ... } wordt geaccepteerd (handig voor tests).
//
// Idempotent op website_submission_id. Bestaat er al een lead met hetzelfde
// e-mailadres of telefoonnummer, dan komt er een contactmoment bij die lead
// in plaats van een nieuwe lead. De e-mailmelding gaat in beide gevallen.

const VERSIE = '2026-10-13-webflow';
const STANDAARD_MAIL = 'sales@bmc-consultancy.com';

const tekst = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const sleutel = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Formuliervelden herkennen op (een deel van) hun naam, ongeacht hoe ze in Webflow heten
const VELDEN = {
  voornaam: ['voornaam', 'firstname'],
  achternaam: ['achternaam', 'lastname', 'surname'],
  naam: ['naam', 'name', 'volledigenaam', 'contactpersoon', 'fullname'],
  bedrijf: ['bedrijf', 'bedrijfsnaam', 'company', 'organisatie', 'firma'],
  email: ['email', 'emailadres', 'mail'],
  telefoon: ['telefoon', 'telefoonnummer', 'tel', 'phone', 'mobiel', 'gsm'],
  plaats: ['plaats', 'woonplaats', 'stad', 'city', 'vestigingsplaats'],
  bericht: ['bericht', 'message', 'vraag', 'opmerking', 'opmerkingen', 'toelichting', 'omschrijving'],
  bezoeker_id: ['bezoekerid', 'bmcbezoekerid', 'visitorid'],
};

function zoekVeld(data, soort) {
  const kandidaten = VELDEN[soort];
  const entries = Object.entries(data || {}).map(([k, v]) => [sleutel(k), tekst(v)]);
  for (const k of kandidaten) {
    const exact = entries.find(([naam, v]) => naam === k && v);
    if (exact) return exact[1];
  }
  for (const k of kandidaten) {
    if (k.length < 4) continue; // korte sleutels alleen exact
    const deel = entries.find(([naam, v]) => naam.includes(k) && v);
    if (deel) return deel[1];
  }
  return '';
}

function buildPhonePattern(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length < 6) return null;
  const tail = digits.length > 9 ? digits.slice(-9) : digits;
  return tail.split('').join('\\D*') + '$';
}

function naarE164(input) {
  const raw = (input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return '+' + digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.startsWith('31') && digits.length >= 11) return '+' + digits;
  if (digits.startsWith('0')) return '+31' + digits.slice(1);
  return raw;
}

const esc = (s) => tekst(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // ---- Authenticatie via ?secret= ----
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret') || '';
    const settings = await db.AppSettings.filter({ key: 'main' });
    const formKey = settings[0]?.website_form_key;
    if (!formKey || secret !== formKey) {
      return Response.json({ error: 'Invalid secret' }, { status: 401 });
    }

    // ---- Invoer ----
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const p = body.payload || body;
    const data = p.data || {};
    const submissionId = tekst(p.id || p._id || p.submissionId) || `geen-id-${Date.now()}`;
    const formulier = tekst(p.name || p.formName) || 'Websiteformulier';
    const paginaUrl = tekst(p.pageUrl || p.publishedPath);
    const ontvangen = tekst(p.submittedAt || p.dateSubmitted) || new Date().toISOString();

    // ---- Idempotentie ----
    const bestaandeInzending = await db.Lead.filter({ website_submission_id: submissionId });
    if (bestaandeInzending.length > 0) {
      return Response.json({ ok: true, versie: VERSIE, created: false, lead_id: bestaandeInzending[0].id, reden: 'inzending al verwerkt' });
    }

    let voornaam = zoekVeld(data, 'voornaam');
    let achternaam = zoekVeld(data, 'achternaam');
    let naam = zoekVeld(data, 'naam');
    if (!naam) naam = [voornaam, achternaam].filter(Boolean).join(' ');
    if (!voornaam && naam) {
      const delen = naam.split(/\s+/).filter(Boolean);
      voornaam = delen[0] || '';
      achternaam = delen.length > 1 ? delen.slice(1).join(' ') : '';
    }
    const bedrijf = zoekVeld(data, 'bedrijf');
    const email = zoekVeld(data, 'email').toLowerCase();
    const telefoon = zoekVeld(data, 'telefoon');
    const plaats = zoekVeld(data, 'plaats');
    const bericht = zoekVeld(data, 'bericht');
    const bezoekerId = zoekVeld(data, 'bezoeker_id');
    const nu = new Date().toISOString();
    const notitie = [`Websiteformulier "${formulier}"`, paginaUrl && `pagina ${paginaUrl}`].filter(Boolean).join(', ') + (bericht ? `:\n${bericht}` : '');

    // ---- Bestaande lead? (e-mail, dan telefoon) ----
    let lead = null;
    let nieuw = false;
    if (email) {
      const r = await db.Lead.filter({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }, '-created_date', 1);
      lead = r[0] || null;
    }
    if (!lead) {
      const pattern = buildPhonePattern(telefoon);
      if (pattern) {
        const r = await db.Lead.filter({ phone_e164: { $regex: pattern, $options: 'i' } }, '-created_date', 1);
        lead = r[0] || null;
      }
    }

    if (!lead) {
      lead = await db.Lead.create({
        name: naam,
        first_name: voornaam,
        last_name: achternaam,
        email,
        phone: telefoon,
        phone_e164: naarE164(telefoon),
        company: bedrijf,
        city: plaats,
        bron: 'website',
        status: 'Nieuw',
        verrijking_status: 'niet_verrijkt',
        lead_date: ontvangen,
        website_submission_id: submissionId,
        website_formulier: formulier,
        website_bericht: bericht,
        website_velden: data,
        bezoeker_id: bezoekerId || undefined,
        melding_verstuurd: false,
      });
      nieuw = true;
    }

    await db.LeadContactmoment.create({
      lead_id: lead.id,
      datum: nu,
      wie: 'Website (automatisch)',
      kanaal: 'overig',
      notitie,
    });

    // ---- Bezoeker koppelen (als het formulier de tracker-cookie meestuurde) ----
    if (bezoekerId) {
      try {
        const b = await db.Bezoeker.filter({ bezoeker_id: bezoekerId }, '-created_date', 1);
        if (b[0]) {
          await db.Bezoeker.update(b[0].id, {
            lead_id: lead.id,
            status: b[0].status === 'klant' ? 'klant' : 'lead',
            naam: b[0].naam || naam,
            bedrijf: b[0].bedrijf || bedrijf,
            email: b[0].email || email,
            telefoon: b[0].telefoon || telefoon,
          });
        }
      } catch (_) { /* koppeling is optioneel */ }
    }

    // ---- E-mailmelding naar sales ----
    const ontvangers = (tekst(settings[0]?.website_lead_email) || STANDAARD_MAIL)
      .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const rijen = Object.entries(data)
      .filter(([k]) => sleutel(k) && !VELDEN.bezoeker_id.includes(sleutel(k)))
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>`)
      .join('');
    const onderwerp = `Nieuwe websitelead: ${naam || email || 'onbekend'}${bedrijf ? ` (${bedrijf})` : ''}`;
    const html = `
      <p>Er is een ${nieuw ? 'nieuwe lead' : 'nieuwe aanvraag van een bestaande lead'} binnengekomen via het formulier <b>${esc(formulier)}</b> op de website.</p>
      <table style="border-collapse:collapse;font-size:14px">${rijen}</table>
      ${paginaUrl ? `<p style="color:#666;font-size:13px">Pagina: ${esc(paginaUrl)}</p>` : ''}
      <p style="color:#666;font-size:13px">De lead staat in de BMC Sales tool onder Website → Ontvangen leads.</p>`;

    let mailFout = '';
    for (const to of ontvangers) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to,
          subject: onderwerp,
          body: html,
          from_name: 'BMC Website',
        });
      } catch (e) {
        mailFout = e?.message || String(e);
      }
    }
    if (!mailFout && nieuw) {
      await db.Lead.update(lead.id, { melding_verstuurd: true });
    }

    return Response.json({
      ok: true,
      versie: VERSIE,
      created: nieuw,
      lead_id: lead.id,
      mail: mailFout ? { ok: false, fout: mailFout } : { ok: true, naar: ontvangers },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
