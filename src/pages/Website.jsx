import { Globe, Users, History, MessageSquare, Bell, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  { title: 'Live bezoekers', icon: Users, description: 'Huidige pagina, geschatte locatie en tijd op de website.' },
  { title: 'Bezoekgeschiedenis', icon: History, description: 'Eerdere bezoeken, bekeken pagina’s en koppeling aan een lead.' },
  { title: 'Chat', icon: MessageSquare, description: 'Gesprekken met bezoekers vanuit de BMC Sales tool.' },
  { title: 'Meldingen', icon: Bell, description: 'Pushmeldingen voor nieuwe bezoekers op je Mac en iPhone.' },
];

function MapViews() {
  const map = useMap();
  return (
    <div className="absolute top-3 right-3 z-[1000] flex gap-2">
      <button type="button" onClick={() => map.setView([52.2, 5.3], 7)}
        className="rounded-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-100">Nederland</button>
      <button type="button" onClick={() => map.setView([25, 10], 2)}
        className="rounded-md border bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-100">Wereld</button>
    </div>
  );
}

export default function Website() {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Website</h1>
          <a href="https://www.bmc-consultancy.com" target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-2 mt-2 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
            <Globe className="w-4 h-4" /> www.bmc-consultancy.com
          </a>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground">Nog niet aangesloten</span>
      </header>

      <Card>
        <CardHeader><CardTitle>Alle websitecontacten op één plek</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Dit wordt het overzicht voor websitebezoekers en gesprekken binnen de BMC Sales tool.</p>
          <p>De website is nog niet gekoppeld. Er worden hier nog geen bezoeken geregistreerd en er worden nog geen pushmeldingen verstuurd.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base">
            <MapPin className="w-5 h-5 text-primary" /> Bezoekers op de kaart
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Bekijk straks waar bezoekers ongeveer vandaan komen. Locaties zijn schattingen, geen exacte adressen.
          </p>
        </CardHeader>
        <CardContent>
          <div className="relative isolate overflow-hidden rounded-lg border" role="region" aria-label="Interactieve kaart met Nederland en wereldweergave">
            <MapContainer center={[52.2, 5.3]} zoom={7} minZoom={2} maxZoom={18}
              scrollWheelZoom={false} style={{ height: 400, width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapViews />
            </MapContainer>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Nog geen bezoekerslocaties beschikbaar. De kaart toont bezoekers zodra de website is aangesloten.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {sections.map(({ title, icon: Icon, description }) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <Icon className="w-5 h-5 text-primary" /> {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{description}</p>
              <p className="text-xs text-muted-foreground">Gepland · nog niet actief</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
