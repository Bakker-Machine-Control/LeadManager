import { DragDropContext } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { useBoardLeads } from '@/hooks/useBoardLeads';
import { LEAD_STATUSES } from '@/lib/leadStatuses';
import { useToast } from '@/components/ui/use-toast';
import KanbanColumn from '@/components/kanban/KanbanColumn';

export default function Dashboard() {
  const { leads, loading, setLeads } = useBoardLeads();
  const { toast } = useToast();

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
      <div>
        <h1 className="text-2xl font-bold">Kanban-bord</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Sleep leads tussen kolommen om de werkstatus te wijzigen
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
            {LEAD_STATUSES.map(status => (
              <KanbanColumn
                key={status}
                status={status}
                leads={leads.filter(l => (l.status || 'Nieuw') === status)}
              />
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}