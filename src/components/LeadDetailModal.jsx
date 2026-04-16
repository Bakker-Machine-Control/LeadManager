import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { Mail, Phone, Building2, Calendar, CheckCircle2, AlertCircle, MinusCircle, Hash, Copy } from 'lucide-react';
import StatusBadge from './StatusBadge';
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
      if (typeof v === 'object' && v !== null) return v.phone_number || v.value || v.name || v.label || JSON.stringify(v);
      return String(v);
    }).join(', ');
  }
  if (typeof val === 'object') {
    if (val.date) return formatDate(val.date);
    return val.value || val.name || val.label || JSON.stringify(val);
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

export default function LeadDetailModal({ record, open, onClose }) {
  const [copied, setCopied] = useState(null);

  if (!record) return null;

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

        {/* Snel overzicht */}
        <div className="space-y-0 mt-2">
          <Row icon={Mail} label="Email" value={record.email} />
          <Row icon={Phone} label="Telefoon" value={record.phone} />
          <Row icon={Building2} label="Bedrijf" value={record.company} />
          <Row icon={Calendar} label="Lead datum" value={formatDate(record.lead_date)} />
          <Row icon={Hash} label="SmartSuite status" value={record.smartsuite_status} />
        </div>

        {/* Status badges */}
        <div className="flex gap-3 mt-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Sync status</p>
            <StatusBadge status={record.sync_status || 'pending'} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">In Zoho?</p>
            {record.zoho_exists === true ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <AlertCircle className="w-3 h-3" /> Bestaat ({record.zoho_match})
              </span>
            ) : record.zoho_exists === false ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" /> Nieuw
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MinusCircle className="w-3 h-3" /> Onbekend
              </span>
            )}
          </div>
          {record.zoho_lead_id && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Zoho ID</p>
              <p className="text-xs font-mono">{record.zoho_lead_id}</p>
            </div>
          )}
        </div>

        {record.sync_error && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded p-2">
            <strong>Fout:</strong> {record.sync_error}
          </div>
        )}

        {/* Alle SmartSuite velden */}
        {rawEntries.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Alle SmartSuite velden</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              {rawEntries.map(([key, val]) => {
                const displayVal = formatValue(val);
                return (
                  <div key={key} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground font-mono">{key}</p>
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