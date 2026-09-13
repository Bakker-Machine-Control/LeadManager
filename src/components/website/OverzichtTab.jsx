import { Users, MousePointerClick, UserPlus, UserCheck, Clock, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { vlag, fmtDuur, fmtDatum, verkortId } from '@/lib/websiteUtils';

const StatCard = ({ icon: Icon, titel, waarde, sub }) => (
  <Card>
    <CardContent className="p-4 flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{titel}</p>
        <p className="text-2xl font-bold leading-tight">{waarde}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  </Card>
);

export default function OverzichtTab({ stats, laden }) {
  if (laden && !stats) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!stats) return <p className="text-sm text-muted-foreground">Geen statistieken beschikbaar.</p>;

  const maxBron = Math.max(1, ...stats.bronnen.map((b) => b.aantal));

  return (
    <div className="space-y-6">
      {/* Statistiekkaarten */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Users} titel="Bezoekers" waarde={stats.bezoekers} />
        <StatCard icon={MousePointerClick} titel="Bezoeken" waarde={stats.bezoeken} />
        <StatCard
          icon={UserPlus}
          titel="Nieuw / terugkerend"
          waarde={`${stats.nieuw} / ${stats.terugkerend}`}
          sub={`${stats.nieuw} nieuw, ${stats.terugkerend} terugkerend`}
        />
        <StatCard icon={Clock} titel="Gem. bezoekduur" waarde={fmtDuur(stats.gem_duur)} />
      </div>

      {/* Nu op de site */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="w-5 h-5 text-primary" /> Nu op de site
            <span className="text-sm font-normal text-muted-foreground">({stats.nu_op_site.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.nu_op_site.length === 0 ? (
            <p className="text-sm text-muted-foreground">Op dit moment is er niemand actief op de website.</p>
          ) : (
            <div className="divide-y divide-border">
              {stats.nu_op_site.map((b) => (
                <div key={b.bezoek_id} className="flex items-center gap-3 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-lg leading-none shrink-0">{vlag(b.landcode)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{b.naam || b.bedrijf || verkortId(b.bezoeker_id)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.huidige_pagina || '—'}
                      {b.plaats ? ` · ${b.plaats}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                    sinds {fmtDatum(b.gestart_op)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Top-10 pagina's */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top-10 pagina's</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.top_paginas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen paginaweergaven in deze periode.</p>
            ) : (
              <div className="divide-y divide-border">
                {stats.top_paginas.map((p) => (
                  <div key={p.pad} className="flex items-center justify-between gap-3 py-2">
                    <p className="text-sm truncate min-w-0 flex-1" title={p.titel || p.pad}>
                      {p.pad}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.weergaven} weergaven{p.gem_duur != null ? ` · gem. ${fmtDuur(p.gem_duur)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bronnen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bronnen</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.bronnen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen bezoeken in deze periode.</p>
            ) : (
              <div className="space-y-2">
                {stats.bronnen.map((b) => (
                  <div key={b.naam} className="flex items-center gap-3">
                    <span className="text-sm w-24 capitalize shrink-0">{b.naam}</span>
                    <div className="h-2 rounded-full bg-muted flex-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round((b.aantal / maxBron) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{b.aantal}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provincies */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Provincies</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.provincies.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen bezoekers met een bekende provincie.</p>
            ) : (
              <div className="divide-y divide-border">
                {stats.provincies.map((p) => (
                  <div key={p.naam} className="flex items-center justify-between py-2">
                    <p className="text-sm">{p.naam}</p>
                    <span className="text-xs text-muted-foreground">{p.aantal}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Landen */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Landen</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.landen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen bezoekers met een bekend land.</p>
            ) : (
              <div className="divide-y divide-border">
                {stats.landen.map((l) => (
                  <div key={l.naam} className="flex items-center justify-between py-2">
                    <p className="text-sm">{l.naam}</p>
                    <span className="text-xs text-muted-foreground">{l.aantal}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}