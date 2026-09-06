import { useState } from 'react';
import { LEAD_STATUSES, STATUS_KLEUREN } from '@/lib/leadStatuses';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, CheckCircle2, Eye, Copy, MapPin } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function RecordRow({ record, onStatusSave, onViewDetail }) {
  const [selectedStatus, setSelectedStatus] = useState(record.status || 'Nieuw');
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
          {record.smartsuite_status && (
            <p className="text-xs text-muted-foreground">SmartSuite: {record.smartsuite_status}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {record.lead_date ? (() => { try { return format(parseISO(record.lead_date), 'dd-MM-yyyy'); } catch { return record.lead_date; } })() : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{record.email || '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
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
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {record.city ? (
          <a
            href={`https://www.google.com/maps/search/${encodeURIComponent(record.city)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={e => e.stopPropagation()}
          >
            <MapPin className="w-3 h-3" />
            {record.city}
          </a>
        ) : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className={`h-8 w-40 text-xs font-medium ${STATUS_KLEUREN[selectedStatus] || ''}`}>
              <SelectValue placeholder="Set status…" />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map(s => (
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
          variant="outline"
          onClick={() => onViewDetail(record)}
          className="h-8 text-xs gap-1"
        >
          <Eye className="w-3 h-3" />
        </Button>
      </td>
    </tr>
  );
}