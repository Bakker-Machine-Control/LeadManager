import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2 } from 'lucide-react';

// Handmatig een lead toevoegen — bijv. iemand die belt, in persoon langskomt of op een beurs
const BRON_OPTIES = [
  { value: 'telefoon', label: 'Telefoon' },
  { value: 'persoonlijk', label: 'In persoon' },
  { value: 'beurs', label: 'Beurs' },
  { value: 'aanbeveling', label: 'Aanbeveling' },
  { value: 'website', label: 'Website' },
  { value: 'overig', label: 'Overig' },
];

const LEGE_FORM = {
  voornaam: '',
  achternaam: '',
  bedrijf: '',
  email: '',
  telefoon: '',
  plaats: '',
  bron: 'telefoon',
  notitie: '',
};

export default function Direct() {
  const { toast } = useToast();
  const [form, setForm] = useState(LEGE_FORM);
  const [saving, setSaving] = useState(false);

  const setVeld = (veld) => (e) => setForm((f) => ({ ...f, [veld]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.voornaam && !form.achternaam && !form.bedrijf) {
      toast({ title: 'Vul minimaal een naam of bedrijf in', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Lead.create({
        smartsuite_id: `handmatig-${Date.now()}`,
        first_name: form.voornaam,
        last_name: form.achternaam,
        name: [form.voornaam, form.achternaam].filter(Boolean).join(' ') || form.bedrijf,
        email: form.email,
        phone: form.telefoon,
        phone_e164: form.telefoon,
        company: form.bedrijf,
        city: form.plaats,
        bron: form.bron,
        status: 'Nieuw',
        lead_date: new Date().toISOString(),
        aangeleverde_tekst: form.notitie,
      });
      toast({
        title: 'Lead toegevoegd',
        description: `${[form.voornaam, form.achternaam].filter(Boolean).join(' ') || form.bedrijf} staat in het bord bij Nieuw.`,
      });
      setForm(LEGE_FORM);
    } catch (err) {
      toast({ title: 'Lead opslaan mislukt', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <UserPlus className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Direct een lead toevoegen</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Voor leads die buiten de digitale kanalen binnenkomen: telefonisch, in persoon of op een beurs.
        De lead verschijnt direct in het Kanban-bord bij Nieuw.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Nieuwe lead</CardTitle>
          <CardDescription>Alleen naam of bedrijf is verplicht; de rest mag leeg blijven.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="voornaam">Voornaam</Label>
                <Input id="voornaam" value={form.voornaam} onChange={setVeld('voornaam')} placeholder="Jan" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="achternaam">Achternaam</Label>
                <Input id="achternaam" value={form.achternaam} onChange={setVeld('achternaam')} placeholder="de Vries" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bedrijf">Bedrijf</Label>
                <Input id="bedrijf" value={form.bedrijf} onChange={setVeld('bedrijf')} placeholder="BV Graven" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plaats">Plaats</Label>
                <Input id="plaats" value={form.plaats} onChange={setVeld('plaats')} placeholder="Vleuten" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={form.email} onChange={setVeld('email')} placeholder="jan@bedrijf.nl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefoon">Telefoon</Label>
                <Input id="telefoon" value={form.telefoon} onChange={setVeld('telefoon')} placeholder="+31612345678" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Herkomst</Label>
              <Select value={form.bron} onValueChange={(v) => setForm((f) => ({ ...f, bron: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies de herkomst" />
                </SelectTrigger>
                <SelectContent>
                  {BRON_OPTIES.map((optie) => (
                    <SelectItem key={optie.value} value={optie.value}>{optie.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notitie">Notitie</Label>
              <Textarea
                id="notitie"
                value={form.notitie}
                onChange={setVeld('notitie')}
                placeholder="Waar ging het gesprek over? Wat is de volgende stap?"
                rows={3}
              />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Lead opslaan…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> Lead toevoegen
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}