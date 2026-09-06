import { useState } from 'react';
import { Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const KANALEN = ['telefoon', 'e-mail', 'whatsapp', 'bezoek', 'overig'];

// Voegt een contactmoment (notitie) toe aan een lead
export default function ContactmomentForm({ leadId, wie, onToegevoegd }) {
  const { toast } = useToast();
  const [kanaal, setKanaal] = useState('telefoon');
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState(false);

  const voegToe = async () => {
    if (!notitie.trim() || bezig) return;
    setBezig(true);
    try {
      await base44.entities.LeadContactmoment.create({
        lead_id: leadId,
        datum: new Date().toISOString(),
        wie: wie || '',
        kanaal,
        notitie: notitie.trim(),
      });
      setNotitie('');
      toast({ title: 'Contactmoment toegevoegd' });
      onToegevoegd();
    } catch (e) {
      toast({ title: 'Opslaan mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={kanaal} onValueChange={setKanaal}>
        <SelectTrigger className="h-8 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KANALEN.map(k => (
            <SelectItem key={k} value={k}>{k}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        rows={2}
        placeholder="Wat is er besproken of gedaan?"
        value={notitie}
        onChange={(e) => setNotitie(e.target.value)}
      />
      <Button size="sm" onClick={voegToe} disabled={bezig || !notitie.trim()} className="gap-1">
        <Plus className="w-3.5 h-3.5" />
        {bezig ? 'Toevoegen…' : 'Contactmoment toevoegen'}
      </Button>
    </div>
  );
}