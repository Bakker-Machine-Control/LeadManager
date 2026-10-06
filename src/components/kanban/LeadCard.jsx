import { Draggable } from '@hello-pangea/dnd';
import { format, parseISO } from 'date-fns';
import { Building2, Check, MapPin, Phone } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import BronBadge from '@/components/kanban/BronBadge';

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

export default function LeadCard({ lead, index, onClick, geselecteerd, onSelecteer }) {
  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`rounded-md border border-border bg-card p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/60 transition-colors ${
            snapshot.isDragging ? 'ring-2 ring-primary opacity-90' : ''
          } ${geselecteerd ? 'ring-2 ring-primary bg-primary/5' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelecteer?.(lead.id); }}
              aria-label={geselecteerd ? 'Deselecteren' : 'Selecteren'}
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                geselecteerd
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/40 hover:border-primary'
              }`}
            >
              {geselecteerd && <Check className="w-3 h-3" />}
            </button>
            <p className="font-medium truncate flex-1">{lead.name || '—'}</p>
            <BronBadge bron={lead.bron} />
            <ScoreBadge score={lead.score} score_label={lead.score_label} />
          </div>
          {lead.company && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Building2 className="w-3 h-3 shrink-0" />
              {lead.company}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {lead.city || '—'}
            </span>
            <span className="whitespace-nowrap">{fmtDate(lead.lead_date)}</span>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 whitespace-nowrap">
            <Phone className="w-3 h-3 shrink-0" />
            {lead.phone_e164 || lead.phone || '—'}
          </p>
        </div>
      )}
    </Draggable>
  );
}