import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { vlag, fmtDatum } from '@/lib/websiteUtils';

const puntIcoon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:9999px;background:hsl(234,62%,52%);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function KaartViews({ heatmap, setHeatmap }) {
  const map = useMap();
  return (
    <div className="absolute top-3 right-3 z-[1000] flex gap-2">
      <label
        className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-100"
        title="Toon bezoekers als dichtheidskaart in plaats van losse punten"
      >
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={heatmap}
          onChange={(e) => setHeatmap(e.target.checked)}
        />
        Heatmap
      </label>
      <button
        type="button"
        onClick={() => map.setView([52.2, 5.3], 7)}
        className="rounded-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-100"
      >
        Nederland
      </button>
      <button
        type="button"
        onClick={() => map.setView([25, 10], 2)}
        className="rounded-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-100"
      >
        Wereld
      </button>
    </div>
  );
}

// Warmtekaartlaag via leaflet.heat: tekent bezoekersdichtheid in plaats van losse punten
function HeatmapLaag({ punten }) {
  const map = useMap();
  useEffect(() => {
    const laag = L.heatLayer(
      punten.map((p) => [p.lat, p.lon, 1]),
      {
        radius: 28,
        blur: 22,
        maxZoom: 12,
        gradient: { 0.2: '#93c5fd', 0.45: '#3b82f6', 0.7: '#f59e0b', 1: '#dc2626' },
      }
    ).addTo(map);
    return () => map.removeLayer(laag);
  }, [map, punten]);
  return null;
}

export default function KaartTab({ bezoekers, onOpenDetail }) {
  const punten = (bezoekers || []).filter((b) => b.lat != null && b.lon != null);
  const [heatmap, setHeatmap] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-base">
          <MapPin className="w-5 h-5 text-primary" /> Bezoekers op de kaart ({punten.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Locaties zijn schattingen op basis van IP-gegevens, geen exacte adressen.
        </p>
      </CardHeader>
      <CardContent>
        {punten.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen bezoekers met een bekende locatie in deze periode.
          </p>
        ) : (
          <div
            className="relative isolate overflow-hidden rounded-lg border"
            role="region"
            aria-label="Interactieve kaart met bezoekerslocaties"
          >
            <MapContainer
              center={[52.2, 5.3]}
              zoom={7}
              minZoom={2}
              maxZoom={18}
              scrollWheelZoom={false}
              style={{ height: 480, width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {heatmap ? (
                <HeatmapLaag punten={punten} />
              ) : punten.map((b) => (
                <Marker key={b.bezoeker_id} position={[b.lat, b.lon]} icon={puntIcoon}>
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[180px]">
                      <p className="font-semibold">
                        {vlag(b.landcode)} {b.naam || b.bedrijf || 'Onbekende bezoeker'}
                      </p>
                      <p className="text-muted-foreground">
                        {[b.plaats, b.land].filter(Boolean).join(', ') || 'Locatie onbekend'}
                      </p>
                      <p className="text-muted-foreground">Laatste bezoek: {fmtDatum(b.laatste_bezoek)}</p>
                      <button
                        type="button"
                        className="text-primary underline underline-offset-4"
                        onClick={() => onOpenDetail(b)}
                      >
                        Naar bezoekersprofiel
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
              <KaartViews heatmap={heatmap} setHeatmap={setHeatmap} />
            </MapContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}