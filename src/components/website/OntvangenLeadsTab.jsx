import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Mail, Phone, Building2, MailCheck, MailX, UserRound } from 'lucide-react';
import { fmtDatum } from '@/lib/websiteUtils';
import LeadDetailModal from '@/components/LeadDetailModal';

// Leads die via het contact-/offerteformulier op de website binnenkwamen
// (functie websiteFormLead, gevoed door de Webflow-webhook).

const STATUS_STIJL = {
  Nieuw: 'bg-blue-100 text-blue-800',
  Contacten: 'bg-amber-100 text-amber-800',
  Afspraak: 'bg-violet-100 text-violet-800',
  Afgerond: 'bg-emerald-100 text-emerald-800',
  Afgewezen: 'bg-muted text-muted-foreground',
};

export default function OntvangenLeadsTab({ van, tot, ververstOp, onOpenBezoeker }) {
  const [rijen, setRijen] = useState(null);
  const [zoek, setZoek] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [geselecteerd, setGeselecteerd] = useState(null);

  const laad = () =>
    base44.entities.Lead.filter({ bron: 'website' }, '-created_date', 500)
      .then(setRijen)
      .catch(() => setRijen([]));

  useEffect(() => { laad(); }, [ververstOp]);

  const vanMs = new Date(van).getTime();
  const totMs = new Date(tot).getTime();

  const gefilterd = (rijen || []).filter((l) => {
    const t = new Date(l.lead_date || l.created_date || 0).getTime();
    if (t < vanMs || t > totMs) return false;
    if (statusFilter !== 'alle' && (l.status || 'Nieuw') !== statusFilter) return false;
    if (zoek) {
      const hooiberg = [l.name, l.company, l.email, l.phone, l.city, l.website_bericht, l.website_formulier]
        .join(' ').toLowerCase();
      if (!hooiberg.includes(zoek.toLowerCase())) return false;
    }
    return true;
  });

  const nieuw = gefilterd.filter((l) => (l.status || 'Nieuw') === 'Nieuw').length;

  const slaStatusOp = async (record, status) => {
    await base44.entities.Lead.update(record.id, { status });
    setGeselecteerd((g) => (g && g.id === record.id ? { ...g, status } : g));
    laad();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Zoek op naam, bedrijf, e-mail of bericht" value={zoek}
              onChange={(e) => setZoek(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              {Object.keys(STATUS_STIJL).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {gefilterd.length} leads via het websiteformulier in deze periode, waarvan {nieuw} nog nieuw.
      </p>

      <Card>
        <CardContent className="p-0">
          {rijen === null ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : gefilterd.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              Geen leads uit het websiteformulier in deze periode.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {gefilterd.map((l) => {
                const status = l.status || 'Nieuw';
                return (
                  <button key={l.id} type="button" onClick={() => setGeselecteerd(l)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <UserRound className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium truncate">
                        {l.name || l.email || 'Onbekend'}
                        {l.company && <span className="text-muted-foreground font-normal"> · {l.company}</span>}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {l.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{l.email}</span>}
                        {l.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{l.phone}</span>}
                        {l.city && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{l.city}</span>}
                      </div>
                      {l.website_bericht && (
                        <p className="text-sm text-foreground/80 line-clamp-2">{l.website_bericht}</p>
                      )}
                      {l.bezoeker_id && onOpenBezoeker && (
                        <span role="link" tabIndex={0}
                          className="text-xs text-primary underline underline-offset-4"
                          onClick={(e) => { e.stopPropagation(); onOpenBezoeker({ bezoeker_id: l.bezoeker_id }); }}>
                          Bezoekersprofiel openen
                        </span>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-xs text-muted-foreground">{fmtDatum(l.lead_date || l.created_date)}</p>
                      <p className="text-xs text-muted-foreground">{l.website_formulier || 'Websiteformulier'}</p>
                      <div className="flex items-center justify-end gap-2">
                        {l.melding_verstuurd
                          ? <MailCheck className="w-4 h-4 text-emerald-600" title="Melding naar sales verstuurd" />
                          : <MailX className="w-4 h-4 text-muted-foreground" title="Geen melding verstuurd" />}
                        <Badge className={`${STATUS_STIJL[status] || STATUS_STIJL.Nieuw} border-transparent`}>{status}</Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDetailModal
        record={geselecteerd ? { ...geselecteerd, raw_data: geselecteerd.raw_data || geselecteerd.website_velden || {} } : null}
        open={!!geselecteerd}
        onClose={() => setGeselecteerd(null)}
        onStatusSave={slaStatusOp}
        rawLabel="Alle formuliervelden"
      />
    </div>
  );
}
