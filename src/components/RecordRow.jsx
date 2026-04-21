import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from './StatusBadge';
import { RefreshCw, CheckCircle2, AlertCircle, MinusCircle, Eye, Copy } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const SMARTSUITE_STATUSES = [
  'New', 'Contacted', 'Meeting Scheduled', 'Demo Done', 'Qualified', 'Not Interested',
];

export default function RecordRow({ record, onSync, onStatusSave, onViewDetail, isSyncing }) {
  const [selectedStatus, setSelectedStatus] = useState(record.smartsuite_status || '');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPhone = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(record.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    setStatusSaved(false);
    await onStatusSave(record, selectedStatus);
    setSavingStatus(false);
    setStatusSaved(true);
    setTimeout(() => setStatusSaved(false), 2000);
  };

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <div className="cursor-pointer hover:underline" onClick={() => onViewDetail(record)}>
          <p className="font-medium text-sm text-primary">{record.name || '—'}</p>
          <p className="text-xs text-muted-foreground">{record.smartsuite_id}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {record.lead_date ? (() => { try { return format(parseISO(record.lead_date), 'dd-MM-yyyy'); } catch { return record.lead_date; } })() : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.email || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>{record.phone || '—'}</span>
          {record.phone && (
            <button onClick={handleCopyPhone} className="text-muted-foreground hover:text-foreground transition-colors" title="Kopieer telefoonnummer">
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.company || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.city || '—'}</td>
      <td className="px-4 py-3">
        {record.zoho_exists === true ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <AlertCircle className="w-3 h-3" />
            Bestaat ({record.zoho_match})
          </span>
        ) : record.zoho_exists === false ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" />
            Nieuw
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MinusCircle className="w-3 h-3" />
            —
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={record.sync_status || 'pending'} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {SMARTSUITE_STATUSES.map(s => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveStatus}
            disabled={savingStatus || !selectedStatus}
            className="h-8 text-xs gap-1"
          >
            {statusSaved ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            ) : savingStatus ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : null}
            {statusSaved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewDetail(record)}
            className="h-8 text-xs gap-1"
          >
            <Eye className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            onClick={() => onSync(record)}
            disabled={isSyncing}
            className="h-8 text-xs gap-1"
          >
            {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
            Sync
          </Button>
        </div>
      </td>
    </tr>
  );
}