import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { Mail, Phone, Building2, Calendar, CheckCircle2, Hash, Copy, Truck, MapPin } from 'lucide-react';
import { useState } from 'react';

const formatDate = (d) => {
  try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
};

const formatValue = (val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Ja' : 'Nee';
  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    return val.map(v => {
      if (typeof v === 'object' && v !== null) return v.title || v.phone_number || v.value || v.name || v.label || JSON.stringify(v);
      return String(v);
    }).join(', ');
  }
  if (typeof val === 'object') {
    if (val.date) return formatDate(val.date);
    return val.title || val.value || val.name || val.label || JSON.stringify(val);
  }
  return String(val);
};

const SKIP_KEYS = ['id', 'application_id', 'application_slug'];

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
    {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-all">{value || '—'}</p>
    </div>
  </div>
);

function extractFromRaw(val) {
  if (!val || val === '') return '';
  if (Array.isArray(val)) {
    const first = val[0];
    if (!first) return '';
    if (typeof first === 'string') return first;
    return first.phone_number || first.value || first.name || String(first);
  }
  if (typeof val === 'object') {
    if (val.location_city) return val.location_city;
    if (val.sys_root) return val.sys_root.replace(/,\s*[\w\s]+$/, '').trim();
    if (val.date) return val.date;
    return val.value || val.name || val.label || '';
  }
  return String(val);
}

function findInRaw(rawData, fieldLabels, keywords) {
  // First try by label match
  const entry = Object.entries(rawData).find(([k]) => {
    const label = (fieldLabels[k] || k).toLowerCase();
    return keywords.some(kw => label.includes(kw.toLowerCase()));
  });
  if (entry) {
    const extracted = extractFromRaw(entry[1]);
    if (extracted) return extracted;
  }
  return '';
}

export default function LeadDetailModal({ record, open, onClose, fieldLabels = {} }) {
  const [copied, setCopied] = useState(null);

  if (!record) return null;

  const raw = record.raw_data || {};

  // Use stored value or fall back to raw_data extraction by label, then by known slugs
  const email = record.email ||
    findInRaw(raw, fieldLabels, ['email', 'e-mail', 'mail']) ||
    extractFromRaw(raw['s19d20e4c1']) ||
    extractFromRaw(raw['sf99925cfb']) ||
    extractFromRaw(raw['s6299218c9']);

  const phone = record.phone ||
    findInRaw(raw, fieldLabels, ['phone', 'telefoon', 'mobile', 'mobiel', 'gsm', 'tel']) ||
    extractFromRaw(raw['s2fc4c481d']) ||
    extractFromRaw(raw['s0c5029009']) ||
    extractFromRaw(raw['sc8d719ad3']);

  const company = record.company ||
    findInRaw(raw, fieldLabels, ['company', 'bedrijf', 'organization', 'organisatie', 'firma']) ||
    extractFromRaw(raw['sfbbd03935']) ||
    extractFromRaw(raw['s18939601b']);

  const city = record.city ||
    findInRaw(raw, fieldLabels, ['city', 'stad', 'woonplaats', 'gemeente', 'place', 'location', 'plaats']) ||
    extractFromRaw(raw['s778b5be05']) ||
    extractFromRaw(raw['s84ca80bb4']);

  const sa4820 = record.raw_data?.sa4820cf90 || '';
  const isBMC = typeof sa4820 === 'string' && sa4820.includes('BMC');
  const isSurveyour = typeof sa4820 === 'string' && sa4820.toLowerCase().includes('surveyour');

  const distributor = record.raw_data ? Object.entries(record.raw_data).find(([k, v]) => {
    const label = (fieldLabels[k] || k).toLowerCase();
    const labelMatch = label === 'distributor' || label === 'leverancier' || label.startsWith('distrib');
    if (!labelMatch) return false;
    // Skip fields whose formatted value looks like a short internal code (no spaces, all lowercase, short)
    const formatted = formatValue(v);
    if (formatted === '—') return false;
    return formatted.length > 2;
  }) : null;

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const rawData = record.raw_data || {};
  const rawEntries = Object.entries(rawData).filter(([k, v]) => {
    if (SKIP_KEYS.includes(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{record.name || 'Onbekend'}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{record.smartsuite_id}</p>
        </DialogHeader>

        {/* Distributor label */}
        {isBMC && (
          <p className="mt-2 text-sm font-semibold text-emerald-800">Distributor BMC</p>
        )}
        {isSurveyour && (
          <p className="mt-2 text-sm font-semibold text-red-600">Clown Bessie</p>
        )}

        {/* Snel overzicht */}
        <div className="space-y-0 mt-2">
          {distributor && (
            <Row icon={Truck} label={fieldLabels[distributor[0]] || 'Distributor'} value={formatValue(distributor[1])} />
          )}
          <Row icon={Mail} label="Email" value={email} />
          <Row icon={Phone} label="Telefoon" value={phone} />
          <Row icon={Building2} label="Bedrijf" value={company} />
          <Row icon={MapPin} label="Plaats" value={city} />
          <Row icon={Calendar} label="Lead datum" value={formatDate(record.lead_date)} />
          <Row icon={Hash} label="SmartSuite status" value={record.smartsuite_status} />
          <Row icon={Hash} label="Werkstatus" value={record.status || 'nieuw'} />
        </div>

        {/* Alle SmartSuite velden */}
        {rawEntries.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Alle SmartSuite velden</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {rawEntries.map(([key, val]) => {
                const displayVal = formatValue(val);
                const label = fieldLabels[key] || key;
                return (
                  <div key={key} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm break-all">{displayVal}</p>
                    </div>
                    {displayVal !== '—' && (
                      <button
                        onClick={() => handleCopy(displayVal, key)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                        title="Kopieer"
                      >
                        {copied === key ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}