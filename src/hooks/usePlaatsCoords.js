import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Maximaal aantal nieuwe plaatsen dat per paginalading via Nominatim wordt
// opgezocht (de server doet er maximaal 60 per aanroep, ca. 1 seconde per
// plaats). De rest vult via de cache aan bij een volgend bezoek.
const MAX_NIEUWE_LOOKUPS = 240;

// Zoekt coördinaten bij unieke plaatsen via de backendfunctie geocodeLeadPlaatsen
// (met cache in Plaatscoordinaat, in rondes).
// plaatsen: [{ sleutel, plaats, landcode }] — geeft { coords, bezig, mislukt },
// waarbij coords per sleutel { lat, lon } of null (niet gevonden) bevat.
export default function usePlaatsCoords(plaatsen) {
  const [coords, setCoords] = useState({});
  const [bezig, setBezig] = useState(false);
  const [mislukt, setMislukt] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      const gevonden = {};
      let lookups = 0;
      setBezig(true);
      setMislukt(false);
      while (!stop) {
        const wachtende = plaatsen.filter((p) => !(p.sleutel in gevonden)).slice(0, 300);
        if (wachtende.length === 0 || lookups >= MAX_NIEUWE_LOOKUPS) break;
        try {
          const res = await base44.functions.invoke('geocodeLeadPlaatsen', { plaatsen: wachtende });
          const resultaten = res.data?.resultaten || {};
          let vooruitgang = 0;
          for (const [k, v] of Object.entries(resultaten)) {
            if (!(k in gevonden)) vooruitgang++;
            gevonden[k] = v;
          }
          lookups += res.data?.opgezocht || 0;
          setCoords({ ...gevonden });
          if (vooruitgang === 0) break; // geen vooruitgang: stoppen
        } catch {
          setMislukt(true);
          break;
        }
      }
      if (!stop) setCoords({ ...gevonden });
      setBezig(false);
    })();
    return () => { stop = true; };
  }, [plaatsen]);

  return { coords, bezig, mislukt };
}