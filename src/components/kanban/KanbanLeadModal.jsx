import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { Mail, Phone, Building2, MapPin, Calendar, ExternalLink, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import ScoreBadge from '@/components/ScoreBadge';
import ContactmomentForm from './ContactmomentForm';
import ContactmomentLijst from './ContactmomentLijst';

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
    {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-all">{value || '—'}</p>
    </div>
  </div>
);

// Detailweergave van een lead op het bord: contactgegevens, opvolging
// (bewerkbaar) en contactmomenten (toevoegbaar).
export default function KanbanLeadModal({ lead, open, onClose }) {
  const { toast } = useToast();
  const [volledig, setVolledig] = useState(null);
  const [momenten, setMomenten] = useState([]);
  const [laadt, setLaadt] = useState(false);
  const [huidigeGebruiker, setHuidigeGebruiker] = useState('');
  const [opvolgdatum, setOpvolgdatum] = useState('');
  const [eigenaar, setEigenaar] = useState('');
  const [bezig, setBezig] = useState(false);

  const laadContactmomenten = useCallback(async (leadId) => {
    setMomenten(await base44.entities.LeadContactmoment.filter({ lead_id: leadId }, '-datum', 20));
  }, []);

  useEffect(() => {
    if (!open || !lead?.id) return;
    let actief = true;
    setLaadt(true);
    Promise.all([
      base44.entities.Lead.get(lead.id),
      base44.entities.LeadContactmoment.filter({ lead_id: lead.id }, '-datum', 20),
      base44.auth.me().catch(() => null),
    ])
      .then(([volledigeLead, lijst, gebruiker]) => {
        if (!actief) return;
        setVolledig(volledigeLead);
        setMomenten(lijst);
        setOpvolgdatum((volledigeLead.opvolgdatum || '').slice(0, 10));
        setEigenaar(volledigeLead.eigenaar || '');
        setHuidigeGebruiker(gebruiker?.full_name || '');
      })
      .catch((e) => {
        if (actief) toast({ title: 'Kon de lead niet laden', description: e.message, variant: 'destructive' });
      })
      .finally(() => { if (actief) setLaadt(false); });
    return () => { actief = false; };
  }, [open, lead?.id, toast]);

  const bewaarOpvolging = async () => {
    if (!volledig || bezig) return;
    setBezig(true);
    try {
      await base44.entities.Lead.update(volledig.id, {
        opvolgdatum: opvolgdatum || null,
        eigenaar: eigenaar.trim(),
      });
      toast({ title: 'Opvolging opgeslagen' });
    } catch (e) {
      toast({ title: 'Opslaan mislukt', description: e.message, variant: 'destructive' });
    } finally {
      setBezig(false);
    }
  };

  if (!lead) return null;

  const website = volledig?.bedrijf_website || '';
  const websiteHref = website ? (website.startsWith('http') ? website : `https://${website}`) : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{lead.name || 'Onbekend'}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{lead.smartsuite_id}</p>
        </DialogHeader>

        {laadt || !volledig ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Contactgegevens */}
            <div className="space-y-0 mt-2">
              <Row icon={Mail} label="Email" value={volledig.email || '—'} />
              <Row icon={Phone} label="Telefoon" value={volledig.phone_e164 || volledig.phone || '—'} />
              <Row icon={Building2} label="Bedrijf" value={volledig.company || '—'} />
              <Row
                icon={MapPin}
                label="Plaats"
                value={volledig.city ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(volledig.city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {volledig.city}
                  </a>
                ) : '—'}
              />
              <Row icon={Calendar} label="Lead datum" value={fmtDate(volledig.lead_date)} />
              {volledig.zoho_contact_url && (
                <Row
                  icon={ExternalLink}
                  label="Zoho CRM"
                  value={
                    <a
                      href={volledig.zoho_contact_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Contactpersoon openen in Zoho
                    </a>
                  }
                />
              )}
            </div>

            {/* Opvolging — bewerkbaar */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Opvolging</p>
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Opvolgdatum</Label>
                    <Input
                      type="date"
                      value={opvolgdatum}
                      onChange={(e) => setOpvolgdatum(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Eigenaar</Label>
                    <Input
                      value={eigenaar}
                      onChange={(e) => setEigenaar(e.target.value)}
                      placeholder="Wie pakt de lead op"
                    />
                  </div>
                </div>
                <Button size="sm" onClick={bewaarOpvolging} disabled={bezig}>
                  {bezig ? 'Opslaan…' : 'Opslaan'}
                </Button>
              </div>
            </div>

            {/* Verrijking */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verrijking</p>
                <ScoreBadge score={volledig.score} score_label={volledig.score_label} />
              </div>
              <div className="space-y-0">
                <Row icon={Sparkles} label="Waarom deze score" value={volledig.score_reden || '—'} />
                <Row
                  icon={ExternalLink}
                  label="Website"
                  value={websiteHref ? (
                    <a href={websiteHref} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline break-all">
                      {website}
                    </a>
                  ) : '—'}
                />
                <Row icon={Building2} label="Sector" value={volledig.bedrijf_sector || '—'} />
                <Row icon={MapPin} label="Bedrijfplaats" value={volledig.bedrijf_plaats || '—'} />
              </div>
            </div>

            {/* Contactmomenten */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contactmomenten</p>
              <div className="space-y-3">
                <ContactmomentLijst momenten={momenten} />
                <ContactmomentForm
                  leadId={volledig.id}
                  wie={huidigeGebruiker}
                  onToegevoegd={() => laadContactmomenten(volledig.id)}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}