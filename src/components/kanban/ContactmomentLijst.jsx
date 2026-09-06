import { format, parseISO } from 'date-fns';

const fmtDatum = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy HH:mm') : '—'; } catch { return d || '—'; }
};

// Lijst met contactmomenten van één lead, nieuwste bovenaan
export default function ContactmomentLijst({ momenten }) {
  if (!momenten || momenten.length === 0) {
    return <p className="text-xs text-muted-foreground">Nog geen contactmomenten.</p>;
  }
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {momenten.map((m) => (
        <div key={m.id} className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">{fmtDatum(m.datum)}</p>
            <span className="text-xs text-muted-foreground truncate">
              {m.wie || '—'} · {m.kanaal}
            </span>
          </div>
          <p className="text-sm mt-0.5 break-all">{m.notitie}</p>
        </div>
      ))}
    </div>
  );
}