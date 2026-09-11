import React, { useState } from 'react';
import { zoekHubKlant } from '@/functions/zoekHubKlant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Check, Loader2, Search, User } from 'lucide-react';

// Zoekt bestaande bedrijven en contacten in de BMC HUB-app, boven het
// handmatige lead-formulier op de pagina Direct. Kies je een resultaat,
// dan worden de bekende gegevens in het formulier gezet.

// Vindt de eerste gevulde waarde; veldnamen in de HUB-app kunnen per koppeling verschillen
function pak(record, sleutels) {
  for (const sleutel of sleutels) {
    const v = record?.[sleutel];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return '';
}

function mapBedrijf(r) {
  return {
    id: r?.id || r?._id || '',
    naam: pak(r, ['name', 'naam', 'bedrijfsnaam', 'Bedrijfsnaam', 'company', 'Company', 'account_name']),
    plaats: pak(r, ['plaats', 'city', 'City', 'vestigingsplaats', 'billing_city']),
    email: pak(r, ['email', 'Email']),
    telefoon: pak(r, ['telefoon', 'phone', 'Phone', 'telephone']),
    bedrijf: pak(r, ['name', 'naam', 'bedrijfsnaam', 'Bedrijfsnaam', 'company', 'Company']),
  };
}

function mapContact(r) {
  return {
    id: r?.id || r?._id || '',
    voornaam: pak(r, ['first_name', 'voornaam', 'First_Name']),
    achternaam: pak(r, ['last_name', 'achternaam', 'Last_Name']),
    naam: pak(r, ['full_name', 'naam', 'name', 'Volledige_naam']),
    email: pak(r, ['email', 'Email']),
    telefoon: pak(r, ['telefoon', 'phone', 'Phone', 'mobiel', 'mobile']),
    bedrijf: pak(r, ['bedrijf', 'company', 'company_name', 'Bedrijfsnaam']),
  };
}

const MAX_PER_LIJST = 8;

export default function KlantZoeker({ onKlantGekozen }) {
  const [q, setQ] = useState('');
  const [laden, setLaden] = useState(false);
  const [gezocht, setGezocht] = useState(false);
  const [bedrijven, setBedrijven] = useState([]);
  const [contacten, setContacten] = useState([]);
  const [fout, setFout] = useState('');
  const [toegepast, setToegepast] = useState('');

  async function zoek(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term || laden) return;
    setLaden(true);
    setFout('');
    setGezocht(false);
    setToegepast('');
    try {
      const res = await zoekHubKlant({ q: term });
      const d = res?.data || {};
      if (d.error) {
        setFout(d.error);
        setBedrijven([]);
        setContacten([]);
      } else {
        setBedrijven((d.bedrijven || []).map(mapBedrijf));
        setContacten((d.contacten || []).map(mapContact));
        setGezocht(true);
      }
    } catch (err) {
      setFout(err?.response?.data?.error || err?.data?.error || err?.message || 'Zoeken mislukt');
      setBedrijven([]);
      setContacten([]);
    } finally {
      setLaden(false);
    }
  }

  function kies(klant, weergave) {
    onKlantGekozen(klant);
    setToegepast(`${weergave} is toegepast op het formulier hieronder.`);
  }

  const leeg = gezocht && bedrijven.length === 0 && contacten.length === 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Al een bestaande klant?</CardTitle>
        <CardDescription>
          Zoek eerst op bedrijfsnaam, contactnaam, e-mail of telefoonnummer in de BMC HUB.
          Kies je een resultaat, dan vullen we de bekende gegevens hieronder alvast in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={zoek} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Bijv. 'BV Graven' of 'jan@bedrijf.nl'"
            className="flex-1"
          />
          <Button type="submit" disabled={laden || !q.trim()} className="gap-2 whitespace-nowrap">
            {laden ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {laden ? 'Zoeken…' : 'Zoeken'}
          </Button>
        </form>

        {fout && (
          <p className="text-sm text-destructive">{fout}</p>
        )}
        {toegepast && (
          <p className="text-sm text-green-600 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> {toegepast}
          </p>
        )}
        {leeg && (
          <p className="text-sm text-muted-foreground">
            Geen bestaande klant gevonden — vul de lead hieronder handmatig in.
          </p>
        )}

        {bedrijven.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-muted-foreground" /> Bedrijven ({bedrijven.length})
            </p>
            <div className="space-y-1.5">
              {bedrijven.slice(0, MAX_PER_LIJST).map((b) => (
                <div key={b.id || b.naam} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.naam || '(zonder naam)'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[b.plaats, b.email, b.telefoon].filter(Boolean).join(' · ') || 'geen extra gegevens'}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => kies(b, b.naam)}>
                    Gebruiken
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {contacten.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
              <User className="w-4 h-4 text-muted-foreground" /> Contacten ({contacten.length})
            </p>
            <div className="space-y-1.5">
              {contacten.slice(0, MAX_PER_LIJST).map((c) => {
                const naam = c.voornaam || c.achternaam
                  ? [c.voornaam, c.achternaam].filter(Boolean).join(' ')
                  : c.naam;
                return (
                  <div key={c.id || naam} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{naam || '(zonder naam)'}{c.bedrijf ? ` — ${c.bedrijf}` : ''}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.email, c.telefoon].filter(Boolean).join(' · ') || 'geen extra gegevens'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={() => kies({ voornaam: c.voornaam, achternaam: c.achternaam, naam: c.naam, email: c.email, telefoon: c.telefoon, bedrijf: c.bedrijf }, naam || c.bedrijf)}
                    >
                      Gebruiken
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}