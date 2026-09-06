import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { LEAD_STATUSES } from '@/lib/leadStatuses';

const PER_KOLOM = 100;

const legeKolommen = () => LEAD_STATUSES.reduce(
  (kolommen, status) => ({ ...kolommen, [status]: { totaal: 0, leads: [] } }),
  {}
);

// Laadt het Kanban-bord per kolom vanuit getLeadBoardData: per werkstatus het
// exacte totaal van de server plus alleen de eerste kaarten (serverzijdig
// gepagineerd, lichte velden zonder raw_data). laadMeer(status) haalt de
// volgende pagina voor één kolom op en plakt die eronder.
export function useBoardLeads() {
  const [kolommen, setKolommen] = useState(legeKolommen);
  const [wachtendOpVerrijking, setWachtendOpVerrijking] = useState(0);
  const [loading, setLoading] = useState(true);
  const [laadtMeerStatus, setLaadtMeerStatus] = useState(null);
  const [fout, setFout] = useState(null);
  const scoreLabelRef = useRef('');

  const haalOp = useCallback(async (scoreLabel, offsets, alleen) => {
    const res = await base44.functions.invoke('getLeadBoardData', {
      per_kolom: PER_KOLOM,
      score_label: scoreLabel || '',
      offsets: offsets || {},
      ...(alleen ? { alleen } : {}),
    });
    const data = res.data || {};
    if (!data.ok) throw new Error(data.error || 'Onbekende fout bij het laden van het bord');
    return data;
  }, []);

  // Volledig (her)laden; het scorefilter gaat mee naar de server
  const laad = useCallback(async (scoreLabel = '') => {
    scoreLabelRef.current = scoreLabel;
    setLoading(true);
    setFout(null);
    try {
      const data = await haalOp(scoreLabel);
      setKolommen(data.kolommen || legeKolommen());
      setWachtendOpVerrijking(data.wachtend_op_verrijking || 0);
    } catch (e) {
      // Fouten worden nooit stilletjes weggegooid: het bord toont een melding
      // met een knop "Opnieuw proberen" in plaats van een leeg bord.
      setFout(e.message || 'Kon de leads niet laden');
    } finally {
      setLoading(false);
    }
  }, [haalOp]);

  // Volgende pagina voor één kolom ophalen en onder de geladen kaarten plakken
  const laadMeer = useCallback(async (status) => {
    const kolom = kolommen[status];
    if (!kolom || kolom.leads.length >= kolom.totaal) return;
    setLaadtMeerStatus(status);
    try {
      const data = await haalOp(scoreLabelRef.current, { [status]: kolom.leads.length }, status);
      const nieuweKolom = (data.kolommen || {})[status];
      if (!nieuweKolom) return;
      setKolommen(prev => {
        const bestaandeIds = new Set(prev[status].leads.map(l => l.id));
        const nieuweKaarten = nieuweKolom.leads.filter(l => !bestaandeIds.has(l.id));
        return {
          ...prev,
          [status]: { totaal: nieuweKolom.totaal, leads: [...prev[status].leads, ...nieuweKaarten] },
        };
      });
    } catch (e) {
      setFout(e.message || 'Kon geen extra leads laden');
    } finally {
      setLaadtMeerStatus(null);
    }
  }, [kolommen, haalOp]);

  // Verplaatst alleen de gesleepte kaart en werkt de tellingen van de bron- en
  // doelkolom bij; mislukt het opslaan, dan wordt de kaart teruggezet.
  const verplaatsLead = useCallback(async (leadId, oudeStatus, nieuweStatus) => {
    const verplaats = (van, naar) => (prev) => {
      const bron = prev[van];
      const doel = prev[naar];
      const lead = bron.leads.find(l => l.id === leadId);
      if (!lead) return prev;
      return {
        ...prev,
        [van]: { ...bron, totaal: Math.max(0, bron.totaal - 1), leads: bron.leads.filter(l => l.id !== leadId) },
        [naar]: { ...doel, totaal: doel.totaal + 1, leads: [...doel.leads, { ...lead, status: naar }] },
      };
    };
    setKolommen(verplaats(oudeStatus, nieuweStatus));
    try {
      await base44.entities.Lead.update(leadId, { status: nieuweStatus });
    } catch (e) {
      setKolommen(verplaats(nieuweStatus, oudeStatus));
      throw e;
    }
  }, []);

  useEffect(() => { laad(''); }, [laad]);

  return {
    kolommen,
    wachtendOpVerrijking,
    loading,
    laadtMeerStatus,
    fout,
    reload: laad,
    laadMeer,
    verplaatsLead,
  };
}