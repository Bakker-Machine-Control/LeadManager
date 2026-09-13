import { format, parseISO } from 'date-fns';

// Vlag-emoji van een ISO-landcode (bijv. 'nl' -> 🇳🇱)
export const vlag = (code) =>
  code && /^[a-zA-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : '🌐';

export const fmtDatum = (d) => {
  try {
    return d ? format(parseISO(d), 'dd-MM-yyyy HH:mm') : '—';
  } catch {
    return d || '—';
  }
};

// Seconden als leesbare tekst, bijv. 45s, 3m 20s, 1u 5m
export const fmtDuur = (sec) => {
  if (sec == null || isNaN(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  return `${Math.floor(m / 60)}u ${m % 60}m`;
};

export const verkortId = (id) => (id ? `${id.slice(0, 8)}…` : '—');

// Bereken de ISO-range van een periodekeuze; 'eigen' valt terug op 7 dagen
// zolang van of tot nog niet is ingevuld.
export const periodeRange = (periode, van, tot) => {
  if (periode === 'eigen' && van && tot) {
    return {
      van: van.length === 10 ? `${van}T00:00:00` : van,
      tot: tot.length === 10 ? `${tot}T23:59:59` : tot,
    };
  }
  const nu = new Date();
  if (periode === 'vandaag') {
    const start = new Date(nu);
    start.setHours(0, 0, 0, 0);
    return { van: start.toISOString(), tot: nu.toISOString() };
  }
  const dagen = periode === '30d' ? 30 : 7;
  return { van: new Date(nu.getTime() - dagen * 86400000).toISOString(), tot: nu.toISOString() };
};