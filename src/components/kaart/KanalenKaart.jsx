import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { vlag } from '@/lib/websiteUtils';
import usePlaatsCoords from '@/hooks/usePlaatsCoords';

const MAX_GROEPEN = 500;
const norm = (s) => String(s || '').trim().toLowerCase();

// Kanaalcategorieën met vaste kleur en volgorde op de kaart
const KANALEN = [
  { key: 'smartsuite', label: 'SmartSuite', kleur: 'hsl(234,62%,52%)' },
  { key: 'meta', label: 'Meta', kleur: 'hsl(280,55%,60%)' },
  { key: 'direct', label: 'Direct', kleur: 'hsl(168,56%,44%)' },
  { key: 'website', label: 'Website', kleur: 'hsl(43,74%,52%)' },
  { key: 'overig', label: 'Overig', kleur: 'hsl(220,8%,55%)' },
];

const kanaalVanBron = (bron) =>
  bron === 'smartsuite' ? 'smartsuite'
  : bron === 'meta' ? 'meta'
  : ['telefoon', 'persoonlijk', 'beurs'].includes(bron) ? 'direct'
  : bron === 'website' ? 'website'
  : 'overig';

// Punt-icoon met het aantal; meerdere kanalen in dezelfde plaats komen naast
// elkaar te staan via een kleine horizontale verschuiving.
const puntIcoon = (kleur, n, offset) => L.divIcon({
  className: '',
  html: `<div style="margin-left:${offset * 22}px;min-width:20px;height:20px;padding:0 5px;border-radius:9999px;background:${kleur};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);color:#fff;font-size:11px;font-weight:600;line-height:16px;text-align:center;white-space:nowrap">${n > 99 ? '99+' : n}</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Zoom automatisch in op de punten zodra de locaties bekend zijn
function PasViewAan({ punten }) {
  const map = useMap();
  useEffect(() => {
    if (punten.length === 0) return;
    map.fitBounds(L.latLngBounds(punten.map((p) => [p.lat, p.lon])).pad(0.15));
  }, [map, punten]);
  return null;
}

export default function KanalenKaart({ leads, bezoekers, laden }) {
  // Unieke lead-plaatsen die geocodeerd moeten worden
  const plaatsen = useMemo(() => {
    const map = new Map();
    for (const r of leads || []) {
      const plaats = (r.city || r.bedrijf_plaats || '').trim();
      const landcode = (r.phone_country || '').trim().toLowerCase();
      if (!plaats || !/^[a-z]{2}$/.test(landcode)) continue;
      const sleutel = `${norm(plaats)}||${landcode}`;
      if (!map.has(sleutel)) map.set(sleutel, { sleutel, plaats, landcode });
    }
    return [...map.values()];
  }, [leads]);

  const { coords, bezig, mislukt } = usePlaatsCoords(plaatsen);

  // Alles per plaats groeperen; websitebezoekers zijn zelf al gelokaliseerd
  const groepen = useMemo(() => {
    const perSleutel = new Map();
    const pak = (sleutel, plaats, landcode, lat, lon) => {
      if (!perSleutel.has(sleutel)) perSleutel.set(sleutel, { plaats, landcode, lat, lon, kanalen: {} });
      return perSleutel.get(sleutel);
    };
    for (const r of leads || []) {
      const plaats = (r.city || r.bedrijf_plaats || '').trim();
      const landcode = (r.phone_country || '').trim().toLowerCase();
      if (!plaats || !/^[a-z]{2}$/.test(landcode)) continue;
      const c = coords[`${norm(plaats)}||${landcode}`];
      if (!c) continue;
      const g = pak(`${norm(plaats)}||${landcode}`, plaats, landcode, c.lat, c.lon);
      const k = kanaalVanBron(r.bron);
      (g.kanalen[k] ||= { leads: [], bezoekers: 0 }).leads.push(r);
    }
    for (const b of bezoekers || []) {
      if (b.lat == null || b.lon == null) continue;
      const plaats = (b.plaats || '').trim() || 'Onbekende plaats';
      const landcode = (b.landcode || '').trim().toLowerCase();
      const g = pak(`${norm(plaats)}||${landcode}`, plaats, landcode, b.lat, b.lon);
      (g.kanalen.website ||= { leads: [], bezoekers: 0 }).bezoekers++;
    }
    return [...perSleutel.values()]
      .map((g) => ({
        ...g,
        totaal: Object.values(g.kanalen).reduce((s, k) => s + k.leads.length + k.bezoekers, 0),
      }))
      .sort((a, b) => b.totaal - a.totaal);
  }, [leads, bezoekers, coords]);

  const getoond = groepen.slice(0, MAX_GROEPEN);
  const totaalPerKanaal = useMemo(() => {
    const t = { smartsuite: 0, meta: 0, direct: 0, website: 0, overig: 0 };
    for (const g of groepen) {
      for (const [k, v] of Object.entries(g.kanalen)) t[k] += v.leads.length + v.bezoekers;
    }
    return t;
  }, [groepen]);
  const totaal = groepen.reduce((s, g) => s + g.totaal, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <MapPin className="w-5 h-5 text-primary" /> Alles op de kaart ({totaal} op {groepen.length} plaatsen)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Leads en websitebezoekers per plaats in de gekozen periode, gekleurd per kanaal. Klik op een stip voor de details.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {KANALEN.map((k) => (
            <span key={k.key} className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: k.kleur }} />
              {k.label} ({totaalPerKanaal[k.key]})
            </span>
          ))}
        </div>
        {(laden || bezig) && (
          <p className="text-xs text-muted-foreground animate-pulse">
            {laden ? 'Gegevens laden…' : 'Locaties bepalen…'}
          </p>
        )}
        {mislukt && (
          <p className="text-xs text-destructive">Locaties konden niet volledig worden opgehaald — ververs de pagina.</p>
        )}
      </CardHeader>
      <CardContent>
        {groepen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {laden ? 'Gegevens laden…' : 'Niets gevonden in deze periode.'}
          </p>
        ) : (
          <div className="relative isolate overflow-hidden rounded-lg border" role="region" aria-label="Interactieve kaart met alle kanalen">
            <MapContainer center={[52.2, 5.3]} zoom={7} minZoom={2} maxZoom={18} scrollWheelZoom={false} style={{ height: 520, width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <PasViewAan punten={getoond} />
              {getoond.map((g) => KANALEN
                .filter((k) => g.kanalen[k.key])
                .map((k, i) => {
                  const d = g.kanalen[k.key];
                  return (
                    <Marker
                      key={`${g.plaats}|${g.landcode}|${k.key}`}
                      position={[g.lat, g.lon]}
                      icon={puntIcoon(k.kleur, d.leads.length + d.bezoekers, i)}
                    >
                      <Popup>
                        <div className="text-sm space-y-1 min-w-[220px]">
                          <p className="font-semibold">{vlag(g.landcode)} {g.plaats}</p>
                          {KANALEN.filter((kk) => g.kanalen[kk.key]).map((kk) => {
                            const dd = g.kanalen[kk.key];
                            const delen = [];
                            if (dd.leads.length) delen.push(`${dd.leads.length} lead${dd.leads.length === 1 ? '' : 's'}`);
                            if (dd.bezoekers) delen.push(`${dd.bezoekers} bezoeker${dd.bezoekers === 1 ? '' : 's'}`);
                            return (
                              <div key={kk.key} className="space-y-0.5">
                                <p className="font-medium" style={{ color: kk.kleur }}>
                                  {kk.label}: {delen.join(' + ')}
                                </p>
                                {dd.leads.slice(0, 5).map((r) => (
                                  <p key={r.id || r.smartsuite_id} className="text-muted-foreground">
                                    {r.name}{r.company ? ` (${r.company})` : ''}
                                  </p>
                                ))}
                                {dd.leads.length > 5 && (
                                  <p className="text-muted-foreground">en {dd.leads.length - 5} meer…</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </Popup>
                    </Marker>
                  );
                }))}
            </MapContainer>
          </div>
        )}
        {groepen.length > MAX_GROEPEN && (
          <p className="text-xs text-muted-foreground mt-2">Alleen de {MAX_GROEPEN} plaatsen met de meeste activiteit zijn op de kaart gezet.</p>
        )}
      </CardContent>
    </Card>
  );
}