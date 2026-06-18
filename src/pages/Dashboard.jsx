import { useState, useEffect, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchSmartSuiteRecords } from '@/functions/fetchSmartSuiteRecords';
import { syncToZohoCRM } from '@/functions/syncToZohoCRM';
import { checkZohoDuplicates } from '@/functions/checkZohoDuplicates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Zap, Users, CheckCircle2, AlertCircle, Search, ArrowUpDown, Calendar } from 'lucide-react';
import RecordRow from '@/components/RecordRow';
import SyncLogPanel from '@/components/SyncLogPanel';
import LeadDetailModal from '@/components/LeadDetailModal';

export default function Dashboard() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);
  const [syncStatuses, setSyncStatuses] = useState({});
  const [fetching, setFetching] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [fieldLabels, setFieldLabels] = useState({});

  // Search & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('lead_date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterZoho, setFilterZoho] = useState('all');
  const [filterSync, setFilterSync] = useState('all');
  const [showAllCountries, setShowAllCountries] = useState(false);

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(s => {
      if (s.length > 0) setSettings(s[0]);
    });
    base44.entities.SyncedRecord.list('-created_date', 1000).then(existing => {
      const map = {};
      existing.forEach(r => { map[r.smartsuite_id] = { id: r.id, sync_status: r.sync_status, zoho_lead_id: r.zoho_lead_id }; });
      setSyncStatuses(map);
      // Load historical records into the table on startup
      const historical = existing.map(r => {
        // Fallback: extract phone_country/e164 from raw_data if not yet stored
        const phoneCountry = r.phone_country || r.raw_data?.s2fc4c481d?.[0]?.phone_country || '';
        const phoneE164 = r.phone_e164 || (typeof r.raw_data?.s0c5029009 === 'string' ? r.raw_data.s0c5029009 : r.raw_data?.s0c5029009?.sys_title) || '';
        return {
          smartsuite_id: r.smartsuite_id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          name: r.name || r.smartsuite_id,
          email: r.email || '',
          phone: r.phone || '',
          phone_country: phoneCountry,
          phone_e164: phoneE164,
          company: r.company || '',
          city: r.city || '',
          smartsuite_status: r.smartsuite_status || '',
          lead_date: r.lead_date || '',
          sync_status: r.sync_status || 'pending',
          zoho_lead_id: r.zoho_lead_id || '',
          raw_data: r.raw_data || {},
        };
      });
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
    
    // Sync local Zoho contacts first (with cooldown to avoid rate limits)
    try {
      const syncResult = await base44.functions.invoke('syncZohoContactsLocal', {});
      if (!syncResult.data?.skipped) {
        console.log('Zoho contacts synced');
      }
    } catch (e) {
      // Silently ignore - this is a background sync that shouldn't block the fetch
      console.debug('Zoho contact sync skipped or rate limited');
    }
    
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

      // Helper: get string from SmartSuite field value
      function ssStr(val) {
        if (val === undefined || val === null || val === '') return '';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) {
          const first = val[0];
          if (!first) return '';
          if (typeof first === 'string') return first;
          return first.sys_title || first.phone_number || first.value || first.name || '';
        }
        if (typeof val === 'object') {
          return val.location_city || val.sys_title || val.value || val.date || '';
        }
        return String(val);
      }

      const mapped = items.map(item => {
        const r = item; // shorthand

        const firstName = (r.s3430826e2?.first_name) || ssStr(r.s527015a79) || '';
        const lastName = r.s3430826e2?.last_name || '';
        const fullName = firstName && lastName
          ? `${firstName} ${lastName}`
          : (firstName || lastName || ssStr(r.title) || ssStr(r.name) || ssStr(r.full_name) || r.id);

        const email = ssStr(r.s19d20e4c1) || r.email || '';
        const phone = r.s2fc4c481d?.[0]?.sys_title || '';
        const phoneCountry = r.s2fc4c481d?.[0]?.phone_country || '';
        const phoneE164 = typeof r.s0c5029009 === 'string' ? r.s0c5029009 : (r.s0c5029009?.sys_title || '');
        const city = r.s778b5be05?.location_city || '';
        const smartsuiteStatus = r.status?.value || '';
        const leadDate = r.s0ad5216a6?.date || r.s9bafef72f?.date || r.first_created?.on || '';

        return {
          smartsuite_id: r.id,
          first_name: firstName,
          last_name: lastName,
          name: fullName,
          email,
          phone,
          phone_country: phoneCountry,
          phone_e164: phoneE164,
          company: '',
          city,
          smartsuite_status: smartsuiteStatus,
          lead_date: leadDate,
          sync_status: syncStatuses[r.id]?.sync_status || 'pending',
          raw_data: r,
        };
      });
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
          // fields now includes first_name, last_name, name, email, phone, company, city, lead_date
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

  const handleSyncOne = async (rec) => {
    setSyncingId(rec.smartsuite_id);
    try {
      // Strip raw_data and UI-only fields before sending to Zoho
      const { raw_data, sync_status, smartsuite_status, zoho_exists, zoho_match, lead_date, ...cleanLead } = rec;
      const res = await syncToZohoCRM({
        zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
        leads: [cleanLead],
      });
      const result = res.data?.results?.[0];
      const success = result?.success;
      const zohoId = result?.zoho_id || rec.zoho_lead_id || '';

      const found = await base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id });
      const updatePayload = { 
        sync_status: success ? 'synced' : 'error',
        sync_error: success ? '' : (result?.message || ''),
        zoho_lead_id: zohoId,
        last_synced_at: new Date().toISOString(),
      };
      if (found.length > 0) {
        await base44.entities.SyncedRecord.update(found[0].id, updatePayload);
        setSyncStatuses(p => ({ ...p, [rec.smartsuite_id]: { ...p[rec.smartsuite_id], sync_status: updatePayload.sync_status, zoho_lead_id: zohoId } }));
      }
      setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, sync_status: updatePayload.sync_status, ...(success && { zoho_exists: true, zoho_match: rec.email ? 'Email' : 'Phone' }) } : r));
      await logAction('sync', success ? 'success' : 'error', success ? `Gesynchroniseerd naar Zoho: "${rec.name}"` : `Zoho sync mislukt: ${result?.message}`, 1);
      toast({ title: success ? 'Gesynchroniseerd!' : 'Sync mislukt', description: success ? `"${rec.name}" → Zoho CRM` : result?.message || '', variant: success ? 'default' : 'destructive' });
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Netwerkfout';
      await logAction('sync', 'error', `Sync error voor "${rec.name}": ${msg}`, 1);
      toast({ title: 'Sync mislukt', description: msg, variant: 'destructive' });
    }
    setSyncingId(null);
  };

  const handleSyncAll = async () => {
    if (!records.length) return;
    setSyncingAll(true);

    const CHUNK_SIZE = 50;
    let successCount = 0, errorCount = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const cleanLeads = chunk.map(rec => {
        const { raw_data, sync_status, smartsuite_status, zoho_exists, zoho_match, lead_date, ...clean } = rec;
        return clean;
      });

      const res = await syncToZohoCRM({
        zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
        leads: cleanLeads,
      });

      const results = res.data?.results || [];
      results.forEach((result, idx) => {
        const rec = cleanLeads[idx];
        if (!rec) return;
        const success = result?.success;
        if (success) {
          successCount++;
          base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id }).then(found => {
            if (found.length > 0) {
              base44.entities.SyncedRecord.update(found[0].id, { 
                sync_status: 'synced', zoho_lead_id: result.zoho_id || '', last_synced_at: new Date().toISOString() 
              });
            }
          });
        } else {
          errorCount++;
          base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id }).then(found => {
            if (found.length > 0) {
              base44.entities.SyncedRecord.update(found[0].id, { sync_status: 'error', sync_error: result?.message || '' });
            }
          });
        }
      });

      // Update UI
      setRecords(prev => prev.map(r => {
        const match = results.find((res, idx) => cleanLeads[idx]?.smartsuite_id === r.smartsuite_id);
        if (match?.success) return { ...r, sync_status: 'synced', zoho_exists: true, zoho_match: r.email ? 'Email' : 'Phone' };
        if (match && !match.success) return { ...r, sync_status: 'error' };
        return r;
      }));

      if (i + CHUNK_SIZE < records.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const status = errorCount === 0 ? 'success' : successCount === 0 ? 'error' : 'partial';
    await logAction('sync_all', status, `Sync all naar Zoho: ${successCount} gelukt, ${errorCount} mislukt`, records.length);
    toast({ title: 'Sync klaar', description: `${successCount} → Zoho CRM${errorCount > 0 ? `, ${errorCount} mislukt` : ''}` });
    setSyncingAll(false);
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    toast({ title: 'Backfill gestart', description: 'lead_date wordt ingevuld uit opgeslagen raw_data… dit kan even duren.' });
    try {
      const res = await base44.functions.invoke('backfillLeadDates', {});
      const data = res.data;
      if (data?.ok) {
        toast({ title: 'Backfill voltooid', description: data.message });
        setLogRefresh(p => p + 1);
      } else {
        toast({ title: 'Backfill mislukt', description: data?.error || 'Onbekende fout', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Backfill mislukt', description: e.message || 'Netwerkfout', variant: 'destructive' });
    }
    setBackfilling(false);
  };

  const handleSaveNotes = async (rec, notes) => {
    try {
      const { raw_data, sync_status, smartsuite_status, zoho_exists, zoho_match, lead_date, ...cleanLead } = rec;
      const res = await syncToZohoCRM({
        zoho_api_domain: settings?.zoho_api_domain || 'https://www.zohoapis.eu',
        leads: [{ ...cleanLead, notes }],
      });
      const result = res.data?.results?.[0];
      const success = result?.success;

      const found = await base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id });
      if (found.length > 0) {
        await base44.entities.SyncedRecord.update(found[0].id, { 
          sync_status: success ? 'synced' : 'error',
          zoho_lead_id: result?.zoho_id || rec.zoho_lead_id || '',
          last_synced_at: new Date().toISOString(),
        });
        setSyncStatuses(p => ({ ...p, [rec.smartsuite_id]: { ...p[rec.smartsuite_id], sync_status: success ? 'synced' : 'error' } }));
      }
      setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, sync_status: success ? 'synced' : 'error' } : r));
      toast({ title: success ? 'Opmerking gesynchroniseerd!' : 'Opslaan mislukt', description: success ? 'Opmerking naar Zoho CRM' : result?.message || '', variant: success ? 'default' : 'destructive' });
    } catch (e) {
      toast({ title: 'Opslaan mislukt', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    }
  };

  const handleStatusSave = async (rec, newStatus) => {
    try {
      const found = await base44.entities.SyncedRecord.filter({ smartsuite_id: rec.smartsuite_id });
      if (found.length > 0) {
        await base44.entities.SyncedRecord.update(found[0].id, { smartsuite_status: newStatus });
      }
      setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, smartsuite_status: newStatus } : r));
      toast({ title: 'Status bijgewerkt', description: `"${rec.name}" → ${newStatus}` });
    } catch (e) {
      toast({ title: 'Status opslaan mislukt', description: e.message, variant: 'destructive' });
    }
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

    // Default: only Netherlands (+31) unless "Show all" is toggled
    if (!showAllCountries) {
      filtered = filtered.filter(r => r.phone_country === 'NL');
    }

    filtered.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [records, searchQuery, sortField, sortDir, filterZoho, filterSync, showAllCountries]);

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
          <Button variant="outline" onClick={handleBackfill} disabled={backfilling} className="gap-2">
            <Calendar className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
            {backfilling ? 'Backfill…' : 'Backfill datums'}
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
            <Button
              variant={showAllCountries ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAllCountries(p => !p)}
              className="h-8 text-xs gap-1"
            >
              {showAllCountries ? '🌍 Alle landen (aan)' : '🇳🇱 Alleen NL'}
            </Button>
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