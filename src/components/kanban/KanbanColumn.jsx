import { Link } from 'react-router-dom';
import { Droppable } from '@hello-pangea/dnd';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LeadCard from './LeadCard';

export default function KanbanColumn({ status, leads, totaal, laadtMeer, onLaadMeer, archief }) {
  // Nog niet geladen leads in deze kolom (totaal komt van de server)
  const nogMeer = Math.max(0, totaal - leads.length);

  return (
    <div className="rounded-lg border border-border bg-secondary/50 flex flex-col min-h-[300px]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold">{status}</span>
        {/* Het echte totaal uit de server, niet alleen het aantal geladen kaarten */}
        <span className="text-xs font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
          {totaal}
        </span>
      </div>
      <Droppable droppableId={status}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 p-2 space-y-2 min-h-[120px]"
          >
            {leads.map((lead, index) => (
              <LeadCard key={lead.id} lead={lead} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      {archief ? (
        <div className="px-2 pb-2">
          <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
            <Link to="/archief">
              <Archive className="w-3.5 h-3.5" />
              Naar het archief
            </Link>
          </Button>
        </div>
      ) : nogMeer > 0 && (
        <div className="px-2 pb-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onLaadMeer} disabled={laadtMeer}>
            {laadtMeer ? 'Laden…' : `Meer laden (nog ${nogMeer})`}
          </Button>
        </div>
      )}
    </div>
  );
}