import { useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useBoardLeads } from '@/hooks/useBoardLeads';
import { LEAD_STATUSES } from '@/lib/leadStatuses';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KanbanColumn from '@/components/kanban/KanbanColumn';
import KanbanLeadModal from '@/components/kanban/KanbanLeadModal';
import SelectieBalk from '@/components/kanban/SelectieBalk';

const SCORE_FILTERS = ['Heet', 'Warm', 'Lauw', 'Koud'];

export default function Dashboard() {
  const {
    kolommen, wachtendOpVerrijking, loading, laadtMeerStatus, fout,
    reload, laadMeer, verplaatsLead,
  } = useBoardLeads();
  const { toast } = useToast();
  const [scoreFilter, setScoreFilter] = useState('');
  const [verrijken, setVerrijken] = useState(false);
  const [geselecteerdeLead, setGeselecteerdeLead] = useState(null);
  // Meervoudige selectie binnen één kolom: { status, ids } — een klik in een
  // andere kolom begint meteen een nieuwe selectie
  const [selectie, setSelectie] = useState({ status: null, ids: new Set() });
  const [doelKolom, setDoelKolom] = useState('');
  const [bezigVerplaatsen, setBezigVerplaatsen] = useState(false);
  // Kolom Afgewezen toont standaard alleen de laatste 10 kaarten; met
  // "Toon alle" wordt de hele kolom zichtbaar
  const [toonAlleAfgewezen, setToonAlleAfgewezen] = useState(false);

  const wisselSelectie = (status, leadId) => {
    setSelectie(prev => {
      if (prev.status && prev.status !== status) {
        return { status, ids: new Set([leadId]) };
      }
      const ids = new Set(prev.ids);
      if (ids.has(leadId)) ids.delete(leadId); else ids.add(leadId);
      return { status, ids };
    });
  };

  const wisSelectie = () => {
    setSelectie({ status: null, ids: new Set() });
    setDoelKolom('');
  };

  // Verplaatst een lijst met lead-ids één voor één naar de doelkolom.
  // Elke lead wordt apart opgeslagen met een korte pauze ertussen zodat de
  // database niet overstroomt; een lead die niet lukt, wordt één keer
  // opnieuw geprobeerd en blokkeert de rest van de reeks niet.
  const verplaatsMeerdere = async (ids, van, naar) => {
    const wacht = (ms) => new Promise(r => setTimeout(r, ms));
    let gelukt = 0;
    let mislukt = [];
    const probeer = async (id) => {
      try {
        await verplaatsLead(id, van, naar);
        return true;
      } catch {
        return false;
      }
    };
    for (const id of ids) {
      if (await probeer(id)) {
        gelukt++;
      } else {
        mislukt.push(id);
      }
      await wacht(150);
    }
    // Eén herkansing voor de leads die net niet gingen
    if (mislukt.length) {
      await wacht(1000);
      const opnieuw = mislukt;
      mislukt = [];
      for (const id of opnieuw) {
        if (await probeer(id)) gelukt++; else mislukt.push(id);
        await wacht(150);
      }
    }
    return { gelukt, mislukt };
  };

  const toonResultaat = (gelukt, mislukt, naar) => {
    if (mislukt.length) {
      toast({
        title: 'Niet alles verplaatst',
        description: `${gelukt} verplaatst, ${mislukt.length} mislukt. Probeer de rest later opnieuw.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Leads verplaatst',
        description: `${gelukt} lead(s) verplaatst naar ${naar}`,
        className: 'border-green-600 bg-green-600 text-white',
      });
    }
  };

  const verplaatsSelectie = async () => {
    if (!doelKolom || !selectie.ids.size) return;
    setBezigVerplaatsen(true);
    const { gelukt, mislukt } = await verplaatsMeerdere(selectie.ids, selectie.status, doelKolom);
    toonResultaat(gelukt, mislukt, doelKolom);
    wisSelectie();
    setBezigVerplaatsen(false);
  };

  // De kolom "Nieuw" op score aflopend (leads zonder score onderaan);
  // de overige kolommen komen al op lead_date gesorteerd van de server
  const kolomLeads = (status) => {
    const leads = kolommen[status]?.leads || [];
    if (status === 'Afgewezen' && !toonAlleAfgewezen) return leads.slice(0, 10);
    if (status !== 'Nieuw') return leads;
    return [...leads].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  };

  // Het scorefilter gaat naar de server: na het wijzigen opnieuw laden
  const wisselScoreFilter = (waarde) => {
    const label = waarde === 'alle' ? '' : waarde;
    setScoreFilter(label);
    reload(label);
  };

  const handleVerrijk = async () => {
    setVerrijken(true);
    try {
      const res = await base44.functions.invoke('verrijkLead', { status: 'Nieuw', limit: 25 });
      const d = res.data || {};
      toast({
        title: 'Verrijking klaar',
        description: `${d.gelukt ?? 0} verrijkt, ${d.onvoldoende_gegevens ?? 0} onvoldoende gegevens, ${d.mislukt ?? 0} mislukt.`,
      });
      await reload(scoreFilter);
    } catch (e) {
      toast({ title: 'Verrijking mislukt', description: e.message, variant: 'destructive' });
    }
    setVerrijken(false);
  };

  const handleDragEnd = async ({ destination, source, draggableId }) => {
    if (!destination || !source) return;
    const nieuweStatus = destination.droppableId;
    const oudeStatus = source.droppableId;
    if (oudeStatus === nieuweStatus) return;
    // Sleep je een geselecteerde kaart naar een andere kolom, dan gaat de
    // hele selectie mee in plaats van alleen de gesleepte kaart
    if (selectie.status === oudeStatus && selectie.ids.has(draggableId) && selectie.ids.size > 1) {
      setBezigVerplaatsen(true);
      const { gelukt, mislukt } = await verplaatsMeerdere(selectie.ids, oudeStatus, nieuweStatus);
      toonResultaat(gelukt, mislukt, nieuweStatus);
      wisSelectie();
      setBezigVerplaatsen(false);
      return;
    }
    try {
      await verplaatsLead(draggableId, oudeStatus, nieuweStatus);
    } catch (e) {
      toast({ title: 'Status niet opgeslagen', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kanban-bord</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Sleep leads tussen kolommen om de werkstatus te wijzigen, of selecteer er meerdere met ⌘/Ctrl + klik
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleVerrijk} disabled={verrijken || loading} className="gap-2">
            <Sparkles className={`w-4 h-4 ${verrijken ? 'animate-pulse' : ''}`} />
            {verrijken
              ? 'Verrijken loopt… dit kan enkele minuten duren'
              : `Verrijk nieuwe leads${wachtendOpVerrijking > 0 ? ` (${wachtendOpVerrijking} wachten)` : ''}`}
          </Button>
          <Select value={scoreFilter || 'alle'} onValueChange={wisselScoreFilter}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="Alle scores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle scores</SelectItem>
              {SCORE_FILTERS.map(label => (
                <SelectItem key={label} value={label}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : fout ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-md">
              Het bord kon niet geladen worden: {fout}
            </p>
            <Button variant="outline" onClick={() => reload(scoreFilter)}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
            {LEAD_STATUSES.map(status => (
              <KanbanColumn
                key={status}
                status={status}
                leads={kolomLeads(status)}
                totaal={kolommen[status]?.totaal ?? 0}
                laadtMeer={laadtMeerStatus === status}
                onLaadMeer={() => laadMeer(status)}
                archief={status === 'Afgerond'}
                limiet={status === 'Afgewezen' && !toonAlleAfgewezen ? 10 : null}
                onToonAlle={() => setToonAlleAfgewezen(true)}
                onLeadClick={setGeselecteerdeLead}
                geselecteerd={selectie.status === status ? selectie.ids : null}
                onSelecteer={(id) => wisselSelectie(status, id)}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      <KanbanLeadModal
        lead={geselecteerdeLead}
        open={!!geselecteerdeLead}
        onClose={() => setGeselecteerdeLead(null)}
      />

      <SelectieBalk
        kolom={selectie.status}
        aantal={selectie.ids.size}
        doel={doelKolom}
        setDoel={setDoelKolom}
        onVerplaats={verplaatsSelectie}
        onAnnuleer={wisSelectie}
        bezig={bezigVerplaatsen}
      />
    </div>
  );
}