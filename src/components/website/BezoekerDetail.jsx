import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import LeadDetailModal from '@/components/LeadDetailModal';
import { Save, ExternalLink, UserPlus } from 'lucide-react';
import { vlag, fmtDatum, fmtDuur, verkortId } from '@/lib/websiteUtils';

const STATUS_STIJL = {
  anoniem: 'bg-muted text-muted-foreground',
  bekend: 'bg-blue-100 text-blue-800',
  lead: 'bg-amber-100 text-amber-800',
  klant: 'bg-emerald-100 text-emerald-800',
};

const ProfielRij = ({ label, waarde }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
    <p className="text-xs text-muted-foreground shrink-0">{label}</p>
    <p className="text-sm font-medium text-right break-all">{waarde || '—'}</p>
  </div>
);

export default function BezoekerDetail({ bezoeker, open, onClose }) {
  const { toast } = useToast();
  const [bezoeken, setBezoeken] = useState(null);
  const [weergaven, setWeergaven] = useState([]);
  const [lead, setLead] = useState(null);
  const [heeftLead, setHeeftLead] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadMaken, setLeadMaken] = useState(false);
  const [notities, setNotities] = useState('');
  const [notitiesOpslaan, setNotitiesOpslaan] = useState(false);

  useEffect(() => {
    if (!bezoeker?.id) return;
    setBezoeken(null);
    setWeergaven([]);
    setLead(null);
    setHeeftLead(!!bezoeker.lead_id);
    setNotities(bezoeker.notities || '');
    base44.entities.Bezoek.filter({ bezoeker_id: bezoeker.bezoeker_id }, '-gestart_op', 50)
      .then(setBezoeken)
      .catch(() => setBezoeken([]));
    base44.entities.Paginaweergave.filter({ bezoeker_id: bezoeker.bezoeker_id }, 'gestart_op', 500)
      .then(setWeergaven)
      .catch(() => setWeergaven([]));
    if (bezoeker.lead_id) {
      base44.entities.Lead.get(bezoeker.lead_id).then(setLead).catch(() => setLead(null));
    }
  }, [bezoeker?.id]);

  if (!bezoeker) return null;

  const status = bezoeker.status || 'anoniem';
  const gemiddeldeDuur = bezoeker.aantal_bezoeken
    ? (bezoeker.totale_duur || 0) / bezoeker.aantal_bezoeken
    : null;

  const weergavenPerBezoek = {};
  for (const w of weergaven) {
    (weergavenPerBezoek[w.bezoek_id] = weergavenPerBezoek[w.bezoek_id] || []).push(w);
  }
  for (const lijst of Object.values(weergavenPerBezoek)) {
    lijst.sort((a, b) => (a.volgorde || 0) - (b.volgorde || 0));
  }

  const maakLead = async () => {
    setLeadMaken(true);
    try {
      const naam = bezoeker.naam || '';
      const delen = naam.split(/\s+/).filter(Boolean);
      const nieuweLead = await base44.entities.Lead.create({
        name: naam || bezoeker.bedrijf || '',
        first_name: delen[0] || '',
        last_name: delen.length > 1 ? delen.slice(1).join(' ') : '',
        email: bezoeker.email || '',
        phone: bezoeker.telefoon || '',
        company: bezoeker.bedrijf || '',
        city: bezoeker.plaats || '',
        bron: 'website',
        status: 'Nieuw',
        lead_date: new Date().toISOString(),
        verrijking_status: 'niet_verrijkt',
      });
      await base44.entities.Bezoeker.update(bezoeker.id, { lead_id: nieuweLead.id, status: 'lead' });
      setLead(nieuweLead);
      setHeeftLead(true);
      toast({
        title: 'Lead aangemaakt',
        description: 'De bezoeker is als lead opgeslagen en aan het profiel gekoppeld.',
      });
    } catch (e) {
      toast({ title: 'Lead aanmaken mislukt', description: e.message, variant: 'destructive' });
    }
    setLeadMaken(false);
  };

  const slaNotitiesOp = async () => {
    setNotitiesOpslaan(true);
    try {
      await base44.entities.Bezoeker.update(bezoeker.id, { notities });
      toast({ title: 'Notities opgeslagen' });
    } catch (e) {
      toast({ title: 'Opslaan mislukt', description: e.message, variant: 'destructive' });
    }
    setNotitiesOpslaan(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="text-xl leading-none">{vlag(bezoeker.landcode)}</span>
              <span className="truncate">
                {bezoeker.naam || bezoeker.bedrijf || verkortId(bezoeker.bezoeker_id)}
              </span>
              <Badge className={`${STATUS_STIJL[status]} border-transparent`}>{status}</Badge>
            </DialogTitle>
            {heeftLead ? (
              <Button size="sm" onClick={() => setLeadOpen(true)} className="gap-2 self-start">
                <ExternalLink className="w-4 h-4" /> Naar lead
              </Button>
            ) : (
              <Button size="sm" onClick={maakLead} disabled={leadMaken} className="gap-2 self-start">
                <UserPlus className="w-4 h-4" /> {leadMaken ? 'Aanmaken…' : 'Lead aanmaken'}
              </Button>
            )}
          </DialogHeader>

          <Tabs defaultValue="profiel">
            <TabsList>
              <TabsTrigger value="profiel">Profiel</TabsTrigger>
              <TabsTrigger value="bezoeken">Bezoeken</TabsTrigger>
              <TabsTrigger value="notities">Notities</TabsTrigger>
            </TabsList>

            {/* Profiel */}
            <TabsContent value="profiel" className="space-y-4 mt-2">
              <div className="rounded-lg border border-border px-3">
                <ProfielRij label="Naam" waarde={bezoeker.naam} />
                <ProfielRij label="Bedrijf" waarde={bezoeker.bedrijf} />
                <ProfielRij label="E-mail" waarde={bezoeker.email} />
                <ProfielRij label="Telefoon" waarde={bezoeker.telefoon} />
                <ProfielRij label="Plaats" waarde={bezoeker.plaats} />
                <ProfielRij label="Provincie" waarde={bezoeker.provincie} />
                <ProfielRij label="Land" waarde={bezoeker.land} />
              </div>
              <div className="rounded-lg border border-border px-3">
                <ProfielRij label="Browser" waarde={bezoeker.browser} />
                <ProfielRij label="Besturingssysteem" waarde={bezoeker.besturingssysteem} />
                <ProfielRij label="Apparaat" waarde={bezoeker.apparaat} />
                <ProfielRij label="Taal" waarde={bezoeker.taal} />
                <ProfielRij label="IP-adres (ingekort)" waarde={bezoeker.ip_adres} />
              </div>
              <div className="rounded-lg border border-border px-3">
                <ProfielRij label="Eerste bezoek" waarde={fmtDatum(bezoeker.eerste_bezoek)} />
                <ProfielRij label="Laatste bezoek" waarde={fmtDatum(bezoeker.laatste_bezoek)} />
                <ProfielRij label="Aantal bezoeken" waarde={String(bezoeker.aantal_bezoeken || 0)} />
                <ProfielRij label="Aantal pagina's" waarde={String(bezoeker.aantal_paginas_totaal || 0)} />
                <ProfielRij label="Totale bezoekduur" waarde={fmtDuur(bezoeker.totale_duur)} />
                <ProfielRij label="Gem. bezoekduur" waarde={fmtDuur(gemiddeldeDuur)} />
              </div>
            </TabsContent>

            {/* Bezoeken */}
            <TabsContent value="bezoeken" className="mt-2">
              {bezoeken === null ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : bezoeken.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">Nog geen bezoeken geregistreerd.</p>
              ) : (
                bezoeken.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border mb-3 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2">
                      <p className="text-sm font-medium">{fmtDatum(b.gestart_op)}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="capitalize">{b.bron || 'direct'}</Badge>
                        <span>{b.aantal_paginas || 0} pagina's</span>
                        <span>{fmtDuur(b.duur)}</span>
                      </div>
                    </div>
                    {(weergavenPerBezoek[b.bezoek_id] || []).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        Geen paginaweergaven geregistreerd.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {(weergavenPerBezoek[b.bezoek_id] || []).map((w) => (
                          <div key={w.id || w.weergave_id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm truncate">{w.titel || w.pad || w.url}</p>
                              <p className="text-xs text-muted-foreground truncate">{w.pad || w.url}</p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDuur(w.duur)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            {/* Notities */}
            <TabsContent value="notities" className="mt-2 space-y-3">
              <Textarea
                placeholder="Notities over deze bezoeker…"
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
                rows={6}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={slaNotitiesOp} disabled={notitiesOpslaan} className="gap-2">
                  <Save className="w-4 h-4" /> {notitiesOpslaan ? 'Opslaan…' : 'Notities opslaan'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {lead && (
        <LeadDetailModal record={lead} open={leadOpen} onClose={() => setLeadOpen(false)} />
      )}
    </>
  );
}