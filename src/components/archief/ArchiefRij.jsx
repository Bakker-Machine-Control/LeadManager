import { format, parseISO } from 'date-fns';
import { Building2, MapPin, Phone } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

// Eén afgeronde lead in het archief: naam, bedrijf, plaats, datum en telefoon
export default function ArchiefRij({ lead }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium truncate flex-1">{lead.name || '—'}</p>
        <ScoreBadge score={lead.score} score_label={lead.score_label} />
      </div>
      {lead.company && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 truncate mt-0.5">
          <Building2 className="w-3 h-3 shrink-0" />
          {lead.company}
        </p>
      )}
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 truncate">
          <MapPin className="w-3 h-3 shrink-0" />
          {lead.city || '—'}
        </span>
        <span className="whitespace-nowrap">{fmtDate(lead.lead_date)}</span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Phone className="w-3 h-3 shrink-0" />
          {lead.phone_e164 || lead.phone || '—'}
        </span>
      </div>
    </div>
  );
}