import { Globe, Users, History, MessageSquare, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const sections = [
  { title: 'Live bezoekers', icon: Users, description: 'Huidige pagina, geschatte locatie en tijd op de website.' },
  { title: 'Bezoekgeschiedenis', icon: History, description: 'Eerdere bezoeken, bekeken pagina’s en koppeling aan een lead.' },
  { title: 'Chat', icon: MessageSquare, description: 'Gesprekken met bezoekers vanuit FlowBridge.' },
  { title: 'Meldingen', icon: Bell, description: 'Pushmeldingen voor nieuwe bezoekers op je Mac en iPhone.' },
];

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
          <p>Dit wordt het overzicht voor websitebezoekers en gesprekken binnen FlowBridge.</p>
          <p>De website is nog niet gekoppeld. Er worden hier nog geen bezoeken geregistreerd en er worden nog geen pushmeldingen verstuurd.</p>
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
