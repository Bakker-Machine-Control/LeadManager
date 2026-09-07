import { Facebook, Inbox, Phone, User, Tent, Globe, Users, HelpCircle } from 'lucide-react';

// Herkomst-logo op de lead-kaartjes: per bron een icoon met eigen kleur
const BRON_CONFIG = {
  meta: { icon: Facebook, label: 'Meta (Facebook/Instagram)', className: 'text-blue-600 bg-blue-50' },
  smartsuite: { icon: Inbox, label: 'SmartSuite', className: 'text-violet-600 bg-violet-50' },
  telefoon: { icon: Phone, label: 'Telefoon (handmatig)', className: 'text-emerald-600 bg-emerald-50' },
  persoonlijk: { icon: User, label: 'Persoonlijk contact (handmatig)', className: 'text-amber-600 bg-amber-50' },
  beurs: { icon: Tent, label: 'Beurs (handmatig)', className: 'text-orange-600 bg-orange-50' },
  website: { icon: Globe, label: 'Website', className: 'text-sky-600 bg-sky-50' },
  aanbeveling: { icon: Users, label: 'Aanbeveling', className: 'text-teal-600 bg-teal-50' },
  overig: { icon: HelpCircle, label: 'Overig', className: 'text-muted-foreground bg-secondary' },
};

export default function BronBadge({ bron }) {
  const config = BRON_CONFIG[bron];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span
      title={config.label}
      className={`inline-flex items-center justify-center rounded p-1 shrink-0 ${config.className}`}
    >
      <Icon className="w-3 h-3" />
    </span>
  );
}