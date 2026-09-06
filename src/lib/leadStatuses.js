// Werkstatussen van een lead (Lead.status) — de vijf kolommen van het Kanban-bord
export const LEAD_STATUSES = ['Nieuw', 'Contacten', 'Afspraak', 'Afgerond', 'Afgewezen'];

// Kleur van het statusveld in het SmartSuite-overzicht:
// Nieuw = wit, Contacten = groen, Afgerond = rood, overige neutraal
export const STATUS_KLEUREN = {
  Nieuw: 'bg-white text-foreground border-border',
  Contacten: 'bg-emerald-600 text-white border-emerald-600',
  Afgerond: 'bg-red-600 text-white border-red-600',
  Afspraak: 'bg-secondary text-secondary-foreground border-input',
  Afgewezen: 'bg-secondary text-secondary-foreground border-input',
};