import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Info, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

export default function SyncLogPanel({ refreshKey }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    base44.entities.SyncLog.list('-created_date', 30).then(setLogs);
  }, [refreshKey]);

  const icon = (status) => {
    if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    return <Info className="w-4 h-4 text-amber-500 shrink-0" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-primary" />
          Sync History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-72">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No sync activity yet</p>
          ) : (
            <div className="divide-y divide-border">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  {icon(log.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {log.action} · {formatDistanceToNow(new Date(log.created_date), { addSuffix: true, locale: nl })}
                    </p>
                  </div>
                  {log.records_affected != null && (
                    <span className="text-xs text-muted-foreground shrink-0">{log.records_affected} records</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}