import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Search, ChevronRight, Facebook, Instagram, Linkedin, Mail, MousePointerClick, Globe,
} from 'lucide-react';
import { vlag, fmtDatum, verkortId } from '@/lib/websiteUtils';

const BRON_ICONEN = {
  google: Search,
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  email: Mail,
  direct: MousePointerClick,
  overig: Globe,
};

const STATUS_STIJL = {
  anoniem: 'bg-muted text-muted-foreground',
  bekend: 'bg-blue-100 text-blue-800',
  lead: 'bg-amber-100 text-amber-800',
  klant: 'bg-emerald-100 text-emerald-800',
};

const STATUSEN = ['anoniem', 'bekend', 'lead', 'klant'];
const BRONNEN = ['google', 'facebook', 'instagram', 'linkedin', 'direct', 'email', 'overig'];

export default function BezoekersTab({ van, tot, onOpenDetail, ververstOp }) {
  const [bezoekers, setBezoekers] = useState(null);
  const [landFilter, setLandFilter] = useState('alle');
  const [bronFilter, setBronFilter] = useState('alle');
  const [typeFilter, setTypeFilter] = useState('alle');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [zoek, setZoek] = useState('');

  useEffect(() => {
    base44.entities.Bezoeker.list('-laatste_bezoek', 500)
      .then(setBezoekers)
      .catch(() => setBezoekers([]));
  }, [ververstOp]);

  const vanMs = new Date(van).getTime();
  const totMs = new Date(tot).getTime();

  const gefilterd = (bezoekers || []).filter((b) => {
    const tijdstip = new Date(b.laatste_bezoek || b.eerste_bezoek || 0).getTime();
    if (tijdstip < vanMs || tijdstip > totMs) return false;
    if (landFilter !== 'alle' && (b.land || '') !== landFilter) return false;
    if (bronFilter !== 'alle' && (b.eerste_bron || 'direct') !== bronFilter) return false;
    if (typeFilter !== 'alle') {
      const nieuw = new Date(b.eerste_bezoek || 0).getTime() >= vanMs;
      if (typeFilter === 'nieuw' && !nieuw) return false;
      if (typeFilter === 'terugkerend' && nieuw) return false;
    }
    if (statusFilter !== 'alle' && (b.status || 'anoniem') !== statusFilter) return false;
    if (zoek) {
      const hooiberg = [b.naam, b.bedrijf, b.plaats].join(' ').toLowerCase();
      if (!hooiberg.includes(zoek.toLowerCase())) return false;
    }
    return true;
  });

  const landen = [...new Set((bezoekers || []).map((b) => b.land).filter(Boolean))].sort();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam, bedrijf of plaats"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={landFilter} onValueChange={setLandFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle landen</SelectItem>
              {landen.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bronFilter} onValueChange={setBronFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle bronnen</SelectItem>
              {BRONNEN.map((b) => (
                <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Nieuw én terugkerend</SelectItem>
              <SelectItem value="nieuw">Alleen nieuw</SelectItem>
              <SelectItem value="terugkerend">Alleen terugkerend</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle statussen</SelectItem>
              {STATUSEN.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lijst */}
      <Card>
        <CardContent className="p-0">
          {bezoekers === null ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : gefilterd.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              Geen bezoekers gevonden die aan de filters voldoen.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {gefilterd.map((b) => {
                const BronIcoon = BRON_ICONEN[b.eerste_bron || 'direct'] || Globe;
                const status = b.status || 'anoniem';
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpenDetail(b)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-lg leading-none shrink-0">{vlag(b.landcode)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {b.naam || b.bedrijf || verkortId(b.bezoeker_id)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[b.plaats, b.provincie, b.land].filter(Boolean).join(' · ') || 'Locatie onbekend'}
                      </p>
                    </div>
                    <div className="hidden md:block text-right w-32 shrink-0">
                      <p className="text-xs text-muted-foreground">{fmtDatum(b.laatste_bezoek)}</p>
                      <p className="text-xs text-muted-foreground">{b.aantal_bezoeken || 0} bezoeken</p>
                    </div>
                    <BronIcoon className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
                    <Badge className={`${STATUS_STIJL[status]} border-transparent shrink-0`}>{status}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}