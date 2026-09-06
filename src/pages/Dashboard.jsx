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

  // De kolom "Nieuw" op score aflopend (leads zonder score onderaan);
  // de overige kolommen komen al op lead_date gesorteerd van de server
  const kolomLeads = (status) => {
    const leads = kolommen[status]?.leads || [];
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
      const res = await base44.functions.invoke('enrichLead', { status: 'Nieuw', limit: 25 });
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
            Sleep leads tussen kolommen om de werkstatus te wijzigen
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
                onLeadClick={setGeselecteerdeLead}
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
    </div>
  );
}