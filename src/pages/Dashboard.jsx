import { useState, useMemo } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useBoardLeads } from '@/hooks/useBoardLeads';
import { LEAD_STATUSES } from '@/lib/leadStatuses';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KanbanColumn from '@/components/kanban/KanbanColumn';

const SCORE_FILTERS = ['Heet', 'Warm', 'Lauw', 'Koud'];

export default function Dashboard() {
  const { leads, loading, setLeads, reload } = useBoardLeads();
  const { toast } = useToast();
  const [scoreFilter, setScoreFilter] = useState('');
  const [verrijken, setVerrijken] = useState(false);

  // Hoeveel leads in "Nieuw" nog op verrijking wachten
  const wachtendOpVerrijking = leads.filter(l =>
    l.status === 'Nieuw' && (l.verrijking_status === 'niet_verrijkt' || l.verrijking_status === 'mislukt')
  ).length;

  // Filter op score_label (alleen als er een filter gekozen is)
  const zichtbareLeads = useMemo(
    () => (scoreFilter ? leads.filter(l => l.score_label === scoreFilter) : leads),
    [leads, scoreFilter]
  );

  const kolomLeads = (status) => {
    const inKolom = zichtbareLeads.filter(l => (l.status || 'Nieuw') === status);
    // De kolom "Nieuw" staat standaard op score aflopend; leads zonder score onderaan
    if (status === 'Nieuw') {
      return [...inKolom].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
    return inKolom;
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
      await reload();
    } catch (e) {
      toast({ title: 'Verrijking mislukt', description: e.message, variant: 'destructive' });
    }
    setVerrijken(false);
  };

  const handleDragEnd = async ({ destination, draggableId }) => {
    if (!destination) return;
    const newStatus = destination.droppableId;
    const lead = leads.find(l => l.id === draggableId);
    if (!lead || lead.status === newStatus) return;
    const prevStatus = lead.status;

    // Optimistisch bijwerken, daarna opslaan; bij een fout terugdraaien
    setLeads(prev => prev.map(l => (l.id === draggableId ? { ...l, status: newStatus } : l)));
    try {
      await base44.entities.Lead.update(draggableId, { status: newStatus });
    } catch (e) {
      setLeads(prev => prev.map(l => (l.id === draggableId ? { ...l, status: prevStatus } : l)));
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
          <Select value={scoreFilter || 'alle'} onValueChange={v => setScoreFilter(v === 'alle' ? '' : v)}>
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
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
            {LEAD_STATUSES.map(status => (
              <KanbanColumn key={status} status={status} leads={kolomLeads(status)} />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}