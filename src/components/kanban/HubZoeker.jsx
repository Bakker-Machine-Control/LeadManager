import React, { useState } from 'react';
import { zoekHubKlant } from '@/functions/zoekHubKlant';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Loader2, Search, User } from 'lucide-react';

// Zoekt het bedrijf of de contactpersoon van deze lead in de BMC HUB (CRM).
// Kies je een resultaat, dan worden de ontbrekende leadgegevens (plaats,
// adres, e-mail, etc.) van dat record overgenomen — bestaande waarden
// blijven ongemoeid.

const VELDLABELS = {
  company: 'bedrijf',
  city: 'plaats',
  email: 'e-mail',
  phone: 'telefoon',
  bedrijf_plaats: 'bedrijfplaats',
  bedrijf_adres: 'adres',
  bedrijf_postcode: 'postcode',
  bedrijf_website: 'website',
};

export default function HubZoeker({ lead, onBijgewerkt }) {
  const [q, setQ] = useState(lead?.company || '');
  const [laden, setLaden] = useState(false);
  const [gezocht, setGezocht] = useState(false);
  const [bedrijven, setBedrijven] = useState([]);
  const [contacten, setContacten] = useState([]);
  const [fout, setFout] = useState('');
  const [toegevoegd, setToegevoegd] = useState('');

  async function zoek(e) {
    e.preventDefault();
    const term = q.trim();
    if (!term || laden) return;
    setLaden(true);
    setFout('');
    setGezocht(false);
    setToegevoegd('');
    try {
      const res = await zoekHubKlant({ q: term });
      const d = res?.data || {};
      if (d.error) {
        setFout(d.error);
        setBedrijven([]);
        setContacten([]);
      } else {
        setBedrijven(d.bedrijven || []);
        setContacten(d.contacten || []);
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

  async function pasToe(velden, weergave) {
    setLaden(true);
    setFout('');
    try {
      // Alleen velden overnemen die op de lead nog leeg zijn
      const updates = {};
      for (const [veld, waarde] of Object.entries(velden)) {
        if (waarde && !lead[veld]) updates[veld] = waarde;
      }
      if (Object.keys(updates).length === 0) {
        setToegevoegd(`${weergave}: geen nieuwe gegevens toe te voegen — alles staat al op de lead.`);
        return;
      }
      await base44.entities.Lead.update(lead.id, updates);
      const vers = await base44.entities.Lead.get(lead.id);
      onBijgewerkt(vers);
      setToegevoegd(
        `${weergave}: ${Object.keys(updates).map((v) => VELDLABELS[v] || v).join(', ')} toegevoegd.`
      );
    } catch (err) {
      setFout(err?.message || 'Toevoegen mislukt');
    } finally {
      setLaden(false);
    }
  }

  const pasBedrijfToe = (b) => pasToe({
    company: b.naam,
    bedrijf_plaats: b.plaats,
    bedrijf_adres: b.adres,
    bedrijf_postcode: b.postcode,
    bedrijf_website: b.website,
    email: b.email,
    phone: b.telefoon,
  }, b.naam);

  const pasContactToe = (c) => pasToe({
    email: c.email,
    phone: c.telefoon,
    company: c.bedrijf,
  }, c.naam || [c.voornaam, c.achternaam].filter(Boolean).join(' '));

  const leeg = gezocht && bedrijven.length === 0 && contacten.length === 0;

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <form onSubmit={zoek} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op bedrijfsnaam, contactnaam, e-mail of telefoon"
          className="flex-1"
        />
        <Button type="submit" variant="outline" size="sm" disabled={laden || !q.trim()} className="gap-1.5 whitespace-nowrap">
          {laden ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {laden ? 'Zoeken…' : 'Zoeken'}
        </Button>
      </form>

      {fout && <p className="text-xs text-destructive">{fout}</p>}
      {toegevoegd && <p className="text-xs text-green-600">{toegevoegd}</p>}
      {leeg && (
        <p className="text-xs text-muted-foreground">
          Geen bedrijf of contact gevonden in de HUB.
        </p>
      )}

      {bedrijven.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Bedrijven
          </p>
          <div className="space-y-1.5">
            {bedrijven.map((b) => (
              <div key={b.id || b.naam} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.naam || '(zonder naam)'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[b.plaats, b.email || b.website, b.telefoon].filter(Boolean).join(' · ') || 'geen extra gegevens'}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => pasBedrijfToe(b)} disabled={laden}>
                  Toevoegen
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {contacten.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-muted-foreground" /> Contacten
          </p>
          <div className="space-y-1.5">
            {contacten.map((c) => {
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
                  <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => pasContactToe(c)} disabled={laden}>
                    Toevoegen
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}