import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { periodeRange } from '@/lib/websiteUtils';
import KanalenKaart from '@/components/kaart/KanalenKaart';

// Kaart met alle kanalen bij elkaar: leads uit Direct, Meta, Website en
// SmartSuite plus websitebezoekers, met hetzelfde periodefilter als de
// Website-pagina.

const PERIODES = [
  { value: 'vandaag', label: 'Vandaag' },
  { value: '7d', label: 'Afgelopen 7 dagen' },
  { value: '30d', label: 'Afgelopen 30 dagen' },
  { value: 'eigen', label: 'Eigen periode' },
];

export default function Kaart() {
  const { toast } = useToast();
  const [periode, setPeriode] = useState('30d');
  const [van, setVan] = useState('');
  const [tot, setTot] = useState('');
  const [leads, setLeads] = useState([]);
  const [bezoekers, setBezoekers] = useState([]);
  const [laden, setLaden] = useState(false);
  const [ververstOp, setVerverstOp] = useState(0);

  const range = periodeRange(periode, van, tot);

  const laadData = useCallback(async () => {
    // Eigen periode zonder complete datums: niets ophalen (geen stille fallback)
    if (periode === 'eigen' && (!van || !tot)) {
      setLeads([]);
      setBezoekers([]);
      return;
    }
    setLaden(true);
    try {
      // lead_date is een datum (jjjj-mm-dd); laatste_bezoek een volledig tijdstip
      const vanDatum = range.van.slice(0, 10);
      const totDatum = range.tot.slice(0, 10);
      const [l, b] = await Promise.all([
        base44.entities.Lead.filter({ lead_date: { $gte: vanDatum, $lte: totDatum } }, '-created_date', 1000),
        base44.entities.Bezoeker.filter({ laatste_bezoek: { $gte: range.van, $lte: range.tot } }, '-laatste_bezoek', 1000),
      ]);
      setLeads(l);
      setBezoekers(b);
    } catch (e) {
      toast({ title: 'Fout bij laden', description: e.message, variant: 'destructive' });
    }
    setLaden(false);
    // range volgt uit periode/van/tot en staat dus niet apart in de afhankelijkheden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, van, tot, ververstOp, toast]);

  useEffect(() => {
    laadData();
  }, [laadData]);

  // Bij "Eigen periode" meteen een geldige standaardrange: afgelopen week
  const kiesPeriode = (keuze) => {
    setPeriode(keuze);
    if (keuze === 'eigen' && (!van || !tot)) {
      setVan(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
      setTot(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" /> Kaart
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle kanalen op één kaart: Direct, Meta, Website en SmartSuite
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={periode} onValueChange={kiesPeriode}>
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
          <Button
            variant="outline"
            onClick={() => setVerverstOp((n) => n + 1)}
            disabled={laden}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${laden ? 'animate-spin' : ''}`} />
            Verversen
          </Button>
        </div>
      </header>

      <KanalenKaart leads={leads} bezoekers={bezoekers} laden={laden} />
    </div>
  );
}