import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ArchiefRij from '@/components/archief/ArchiefRij';

const PAGINA_GROOTTE = 50;

// Archief met alle afgeronde leads, serverzijdig gepagineerd via de bestaande
// bordfunctie (alleen de kolom Afgerond, oudste bovenaan de lijst per pagina).
export default function Archief() {
  const [leads, setLeads] = useState([]);
  const [totaal, setTotaal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [laadtMeer, setLaadtMeer] = useState(false);
  const [fout, setFout] = useState(null);
  const [poging, setPoging] = useState(0);

  const haalPagina = useCallback(async (offset) => {
    const res = await base44.functions.invoke('getLeadBoardData', {
      per_kolom: PAGINA_GROOTTE,
      offsets: { Afgerond: offset },
      alleen: 'Afgerond',
    });
    const data = res.data || {};
    if (!data.ok) throw new Error(data.error || 'Onbekende fout bij het laden van het archief');
    return data.kolommen?.Afgerond || { totaal: 0, leads: [] };
  }, []);

  useEffect(() => {
    let actief = true;
    setLoading(true);
    haalPagina(0)
      .then((kolom) => {
        if (!actief) return;
        setLeads(kolom.leads);
        setTotaal(kolom.totaal);
      })
      .catch((e) => {
        if (actief) setFout(e.message || 'Kon het archief niet laden');
      })
      .finally(() => {
        if (actief) setLoading(false);
      });
    return () => { actief = false; };
  }, [haalPagina, poging]);

  const laadMeerLeads = async () => {
    setLaadtMeer(true);
    try {
      const kolom = await haalPagina(leads.length);
      setLeads((vorige) => {
        const ids = new Set(vorige.map((l) => l.id));
        return [...vorige, ...kolom.leads.filter((l) => !ids.has(l.id))];
      });
      setTotaal(kolom.totaal);
    } catch (e) {
      setFout(e.message || 'Kon geen extra leads laden');
    } finally {
      setLaadtMeer(false);
    }
  };

  const opnieuw = () => {
    setFout(null);
    setPoging((p) => p + 1);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Archief</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Alle afgeronde leads ({totaal})
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/">
            <ArrowLeft className="w-4 h-4" />
            Terug naar het bord
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : fout ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground max-w-md">
              Het archief kon niet geladen worden: {fout}
            </p>
            <Button variant="outline" onClick={opnieuw}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Er zijn nog geen afgeronde leads.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {leads.map((lead) => (
                <ArchiefRij key={lead.id} lead={lead} />
              ))}
            </div>
          )}
          {leads.length < totaal && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={laadMeerLeads} disabled={laadtMeer}>
                {laadtMeer ? 'Laden…' : `Meer laden (nog ${totaal - leads.length})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}