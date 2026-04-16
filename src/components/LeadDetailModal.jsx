import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { Mail, Phone, Building2, Calendar, CheckCircle2, AlertCircle, MinusCircle, Hash } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function LeadDetailModal({ record, open, onClose }) {
  if (!record) return null;

  const formatDate = (d) => {
    try { return d ? format(parseISO(d), 'dd-MM-yyyy') : '—'; } catch { return d || '—'; }
  };

  const Row = ({ icon: Icon, label, value }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-all">{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{record.name || 'Onbekend'}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{record.smartsuite_id}</p>
        </DialogHeader>

        <div className="space-y-1 mt-2">
          <Row icon={Mail} label="Email" value={record.email} />
          <Row icon={Phone} label="Telefoon" value={record.phone} />
          <Row icon={Building2} label="Bedrijf" value={record.company} />
          <Row icon={Calendar} label="Lead datum" value={formatDate(record.lead_date)} />
          <Row icon={Hash} label="SmartSuite status" value={record.smartsuite_status} />
        </div>

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
      </DialogContent>
    </Dialog>
  );
}