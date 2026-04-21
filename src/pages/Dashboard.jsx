import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchSmartSuiteRecords } from '@/functions/fetchSmartSuiteRecords';
import { syncToZohoCRM } from '@/functions/syncToZohoCRM';
import { updateSmartSuiteStatus } from '@/functions/updateSmartSuiteStatus';
import { checkZohoDuplicates } from '@/functions/checkZohoDuplicates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Zap, Users, CheckCircle2, AlertCircle, Search, ArrowUpDown } from 'lucide-react';
import RecordRow from '@/components/RecordRow';
import SyncLogPanel from '@/components/SyncLogPanel';
import LeadDetailModal from '@/components/LeadDetailModal';

function extractFieldValue(val) {
  if (val === undefined || val === null || val === '') return '';
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

function extractField(record, slugs) {
  for (const slug of slugs) {
    const val = record[slug];
    if (val === undefined || val === null || val === '') continue;
    const extracted = extractFieldValue(val);
    if (extracted) return extracted;
  }
  return '';
}

// Find slug by matching label keywords
function findSlugByLabel(fieldLabels, keywords) {
  const entry = Object.entries(fieldLabels).find(([, label]) =>
    keywords.some(kw => label.toLowerCase().includes(kw.toLowerCase()))
  );
  return entry ? entry[0] : null;
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
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [fieldLabels, setFieldLabels] = useState({});

  // Search & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('lead_date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterZoho, setFilterZoho] = useState('all');
  const [filterSync, setFilterSync] = useState('all');

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(s => {
      if (s.length > 0) setSettings(s[0]);
    });
    base44.entities.SyncedRecord.list('-created_date', 1000).then(existing => {
      const map = {};
      existing.forEach(r => { map[r.smartsuite_id] = { id: r.id, sync_status: r.sync_status, zoho_lead_id: r.zoho_lead_id }; });
      setSyncStatuses(map);
      // Load historical records into the table on startup
      const historical = existing.map(r => ({
        smartsuite_id: r.smartsuite_id,
        name: r.name || (r.raw_data ? extractField(r.raw_data, ['s3430826e2', 'title', 'name', 'full_name', 'contact_name', 'Name']) : '') || r.smartsuite_id,
        email: r.email || '',
        phone: r.phone || '',
        company: r.company || '',
        city: r.city || '',
        smartsuite_status: r.smartsuite_status || '',
        lead_date: r.lead_date || (r.raw_data ? (r.raw_data.s9642641d7?.date || r.raw_data.first_created?.on) : null) || '',
        sync_status: r.sync_status || 'pending',
        zoho_lead_id: r.zoho_lead_id || '',
        raw_data: r.raw_data || {},
      }));
      setRecords(historical);
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
    if (res.data?.error || res.status === 429) {
      const msg = res.data?.error || 'Rate limit bereikt. Wacht even en probeer het opnieuw.';
      toast({ title: 'Fetch mislukt', description: msg, variant: 'destructive' });
      await logAction('fetch', 'error', msg, 0);
    } else {
      const items = res.data?.items || [];
      const fl = res.data?.fieldLabels || {};
      if (res.data?.fieldLabels) setFieldLabels(fl);

      // Dynamically find slugs by label keywords
      const citySlug = findSlugByLabel(fl, ['city', 'stad', 'woonplaats', 'gemeente', 'place', 'location', 'plaats']);
      const dateSlug = findSlugByLabel(fl, ['date', 'datum', 'lead date', 'created', 'aangemaakt', 'submission', 'inzending', 'ontvangen']);
      const emailSlug = findSlugByLabel(fl, ['email', 'e-mail', 'emailadres', 'mail']);
      const phoneSlug = findSlugByLabel(fl, ['phone', 'telefoon', 'mobile', 'mobiel', 'gsm', 'tel']);
      const companySlug = findSlugByLabel(fl, ['company', 'bedrijf', 'organization', 'organisatie', 'firma']);
      const nameSlug = findSlugByLabel(fl, ['name', 'naam', 'full name', 'contact name', 'voornaam']);

      console.log('Detected slugs:', { nameSlug, emailSlug, phoneSlug, companySlug, citySlug, dateSlug });

      const mapped = items.map(item => ({
        smartsuite_id: item.id,
        name: extractField(item, [...(nameSlug ? [nameSlug] : []), 's3430826e2', 'title', 'name', 'full_name', 'contact_name']),
        email: extractField(item, [...(emailSlug ? [emailSlug] : []), 's19d20e4c1', 's6299218c9', 'sf99925cfb', 'email', 'email_address']),
        phone: extractField(item, [...(phoneSlug ? [phoneSlug] : []), 'sc8d719ad3', 's0c5029009', 's2fc4c481d', 'phone', 'phone_number', 'mobile']),
        company: extractField(item, [...(companySlug ? [companySlug] : []), 'sfbbd03935', 's18939601b', 'company', 'company_name', 'organization']),
        city: extractField(item, [...(citySlug ? [citySlug] : []), 's778b5be05', 'city', 'stad', 'woonplaats', 'location']),
        smartsuite_status: extractField(item, ['status', 'lead_status', 'Status']),
        lead_date: (dateSlug ? extractFieldValue(item[dateSlug]) : '') || item.s9642641d7?.date || item.first_created?.on || '',
        sync_status: syncStatuses[item.id]?.sync_status || 'pending',
        raw_data: item,
      })).filter(r => r.phone && r.phone.startsWith('+31'));
      setRecords(mapped);
      toast({ title: 'Records geladen', description: `${mapped.length} records opgehaald. Zoho check bezig…` });
      await logAction('fetch', 'success', `Fetched ${mapped.length} records from SmartSuite`, mapped.length);

      // Persist fetched records to SyncedRecord so they load on next app start
      // Sequential small batches to avoid rate limits
      (async () => {
        const existing = await base44.entities.SyncedRecord.list('-created_date', 2000);
        const existingMap = {};
        existing.forEach(r => { existingMap[r.smartsuite_id] = r; });

        const toCreate = [];
        const toUpdate = [];

        mapped.forEach(r => {
          const { sync_status, raw_data, smartsuite_status, ...fields } = r;
          if (existingMap[r.smartsuite_id]) {
            toUpdate.push({ id: existingMap[r.smartsuite_id].id, data: { ...fields, raw_data, smartsuite_status } });
          } else {
            toCreate.push({ ...fields, raw_data, smartsuite_status, sync_status: 'pending' });
          }
        });

        // Bulk create new records in chunks of 50
        const CREATE_CHUNK = 50;
        for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
          await base44.entities.SyncedRecord.bulkCreate(toCreate.slice(i, i + CREATE_CHUNK));
          if (i + CREATE_CHUNK < toCreate.length) await new Promise(r => setTimeout(r, 300));
        }

        // Update existing records sequentially, 5 at a time
        const UPDATE_CHUNK = 5;
        for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
          const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
          await Promise.all(chunk.map(({ id, data }) => base44.entities.SyncedRecord.update(id, data)));
          if (i + UPDATE_CHUNK < toUpdate.length) await new Promise(r => setTimeout(r, 300));
        }
      })();

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
            zoho_exists: dupMap[r.smartsuite_id]?.exists_in_zoho ?? null,
            zoho_match: dupMap[r.smartsuite_id]?.matched_on || null,
          })));
          toast({ title: 'Klaar', description: `${mapped.length} records + Zoho check voltooid` });
        }
      } catch (_) {
        toast({ title: 'Zoho check mislukt', description: 'Records zijn geladen maar Zoho check kon niet worden uitgevoerd.', variant: 'destructive' });
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

    const existing = syncStatuses[rec.smartsuite_id];
    const { raw_data, ...payloadWithoutRaw } = rec;
    const payload = { 
      ...payloadWithoutRaw, 
      raw_data, 
      sync_status: newStatus, 
      sync_error: result?.success ? '' : (result?.message || ''), 
      zoho_lead_id: result?.zoho_id || rec.zoho_lead_id || '', 
      last_synced_at: new Date().toISOString(),
      ...(success && { zoho_exists: true, zoho_match: rec.email ? 'Email' : 'Phone' })
    };

    // Always look up the DB record to avoid "update undefined" errors
    const found = await base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id });
    if (found.length > 0) {
      await base44.entities.SyncedRecord.update(found[0].id, payload);
      setSyncStatuses(p => ({ ...p, [rec.smartsuite_id]: { id: found[0].id, sync_status: newStatus, zoho_lead_id: result?.zoho_id || '' } }));
    } else {
      const created = await base44.entities.SyncedRecord.create(payload);
      setSyncStatuses(p => ({ ...p, [rec.smartsuite_id]: { id: created.id, sync_status: newStatus, zoho_lead_id: result?.zoho_id || '' } }));
    }
    setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, sync_status: newStatus, ...(success && { zoho_exists: true, zoho_match: rec.email ? 'Email' : 'Phone' }) } : r));
    return { success, message: result?.message };
  }, [settings, syncStatuses]);

  const handleSyncOne = async (rec) => {
    setSyncingId(rec.smartsuite_id);
    const result = await doSync(rec);
    await logAction('sync', result?.success ? 'success' : 'error', result?.success ? `Synced "${rec.name}" to Zoho CRM` : `Failed syncing "${rec.name}": ${result?.message}`, 1);
    toast({ title: result?.success ? 'Gesynchroniseerd!' : 'Sync mislukt', description: result?.message || '', variant: result?.success ? 'default' : 'destructive' });
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!records.length) return;
    setSyncingAll(true);

    const CHUNK_SIZE = 50;
    const leadsToSync = records.map(rec => {
      const { sync_status, smartsuite_status, ...leadData } = rec;
      return leadData;
    });

    const resultMap = {};
    let successCount = 0, errorCount = 0;

    // Process in chunks of 50 to avoid timeouts
    for (let i = 0; i < leadsToSync.length; i += CHUNK_SIZE) {
      const chunk = leadsToSync.slice(i, i + CHUNK_SIZE);
      const res = await syncToZohoCRM({
        zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
        leads: chunk,
      });
      (res.data?.results || []).forEach(r => { resultMap[r.smartsuite_id] = r; });

      // Update UI progress after each chunk
      setRecords(prev => prev.map(r => {
        const u = resultMap[r.smartsuite_id];
        return u ? { ...r, sync_status: u.success ? 'synced' : 'error' } : r;
      }));

      // Respect Zoho rate limits - wait 2 seconds between chunks
      if (i + CHUNK_SIZE < leadsToSync.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const updates = records.map(rec => {
      const result = resultMap[rec.smartsuite_id];
      const newStatus = result?.success ? 'synced' : 'error';
      if (result?.success) successCount++; else errorCount++;
      return { rec, newStatus, result };
    });

    // Persist results sequentially in chunks to avoid rate limits
    const PERSIST_CHUNK = 5;
    for (let i = 0; i < updates.length; i += PERSIST_CHUNK) {
      const chunk = updates.slice(i, i + PERSIST_CHUNK);
      await Promise.all(chunk.map(async ({ rec, newStatus, result }) => {
        const existing = syncStatuses[rec.smartsuite_id];
        const payload = { ...rec, sync_status: newStatus, sync_error: result?.message || '', zoho_lead_id: result?.zoho_id || '', last_synced_at: new Date().toISOString() };
        if (existing) {
          await base44.entities.SyncedRecord.update(existing.id, payload);
        } else {
          await base44.entities.SyncedRecord.create(payload);
        }
      }));
      if (i + PERSIST_CHUNK < updates.length) await new Promise(r => setTimeout(r, 300));
    }

    const newStatuses = {};
    updates.forEach(({ rec, newStatus }) => { newStatuses[rec.smartsuite_id] = { sync_status: newStatus }; });
    setSyncStatuses(p => ({ ...p, ...newStatuses }));

    const status = errorCount === 0 ? 'success' : successCount === 0 ? 'error' : 'partial';
    await logAction('sync_all', status, `Sync all: ${successCount} succeeded, ${errorCount} failed`, records.length);
    toast({ title: 'Sync klaar', description: `${successCount} gesynchroniseerd, ${errorCount} mislukt` });
    setSyncingAll(false);
  };

  const handleSaveNotes = async (rec, notes) => {
    const { raw_data, ...leadData } = rec;
    const result = await doSync({ ...leadData, notes, raw_data });
    toast({ title: result?.success ? 'Opmerking gesynchroniseerd!' : 'Sync mislukt', description: result?.message || '', variant: result?.success ? 'default' : 'destructive' });
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
    toast({ title: 'Status bijgewerkt', description: `"${rec.name}" → ${newStatus}` });
  };

  // Filtered + sorted records
  const displayedRecords = useMemo(() => {
    let filtered = [...records];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').includes(q) ||
        (r.company || '').toLowerCase().includes(q)
      );
    }

    if (filterZoho !== 'all') {
      if (filterZoho === 'exists') filtered = filtered.filter(r => r.zoho_exists === true);
      if (filterZoho === 'new') filtered = filtered.filter(r => r.zoho_exists === false);
      if (filterZoho === 'unknown') filtered = filtered.filter(r => r.zoho_exists === null || r.zoho_exists === undefined);
    }

    if (filterSync !== 'all') {
      filtered = filtered.filter(r => r.sync_status === filterSync);
    }

    filtered.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [records, searchQuery, sortField, sortDir, filterZoho, filterSync]);

  const stats = [
    { label: 'Totaal', value: records.length, icon: Users, color: 'text-primary' },
    { label: 'Gesynchroniseerd', value: records.filter(r => r.sync_status === 'synced').length, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'In behandeling', value: records.filter(r => r.sync_status === 'pending').length, icon: RefreshCw, color: 'text-amber-500' },
    { label: 'Fouten', value: records.filter(r => r.sync_status === 'error').length, icon: AlertCircle, color: 'text-red-500' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lead Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Synchroniseer leads van SmartSuite naar Zoho CRM</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleFetch} disabled={fetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Ophalen…' : 'Ophalen uit SmartSuite'}
          </Button>
          <Button onClick={handleSyncAll} disabled={syncingAll || records.length === 0} className="gap-2">
            <Zap className="w-4 h-4" />
            {syncingAll ? 'Synchroniseren…' : 'Alles synchroniseren'}
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">SmartSuite Records ({displayedRecords.length}/{records.length})</CardTitle>
          </div>

          {/* Search & Filter bar */}
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Zoek op naam, email, telefoon, bedrijf…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filterZoho} onValueChange={setFilterZoho}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="In Zoho?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle (Zoho)</SelectItem>
                <SelectItem value="exists">Bestaand in Zoho</SelectItem>
                <SelectItem value="new">Nieuw in Zoho</SelectItem>
                <SelectItem value="unknown">Onbekend</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSync} onValueChange={setFilterSync}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="Sync status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="pending">In behandeling</SelectItem>
                <SelectItem value="synced">Gesynchroniseerd</SelectItem>
                <SelectItem value="error">Fout</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortField}_${sortDir}`} onValueChange={v => { const [f, d] = v.split('_'); setSortField(f); setSortDir(d); }}>
              <SelectTrigger className="h-8 text-xs w-44">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Sorteren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead_date_desc">Datum (nieuwste eerst)</SelectItem>
                <SelectItem value="lead_date_asc">Datum (oudste eerst)</SelectItem>
                <SelectItem value="name_asc">Naam (A→Z)</SelectItem>
                <SelectItem value="name_desc">Naam (Z→A)</SelectItem>
                <SelectItem value="company_asc">Bedrijf (A→Z)</SelectItem>
                <SelectItem value="sync_status_asc">Sync status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nog geen records. Klik op "Ophalen uit SmartSuite" om data te laden.</p>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Geen records gevonden voor deze zoekopdracht.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-y border-border text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium">Naam</th>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap">Datum</th>
                    <th className="px-4 py-2.5 text-left font-medium">Email</th>
                    <th className="px-4 py-2.5 text-left font-medium">Telefoon</th>
                    <th className="px-4 py-2.5 text-left font-medium">Bedrijf</th>
                    <th className="px-4 py-2.5 text-left font-medium">Plaats</th>
                    <th className="px-4 py-2.5 text-left font-medium">In Zoho?</th>
                    <th className="px-4 py-2.5 text-left font-medium">Sync Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">SmartSuite Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedRecords.map(rec => (
                    <RecordRow
                      key={rec.smartsuite_id}
                      record={rec}
                      onSync={handleSyncOne}
                      onStatusSave={handleStatusSave}
                      onViewDetail={setSelectedRecord}
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

      {/* Lead Detail Modal */}
      <LeadDetailModal
        record={selectedRecord}
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
        fieldLabels={fieldLabels}
        onSaveNotes={handleSaveNotes}
      />
    </div>
  );
}