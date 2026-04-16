import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchSmartSuiteRecords } from '@/functions/fetchSmartSuiteRecords';
import { syncToZohoCRM } from '@/functions/syncToZohoCRM';
import { updateSmartSuiteStatus } from '@/functions/updateSmartSuiteStatus';
import { checkZohoDuplicates } from '@/functions/checkZohoDuplicates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Zap, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import RecordRow from '@/components/RecordRow';
import SyncLogPanel from '@/components/SyncLogPanel';

function extractField(record, slugs) {
  for (const slug of slugs) {
    const val = record[slug];
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val)) {
      const first = val[0];
      if (!first) continue;
      if (typeof first === 'string') return first;
      return first.phone_number || first.value || first.name || String(first);
    }
    if (typeof val === 'object') {
      return val.value || val.name || val.label || '';
    }
    return String(val);
  }
  return '';
}

export default function Dashboard() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);
  const [syncStatuses, setSyncStatuses] = useState({});
  const [fetching, setFetching] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [logRefresh, setLogRefresh] = useState(0);

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(s => {
      if (s.length > 0) setSettings(s[0]);
    });
    base44.entities.SyncedRecord.list('-created_date', 200).then(existing => {
      const map = {};
      existing.forEach(r => { map[r.smartsuite_id] = r; });
      setSyncStatuses(map);
    });
  }, []);

  const logAction = async (action, status, message, records_affected) => {
    await base44.entities.SyncLog.create({ action, status, message, records_affected });
    setLogRefresh(p => p + 1);
  };

  const handleFetch = async () => {
    if (!settings?.smartsuite_api_token) {
      toast({ title: 'Missing settings', description: 'Please configure SmartSuite credentials first.', variant: 'destructive' });
      return;
    }
    setFetching(true);
    const res = await fetchSmartSuiteRecords({
      api_token: settings.smartsuite_api_token,
      account_id: settings.smartsuite_account_id,
      solution_id: settings.smartsuite_solution_id,
      table_id: settings.smartsuite_table_id,
    });
    if (res.data?.error) {
      toast({ title: 'Fetch failed', description: res.data.error, variant: 'destructive' });
      await logAction('fetch', 'error', res.data.error, 0);
    } else {
      const items = res.data?.items || [];
      const mapped = items.map(item => ({
        smartsuite_id: item.id,
        name: extractField(item, ['title', 'name', 'full_name', 'contact_name', 'Name']),
        email: extractField(item, ['email', 'email_address', 'contact_email', 'Email', 's6299218c9']),
        phone: extractField(item, ['phone', 'phone_number', 'mobile', 'Phone', 'sc8d719ad3']),
        company: extractField(item, ['company', 'company_name', 'organization', 'Company', 's18939601b']),
        smartsuite_status: extractField(item, ['status', 'lead_status', 'Status']),
        lead_date: item.s9642641d7?.date || item.first_created?.on || '',
        sync_status: syncStatuses[item.id]?.sync_status || 'pending',
      }));
      setRecords(mapped);
      toast({ title: 'Records loaded', description: `${mapped.length} records fetched. Zoho check bezig…` });

      await logAction('fetch', 'success', `Fetched ${mapped.length} records from SmartSuite`, mapped.length);

      // Check duplicates in Zoho CRM (non-blocking)
      try {
        const leadsToCheck = mapped.map(r => ({ smartsuite_id: r.smartsuite_id, email: r.email, phone: r.phone }));
        const dupRes = await checkZohoDuplicates({
          zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
          leads: leadsToCheck,
        });
        if (dupRes.data?.results) {
          const dupMap = {};
          dupRes.data.results.forEach(r => { dupMap[r.smartsuite_id] = r; });
          setRecords(prev => prev.map(r => ({
            ...r,
            zoho_exists: dupMap[r.smartsuite_id]?.exists_in_zoho || false,
            zoho_match: dupMap[r.smartsuite_id]?.matched_on || null,
          })));
          toast({ title: 'Records geladen', description: `${mapped.length} records + Zoho check klaar` });
        } else {
          toast({ title: 'Records geladen', description: `${mapped.length} records fetched` });
        }
      } catch (dupErr) {
        toast({ title: 'Records geladen', description: `${mapped.length} records fetched (Zoho check mislukt)`, variant: 'destructive' });
      }
    }
    setFetching(false);
  };

  const doSync = useCallback(async (rec) => {
    const { sync_status, smartsuite_status, ...leadData } = rec;
    const res = await syncToZohoCRM({
      zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
      leads: [leadData],
    });
    const result = res.data?.results?.[0];
    const success = result?.success;
    const newStatus = success ? 'synced' : 'error';

    // Upsert in DB
    const existing = syncStatuses[rec.smartsuite_id];
    if (existing) {
      await base44.entities.SyncedRecord.update(existing.id, {
        ...rec, sync_status: newStatus, sync_error: result?.message || '', zoho_lead_id: result?.zoho_id || '', last_synced_at: new Date().toISOString(),
      });
    } else {
      await base44.entities.SyncedRecord.create({
        ...rec, sync_status: newStatus, sync_error: result?.message || '', zoho_lead_id: result?.zoho_id || '', last_synced_at: new Date().toISOString(),
      });
    }
    setSyncStatuses(p => ({ ...p, [rec.smartsuite_id]: { sync_status: newStatus } }));
    setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, sync_status: newStatus } : r));
    return { success, message: result?.message };
  }, [settings, syncStatuses]);

  const handleSyncOne = async (rec) => {
    setSyncingId(rec.smartsuite_id);
    const result = await doSync(rec);
    await logAction('sync', result?.success ? 'success' : 'error', result?.success ? `Synced "${rec.name}" to Zoho CRM` : `Failed syncing "${rec.name}": ${result?.message}`, 1);
    toast({ title: result?.success ? 'Synced!' : 'Sync failed', description: result?.message || '', variant: result?.success ? 'default' : 'destructive' });
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!records.length) return;
    setSyncingAll(true);
    let successCount = 0, errorCount = 0;
    for (const rec of records) {
      setSyncingId(rec.smartsuite_id);
      const result = await doSync(rec);
      if (result?.success) successCount++; else errorCount++;
    }
    setSyncingId(null);
    const status = errorCount === 0 ? 'success' : successCount === 0 ? 'error' : 'partial';
    await logAction('sync_all', status, `Sync all: ${successCount} succeeded, ${errorCount} failed`, records.length);
    toast({ title: 'Sync All complete', description: `${successCount} synced, ${errorCount} failed` });
    setSyncingAll(false);
  };

  const handleStatusSave = async (rec, newStatus) => {
    if (!settings?.smartsuite_api_token) return;
    await updateSmartSuiteStatus({
      api_token: settings.smartsuite_api_token,
      account_id: settings.smartsuite_account_id,
      solution_id: settings.smartsuite_solution_id,
      table_id: settings.smartsuite_table_id,
      record_id: rec.smartsuite_id,
      status_field_slug: 'status',
      status_value: newStatus,
    });
    setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, smartsuite_status: newStatus } : r));
    toast({ title: 'Status updated', description: `"${rec.name}" → ${newStatus}` });
  };

  const stats = [
    { label: 'Total Records', value: records.length, icon: Users, color: 'text-primary' },
    { label: 'Synced', value: records.filter(r => r.sync_status === 'synced').length, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Pending', value: records.filter(r => r.sync_status === 'pending').length, icon: RefreshCw, color: 'text-amber-500' },
    { label: 'Errors', value: records.filter(r => r.sync_status === 'error').length, icon: AlertCircle, color: 'text-red-500' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lead Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Sync leads from SmartSuite to Zoho CRM</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleFetch} disabled={fetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching…' : 'Fetch from SmartSuite'}
          </Button>
          <Button onClick={handleSyncAll} disabled={syncingAll || records.length === 0} className="gap-2">
            <Zap className="w-4 h-4" />
            {syncingAll ? 'Syncing All…' : 'Sync All to Zoho'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">SmartSuite Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No records yet. Click "Fetch from SmartSuite" to load data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-y border-border text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium">Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Email</th>
                    <th className="px-4 py-2.5 text-left font-medium">Phone</th>
                    <th className="px-4 py-2.5 text-left font-medium">Company</th>
                    <th className="px-4 py-2.5 text-left font-medium">In Zoho?</th>
                    <th className="px-4 py-2.5 text-left font-medium">Sync Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">SmartSuite Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map(rec => (
                    <RecordRow
                      key={rec.smartsuite_id}
                      record={rec}
                      onSync={handleSyncOne}
                      onStatusSave={handleStatusSave}
                      isSyncing={syncingId === rec.smartsuite_id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Log */}
      <SyncLogPanel refreshKey={logRefresh} />
    </div>
  );
}