import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// BMC is de enige distributeur die terugschrijven mag: de lead moet in SmartSuite
// zijn toegewezen aan Adriaan Bakker (sales@bmc-consultancy.com).
const BMC_SMARTSUITE_USER_ID = '6698de738f388153837e4850';

// Vertaling van werkstatus naar SmartSuite (progress-veld + de twee ja/nee-velden)
const STATUS_MAP = {
  'nieuw': { smartsuiteStatus: 'backlog' },
  'te benaderen': { smartsuiteStatus: 'backlog' },
  'benaderd': { smartsuiteStatus: 'in_progress' },
  'gekwalificeerd': { smartsuiteStatus: 'in_progress', opportunity: true },
  'offerte': { smartsuiteStatus: 'in_progress', opportunity: true },
  'gewonnen': { smartsuiteStatus: 'complete', convertedToSale: true },
  'verloren': { smartsuiteStatus: 'complete' },
  'niet gekwalificeerd': { smartsuiteStatus: 'complete' },
  'duplicaat': { smartsuiteStatus: 'complete' },
  'junk': { smartsuiteStatus: 'complete' },
  'afgehandeld': { smartsuiteStatus: 'complete' },
};

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { lead_id, status } = body;
    if (!lead_id || !status) {
      return Response.json({ error: 'lead_id en status zijn verplicht' }, { status: 400 });
    }

    const mapping = STATUS_MAP[status];
    if (!mapping) {
      return Response.json({ error: `Onbekende werkstatus: ${status}` }, { status: 400 });
    }

    // 1. Lead laden uit de database — niets komt uit het verzoek behalve lead_id + status
    const lead = await base44.entities.Lead.get(lead_id);
    if (!lead) {
      return Response.json({ error: `Lead ${lead_id} niet gevonden` }, { status: 404 });
    }
    const oldStatus = lead.status || '';

    const logAction = async (outcome, extra) => {
      await base44.entities.SyncLog.create({
        action: 'sync',
        status: outcome === 'success' ? 'success' : 'error',
        message: outcome === 'success'
          ? `Status terugschreven naar SmartSuite (${lead.name || lead_id}): '${oldStatus}' → '${status}' (SmartSuite: ${mapping.smartsuiteStatus}${mapping.opportunity ? ', Turn into Opportunity = true' : ''}${mapping.convertedToSale ? ', Converted into Sale = true' : ''})`
          : `Terugschrijven naar SmartSuite mislukt (${lead.name || lead_id}): '${oldStatus}' → '${status}' — ${extra}`,
        records_affected: outcome === 'success' ? 1 : 0,
        details: {
          lead_id,
          smartsuite_record_id: lead.smartsuite_id,
          old_status: oldStatus,
          new_status: status,
          smartsuite_status_value: mapping.smartsuiteStatus,
          outcome: outcome === 'success' ? 'success' : extra,
        },
      });
    };

    // 2. BMC-waarborg: toegewezen aan Adriaan Bakker in SmartSuite, anders weigeren
    const assignedTo = JSON.stringify(lead.raw_data?.assigned_to || '');
    if (!assignedTo.includes(BMC_SMARTSUITE_USER_ID)) {
      await logAction('error', 'geweigerd: lead is niet toegewezen aan BMC (Adriaan Bakker)');
      return Response.json(
        { error: 'Deze lead is niet toegewezen aan BMC (Adriaan Bakker) — terugschrijven geweigerd.' },
        { status: 403 }
      );
    }

    // 3. Credentials uitsluitend uit AppSettings
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'main' });
    const s = settings[0];
    if (!s?.smartsuite_api_token || !s?.smartsuite_account_id || !s?.smartsuite_table_id) {
      await logAction('error', 'SmartSuite-instellingen ontbreken in AppSettings');
      return Response.json({ error: 'SmartSuite-instellingen ontbreken' }, { status: 500 });
    }

    // 4. PATCH alleen het status-veld en eventueel de twee ja/nee-velden
    const patchBody = { status: mapping.smartsuiteStatus };
    if (mapping.opportunity) patchBody.s73c55f7ca = true;
    if (mapping.convertedToSale) patchBody.s2kr26sw = true;

    let ok = false;
    let failure = null;
    try {
      const response = await fetch(
        `https://app.smartsuite.com/api/v1/applications/${s.smartsuite_table_id}/records/${lead.smartsuite_id}/`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Token ${s.smartsuite_api_token}`,
            'ACCOUNT-ID': s.smartsuite_account_id,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patchBody),
        }
      );
      ok = response.ok;
      if (!ok) {
        failure = `SmartSuite weigerde de wijziging (HTTP ${response.status} - ${(await response.text()).substring(0, 200)})`;
      }
    } catch (e) {
      failure = `Netwerkfout richting SmartSuite: ${e.message}`;
    }

    // 5. Uitkomst loggen; bij succes ook de lokale werkstatus bijwerken
    if (ok) {
      await base44.entities.Lead.update(lead_id, { status });
    }
    await logAction(ok ? 'success' : 'error', failure);

    if (!ok) {
      return Response.json({ error: failure, lead_id }, { status: 502 });
    }

    return Response.json({
      ok: true,
      lead_id,
      old_status: oldStatus,
      new_status: status,
      smartsuite_status_value: mapping.smartsuiteStatus,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}