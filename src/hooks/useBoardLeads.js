import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Laadt alle leads pagina voor pagina via getLeadBoardData (lean payload, zonder raw_data).
export function useBoardLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = [];
    let skip = 0;
    let guard = 0;
    try {
      while (guard++ < 100) {
        const res = await base44.functions.invoke('getLeadBoardData', { skip, limit: 1000 });
        const data = res.data || {};
        const page = data.leads || [];
        all.push(...page);
        if (!data.has_more || page.length === 0) break;
        skip += page.length;
      }
      setLeads(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { leads, loading, setLeads, reload: load };
}