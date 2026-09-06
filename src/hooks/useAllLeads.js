import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Laadt álle leads pagina voor pagina via getLeadBoardData in lijstmodus
// (licht gewicht, zonder raw_data). Gebruikt door de Meta-pagina.
export function useAllLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFout(null);
    const all = [];
    let skip = 0;
    try {
      let verder = true;
      while (verder) {
        const res = await base44.functions.invoke('getLeadBoardData', { modus: 'lijst', skip, limit: 1000 });
        const data = res.data || {};
        const page = data.leads || [];
        all.push(...page);
        verder = !!data.has_more && page.length > 0;
        skip += page.length;
        if (skip > 100000) break; // veiligheidsklep
      }
      setLeads(all);
    } catch (e) {
      // Fouten worden nooit stilletjes weggegooid: de pagina toont een melding
      setFout(e.message || 'Kon de leads niet laden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { leads, loading, fout, reload: load };
}