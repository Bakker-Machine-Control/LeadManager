import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LEAD_STATUSES } from '@/lib/leadStatuses';

// Zwevende actiebalk onderin: toont hoeveel leads er geselecteerd zijn en
// verplaatst ze in één keer naar een gekozen kolom.
export default function SelectieBalk({ kolom, aantal, doel, setDoel, onVerplaats, onAnnuleer, bezig }) {
  if (!aantal) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium whitespace-nowrap">
        {aantal} geselecteerd in {kolom}
      </span>
      <Select value={doel} onValueChange={setDoel}>
        <SelectTrigger className="h-9 w-44 text-sm">
          <SelectValue placeholder="Naar kolom" />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUSES.filter(s => s !== kolom).map(s => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onVerplaats} disabled={!doel || bezig} className="whitespace-nowrap">
        {bezig ? 'Verplaatsen…' : 'Verplaats'}
      </Button>
      <Button variant="ghost" size="icon" onClick={onAnnuleer} aria-label="Selectie wissen">
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}