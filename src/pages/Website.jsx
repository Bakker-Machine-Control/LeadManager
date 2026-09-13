import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Globe, RefreshCw, LayoutDashboard, Users, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { websiteStats } from '@/functions/websiteStats';
import { periodeRange } from '@/lib/websiteUtils';
import OverzichtTab from '@/components/website/OverzichtTab';
import BezoekersTab from '@/components/website/BezoekersTab';
import KaartTab from '@/components/website/KaartTab';
import BezoekerDetail from '@/components/website/BezoekerDetail';

const PERIODES = [
  { value: 'vandaag', label: 'Vandaag' },
  { value: '7d', label: 'Afgelopen 7 dagen' },
  { value: '30d', label: 'Afgelopen 30 dagen' },
  { value: 'eigen', label: 'Eigen periode' },
];

export default function Website() {
  const { toast } = useToast();
  const [periode, setPeriode] = useState('7d');
  const [van, setVan] = useState('');
  const [tot, setTot] = useState('');
  const [stats, setStats] = useState(null);
  const [laden, setLaden] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState(null);

  const range = periodeRange(periode, van, tot);

  const laadStats = useCallback(async () => {
    setLaden(true);
    try {
      const res = await websiteStats({ periode, van, tot });
      setStats(res.data);
    } catch (e) {
      toast({ title: 'Fout bij laden statistieken', description: e.message, variant: 'destructive' });
    }
    setLaden(false);
  }, [periode, van, tot]);

  useEffect(() => {
    laadStats();
  }, [laadStats]);

  // Dieptelink ?bezoeker=<id> opent meteen het bezoekersprofiel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('bezoeker');
    if (id) {
      base44.entities.Bezoeker.get(id).then(setGeselecteerd).catch(() => {});
    }
  }, []);

  const openBezoeker = async (b) => {
    if (!b) return;
    if (b.id) {
      setGeselecteerd(b);
      return;
    }
    try {
      const r = await base44.entities.Bezoeker.filter({ bezoeker_id: b.bezoeker_id });
      if (r[0]) setGeselecteerd(r[0]);
      else toast({ title: 'Bezoeker niet gevonden', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Fout bij openen bezoeker', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Website</h1>
          <a
            href="https://www.bmc-consultancy.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-2 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            <Globe className="w-4 h-4" /> www.bmc-consultancy.com
          </a>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={periode} onValueChange={setPeriode}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {periode === 'eigen' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={van} onChange={(e) => setVan(e.target.value)} className="w-36" />
              <span className="text-sm text-muted-foreground">t/m</span>
              <Input type="date" value={tot} onChange={(e) => setTot(e.target.value)} className="w-36" />
            </div>
          )}
          <Button variant="outline" onClick={laadStats} disabled={laden} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${laden ? 'animate-spin' : ''}`} />
            Verversen
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overzicht">
        <TabsList>
          <TabsTrigger value="overzicht" className="gap-2">
            <LayoutDashboard className="w-4 h-4" /> Overzicht
          </TabsTrigger>
          <TabsTrigger value="bezoekers" className="gap-2">
            <Users className="w-4 h-4" /> Bezoekers
          </TabsTrigger>
          <TabsTrigger value="kaart" className="gap-2">
            <MapPin className="w-4 h-4" /> Kaart
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overzicht">
          <OverzichtTab stats={stats} laden={laden} />
        </TabsContent>
        <TabsContent value="bezoekers">
          <BezoekersTab van={range.van} tot={range.tot} onOpenDetail={openBezoeker} />
        </TabsContent>
        <TabsContent value="kaart">
          <KaartTab bezoekers={stats?.kaart || []} onOpenDetail={openBezoeker} />
        </TabsContent>
      </Tabs>

      <BezoekerDetail bezoeker={geselecteerd} open={!!geselecteerd} onClose={() => setGeselecteerd(null)} />
    </div>
  );
}