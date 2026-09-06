import { useMemo } from 'react';
import { useAllLeads } from '@/hooks/useAllLeads';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Megaphone } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

export default function Meta() {
  const { leads, loading, fout, reload } = useAllLeads();

  // Groepeer per advertentie (op ad_naam, anders ad_id), met aantal leads per advertentie
  const groups = useMemo(() => {
    const map = new Map();
    for (const lead of leads) {
      const key = lead.ad_naam || (lead.ad_id ? `Ad ${lead.ad_id}` : '') || 'Zonder advertentie';
      if (!map.has(key)) {
        map.set(key, { naam: key, ad_id: lead.ad_id || '', leads: [] });
      }
      map.get(key).leads.push(lead);
    }
    return [...map.values()]
      .map(g => ({ ...g, leads: [...g.leads].sort((a, b) => (b.lead_date || '').localeCompare(a.lead_date || '')) }))
      .sort((a, b) => b.leads.length - a.leads.length);
  }, [leads]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meta</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Meta-advertentiegegevens per lead uit SmartSuite, gegroepeerd per advertentie
        </p>
      </div>

      {fout ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-md">
              De leads konden niet geladen worden: {fout}
            </p>
            <Button variant="outline" onClick={reload}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <Card key={group.naam}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Megaphone className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm truncate">{group.naam}</span>
                    {group.ad_id && (
                      <span className="text-xs text-muted-foreground font-mono truncate">({group.ad_id})</span>
                    )}
                  </div>
                  <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5 whitespace-nowrap">
                    {group.leads.length} leads
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-y border-border text-muted-foreground text-xs uppercase tracking-wide">
                        <th className="px-4 py-2 text-left font-medium">Naam</th>
                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Datum</th>
                        <th className="px-4 py-2 text-left font-medium">Platform</th>
                        <th className="px-4 py-2 text-left font-medium">Formulier</th>
                        <th className="px-4 py-2 text-left font-medium">Campagne</th>
                        <th className="px-4 py-2 text-left font-medium">Meta lead ID</th>
                        <th className="px-4 py-2 text-left font-medium">Aangeleverde tekst</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {group.leads.map(lead => (
                        <tr key={lead.id} className="hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-medium">{lead.name || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDate(lead.lead_date)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{lead.platform || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{lead.formulier || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{lead.campagne || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{lead.meta_lead_id || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-xs">
                            <span className="block truncate" title={lead.aangeleverde_tekst}>
                              {lead.aangeleverde_tekst || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}