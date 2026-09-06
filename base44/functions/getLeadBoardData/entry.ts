import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Lijst met leads voor het Kanban-bord en de Meta-pagina.
// Geeft per lead alleen de velden die het bord nodig heeft (zonder raw_data),
// zodat 15k+ leads snel laadbaar blijven. Paginering via skip/limit.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 1000);
    const skip = Math.max(Number(body.skip) || 0, 0);

    const batch = await base44.asServiceRole.entities.Lead.list('-created_date', limit, skip);
    const leads = batch.map(l => ({
      id: l.id,
      smartsuite_id: l.smartsuite_id || '',
      name: l.name || '',
      company: l.company || '',
      city: l.city || '',
      phone: l.phone || '',
      phone_e164: l.phone_e164 || '',
      lead_date: l.lead_date || '',
      status: l.status || 'Nieuw',
      meta_lead_id: l.meta_lead_id || '',
      ad_id: l.ad_id || '',
      ad_naam: l.ad_naam || '',
      campagne: l.campagne || '',
      formulier: l.formulier || '',
      platform: l.platform || '',
      aangeleverde_tekst: l.aangeleverde_tekst || '',
    }));

    return Response.json({ ok: true, leads, has_more: batch.length === limit });
  } catch (error) {
    console.error('getLeadBoardData error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}