import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ChevronDown, ChevronRight, ShoppingCart } from 'lucide-react';
import { vlag, fmtDatum } from '@/lib/websiteUtils';

// Configuraties uit de webshop (GPS-meetstok): elke gestarte configuratie, ook als er geen
// aanvraag van kwam. Zonder cookietoestemming is er geen koppeling met een Bezoeker.

const STATUS_STIJL = {
  bezig: 'bg-muted text-muted-foreground',
  aangevraagd: 'bg-emerald-100 text-emerald-800',
};

const euro = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
    : '—';

export default function ConfiguratiesTab({ van, tot, onOpenDetail, ververstOp }) {
  const [rijen, setRijen] = useState(null);
  const [statusFilter, setStatusFilter] = useState('alle');
  const [omgevingFilter, setOmgevingFilter] = useState('productie');
  const [zoek, setZoek] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    base44.entities.Configuratie.list('-gestart_op', 500)
      .then(setRijen)
      .catch(() => setRijen([]));
  }, [ververstOp]);

  const vanMs = new Date(van).getTime();
  const totMs = new Date(tot).getTime();

  const gefilterd = (rijen || []).filter((c) => {
    const t = new Date(c.gestart_op || 0).getTime();
    if (t < vanMs || t > totMs) return false;
    if (statusFilter !== 'alle' && (c.status || 'bezig') !== statusFilter) return false;
    if (omgevingFilter !== 'alle' && (c.omgeving || 'productie') !== omgevingFilter) return false;
    if (zoek) {
      const hooiberg = [c.plaats, c.provincie, c.land, c.keuzes_tekst, c.order_ref].join(' ').toLowerCase();
      if (!hooiberg.includes(zoek.toLowerCase())) return false;
    }
    return true;
  });

  const aangevraagd = gefilterd.filter((c) => c.status === 'aangevraagd').length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Zoek op plaats, keuze of ordernummer" value={zoek}
              onChange={(e) => setZoek(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle configuraties</SelectItem>
              <SelectItem value="bezig">Niet aangevraagd</SelectItem>
              <SelectItem value="aangevraagd">Aangevraagd</SelectItem>
            </SelectContent>
          </Select>
          <Select value={omgevingFilter} onValueChange={setOmgevingFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="productie">Webshop (productie)</SelectItem>
              <SelectItem value="staging">Staging (test)</SelectItem>
              <SelectItem value="alle">Productie én staging</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {gefilterd.length} configuraties in deze periode, waarvan {aangevraagd} aangevraagd.
      </p>

      <Card>
        <CardContent className="p-0">
          {rijen === null ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : gefilterd.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              Geen configuraties gevonden die aan de filters voldoen.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {gefilterd.map((c) => {
                const isOpen = open === c.id;
                const status = c.status || 'bezig';
                return (
                  <div key={c.id}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : c.id)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                      <span className="text-lg leading-none shrink-0">{vlag(c.landcode)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {[c.plaats, c.provincie].filter(Boolean).join(', ') || 'Locatie onbekend'}
                          <span className="text-muted-foreground font-normal"> · {c.apparaat || 'onbekend'}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          Stap {c.laatste_stap || 1}{c.stappen_totaal ? ` van ${c.stappen_totaal}` : ''}
                          {c.laatste_stap_titel ? ` — ${c.laatste_stap_titel}` : ''}
                          {c.keuzes_tekst ? ` · ${c.keuzes_tekst}` : ''}
                        </p>
                      </div>
                      <div className="hidden md:block text-right w-36 shrink-0">
                        <p className="text-xs text-muted-foreground">{fmtDatum(c.gestart_op)}</p>
                        <p className="text-xs font-medium">{euro(c.totaal_excl_btw)} <span className="text-muted-foreground font-normal">excl.</span></p>
                      </div>
                      <Badge className={`${STATUS_STIJL[status]} border-transparent shrink-0`}>
                        {status === 'aangevraagd' ? (c.order_ref || 'aangevraagd') : 'niet aangevraagd'}
                      </Badge>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pl-12 grid gap-4 md:grid-cols-2 text-sm">
                        <div className="space-y-1">
                          <p><span className="text-muted-foreground">Gestart:</span> {fmtDatum(c.gestart_op)}</p>
                          <p><span className="text-muted-foreground">Laatst actief:</span> {fmtDatum(c.laatst_actief)}</p>
                          <p><span className="text-muted-foreground">Locatie:</span> {[c.plaats, c.provincie, c.land].filter(Boolean).join(', ') || '—'}</p>
                          <p><span className="text-muted-foreground">IP (ingekort):</span> {c.ip_adres || '—'}</p>
                          <p><span className="text-muted-foreground">Apparaat:</span> {[c.apparaat, c.browser, c.besturingssysteem].filter(Boolean).join(' · ') || '—'}</p>
                          <p><span className="text-muted-foreground">Herkomst:</span> {c.utm_source || c.bron || c.referrer || 'direct'}</p>
                          <p><span className="text-muted-foreground">Totaal:</span> {euro(c.totaal_excl_btw)} excl. btw · {euro(c.totaal_incl_btw)} incl. btw</p>
                          {c.toestemming && c.bezoeker_id ? (
                            <button type="button" className="text-primary underline underline-offset-4"
                              onClick={() => onOpenDetail?.({ bezoeker_id: c.bezoeker_id })}>
                              Bezoekersprofiel openen
                            </button>
                          ) : (
                            <p className="text-xs text-muted-foreground">Geen cookietoestemming: niet te koppelen aan eerdere bezoeken.</p>
                          )}
                        </div>
                        <div>
                          <p className="flex items-center gap-2 font-medium"><ShoppingCart className="w-4 h-4" /> Keuzes</p>
                          {(c.keuzes || []).length ? (
                            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                              {c.keuzes.map((k, i) => <li key={`${k.sku}-${i}`}>{k.naam || k.sku} <span className="text-xs">({k.sku})</span></li>)}
                            </ul>
                          ) : <p className="mt-1 text-muted-foreground">Nog niets gekozen.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
