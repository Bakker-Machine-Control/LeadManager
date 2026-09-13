import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { vlag } from '@/lib/websiteUtils';
import usePlaatsCoords from '@/hooks/usePlaatsCoords';

const MAX_MARKERS = 500;

const plaatsSleutel = (plaats, landcode) => `${plaats.trim().toLowerCase()}||${landcode}`;

// Punt-icoon met het aantal leads op die plaats
const puntIcoon = (n) => L.divIcon({
  className: '',
  html: `<div style="min-width:20px;height:20px;padding:0 5px;border-radius:9999px;background:hsl(234,62%,52%);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);color:#fff;font-size:11px;font-weight:600;line-height:16px;text-align:center;white-space:nowrap">${n > 99 ? '99+' : n}</div>`,
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

export default function LeadKaart({ records, onOpenLead }) {
  // Unieke plaatsen in de getoonde leads
  const plaatsen = useMemo(() => {
    const map = new Map();
    for (const r of records || []) {
      const plaats = (r.city || r.bedrijf_plaats || '').trim();
      const landcode = (r.phone_country || '').trim().toLowerCase();
      if (!plaats || !/^[a-z]{2}$/.test(landcode)) continue;
      const sleutel = plaatsSleutel(plaats, landcode);
      if (!map.has(sleutel)) map.set(sleutel, { sleutel, plaats, landcode });
    }
    return [...map.values()];
  }, [records]);

  // Coördinaten via de gedeelde hook ophalen (met cache, in rondes)
  const { coords, bezig, mislukt } = usePlaatsCoords(plaatsen);

  // Leads per plaats groeperen op de gevonden coördinaten
  const punten = useMemo(() => {
    const perSleutel = new Map();
    for (const r of records || []) {
      const plaats = (r.city || r.bedrijf_plaats || '').trim();
      const landcode = (r.phone_country || '').trim().toLowerCase();
      if (!plaats || !/^[a-z]{2}$/.test(landcode)) continue;
      const sleutel = plaatsSleutel(plaats, landcode);
      const c = coords[sleutel];
      if (!c) continue;
      if (!perSleutel.has(sleutel)) perSleutel.set(sleutel, { plaats, landcode, lat: c.lat, lon: c.lon, leads: [] });
      perSleutel.get(sleutel).leads.push(r);
    }
    return [...perSleutel.values()].sort((a, b) => b.leads.length - a.leads.length);
  }, [records, coords]);

  const zonderLocatie = plaatsen.filter((p) => !(p.sleutel in coords)).length;
  const getoond = punten.slice(0, MAX_MARKERS);
  const totaalLeads = punten.reduce((s, p) => s + p.leads.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <MapPin className="w-5 h-5 text-primary" /> Leads op de kaart ({totaalLeads} leads op {punten.length} plaatsen)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Elke stip is een plaats uit de leadgegevens met het aantal leads daar; de stip staat op het midden van de plaats, niet op een exact adres.
        </p>
        {bezig && <p className="text-xs text-muted-foreground animate-pulse">Locaties bepalen…</p>}
        {!bezig && zonderLocatie > 0 && (
          <p className="text-xs text-muted-foreground">
            {zonderLocatie} plaats{zonderLocatie === 1 ? '' : 'en'} nog zonder locatie
            {mislukt ? ' (verbinding mislukt — ververs de pagina)' : ' — de cache vult zich verder bij elk bezoek'}.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {punten.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bezig ? 'Locaties worden opgezocht…' : 'Geen leads met een bekende plaats in deze selectie.'}
          </p>
        ) : (
          <div className="relative isolate overflow-hidden rounded-lg border" role="region" aria-label="Interactieve kaart met leadplaatsen">
            <MapContainer center={[52.2, 5.3]} zoom={7} minZoom={2} maxZoom={18} scrollWheelZoom={false} style={{ height: 420, width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <PasViewAan punten={getoond} />
              {getoond.map((p) => (
                <Marker key={`${p.plaats}|${p.landcode}`} position={[p.lat, p.lon]} icon={puntIcoon(p.leads.length)}>
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[200px]">
                      <p className="font-semibold">
                        {vlag(p.landcode)} {p.plaats} — {p.leads.length} lead{p.leads.length === 1 ? '' : 's'}
                      </p>
                      <ul className="space-y-0.5">
                        {p.leads.slice(0, 8).map((r) => (
                          <li key={r.id || r.smartsuite_id}>
                            <button type="button" className="text-primary underline underline-offset-4 text-left" onClick={() => onOpenLead(r)}>
                              {r.name}{r.company ? ` (${r.company})` : ''}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {p.leads.length > 8 && <p className="text-muted-foreground">en {p.leads.length - 8} meer…</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}
        {punten.length > MAX_MARKERS && (
          <p className="text-xs text-muted-foreground mt-2">Alleen de {MAX_MARKERS} plaatsen met de meeste leads zijn op de kaart gezet.</p>
        )}
      </CardContent>
    </Card>
  );
}