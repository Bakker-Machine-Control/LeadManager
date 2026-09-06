import { useMemo, useState } from 'react';
import { useAllLeads } from '@/hooks/useAllLeads';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Megaphone, ExternalLink, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

export default function Meta() {
  // Uitsluitend leads uit BMC's eigen Meta-advertenties (bron 'meta') —
  // serverzijdig gefilterd. De SmartSuite-instroom hoort hier niet thuis.
  const { leads, loading, fout, reload } = useAllLeads({ bron: 'meta' });
  const [syncBezig, setSyncBezig] = useState(false);

  // Haalt de nieuwste leads rechtstreeks uit Meta op en ververst daarna de lijst
  const handleSync = async () => {
    setSyncBezig(true);
    try {
      const res = await base44.functions.invoke('syncMetaLeads', {});
      const d = res.data || {};
      toast({
        title: 'Meta-leads opgehaald',
        description: `${d.received || 0} leads gecontroleerd: ${d.created || 0} nieuw, ${d.updated || 0} bijgewerkt${d.errors ? `, ${d.errors} fouten` : ''}.`,
      });
      await reload();
    } catch (e) {
      toast({ title: 'Meta-sync mislukt', description: e.message || 'Onbekende fout', variant: 'destructive' });
    } finally {
      setSyncBezig(false);
    }
  };

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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Meta</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Leads uit BMC's eigen Meta-advertenties
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncBezig}>
            <RefreshCw className={`w-4 h-4 ${syncBezig ? 'animate-spin' : ''}`} />
            {syncBezig ? 'Ophalen…' : 'Meta-leads ophalen'}
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="https://business.facebook.com/latest/home?business_id=113727034677197&asset_id=113725064677394&nav_ref=fb_web_pplus_settings_menu"
               target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              Meta Business Suite
            </a>
          </Button>
        </div>
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
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Megaphone className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-lg">
              BMC's eigen Meta-koppeling is nog niet ingericht. Zodra advertenties van BMC
              zelf binnenkomen, verschijnen ze hier. De leads uit de SmartSuite-instroom
              staan onder SmartSuite — dat is Unicontrols wereldwijde trechter, niet die van BMC.
            </p>
          </CardContent>
        </Card>
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