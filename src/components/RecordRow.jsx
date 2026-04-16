import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from './StatusBadge';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const SMARTSUITE_STATUSES = [
  'New', 'Contacted', 'Meeting Scheduled', 'Demo Done', 'Qualified', 'Not Interested',
];

export default function RecordRow({ record, onSync, onStatusSave, isSyncing }) {
  const [selectedStatus, setSelectedStatus] = useState(record.smartsuite_status || '');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);

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
        <div>
          <p className="font-medium text-sm text-foreground">{record.name || '—'}</p>
          <p className="text-xs text-muted-foreground">{record.smartsuite_id}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {record.lead_date ? (() => { try { return format(parseISO(record.lead_date), 'dd-MM-yyyy'); } catch { return record.lead_date; } })() : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.email || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.phone || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.company || '—'}</td>
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
        <Button
          size="sm"
          onClick={() => onSync(record)}
          disabled={isSyncing}
          className="h-8 text-xs gap-1"
        >
          {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
          Sync to Zoho
        </Button>
      </td>
    </tr>
  );
}