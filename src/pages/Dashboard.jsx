import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchSmartSuiteRecords } from '@/functions/fetchSmartSuiteRecords';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Users, Search, ArrowUpDown, Calendar } from 'lucide-react';
import RecordRow from '@/components/RecordRow';
import SyncLogPanel from '@/components/SyncLogPanel';
import LeadDetailModal from '@/components/LeadDetailModal';

export default function Dashboard() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [records, setRecords] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [fieldLabels, setFieldLabels] = useState({});

  // Search & sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('lead_date');
  const [sortDir, setSortDir] = useState('desc');
  const [showAllCountries, setShowAllCountries] = useState(false);

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(s => {
      if (s.length > 0) setSettings(s[0]);
    });
    base44.entities.Lead.list('-created_date', 1000).then(existing => {
      // Load historical records into the table on startup
      const historical = existing.map(r => {
        // Fallback: extract phone_country/e164 from raw_data if not yet stored
        const phoneCountry = r.phone_country || r.raw_data?.s2fc4c481d?.[0]?.phone_country || '';
        const phoneE164 = r.phone_e164 || (typeof r.raw_data?.s0c5029009 === 'string' ? r.raw_data.s0c5029009 : r.raw_data?.s0c5029009?.sys_title) || '';
        const company = r.company || (typeof r.raw_data?.sfbbd03935 === 'string' ? r.raw_data.sfbbd03935 : r.raw_data?.sfbbd03935?.value) || '';
        return {
          smartsuite_id: r.smartsuite_id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          name: r.name || r.smartsuite_id,
          email: r.email || '',
          phone: r.phone || '',
          phone_country: phoneCountry,
          phone_e164: phoneE164,
          company,
          city: r.city || '',
          smartsuite_status: r.smartsuite_status || '',
          status: r.status || 'nieuw',
          bron: r.bron || 'smartsuite',
          lead_date: r.lead_date || '',
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
      if (res.data?.fieldLabels) setFieldLabels(res.data.fieldLabels);

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
        const company = ssStr(r.sfbbd03935);
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
          company,
          city,
          smartsuite_status: smartsuiteStatus,
          status: 'nieuw',
          bron: 'smartsuite',
          lead_date: leadDate,
          raw_data: r,
        };
      });
      setRecords(mapped);
      toast({ title: 'Records geladen', description: `${mapped.length} records opgehaald.` });
      await logAction('fetch', 'success', `Fetched ${mapped.length} records from SmartSuite`, mapped.length);

      // Persist fetched records to SyncedRecord so they load on next app start
      // Sequential small batches to avoid rate limits
      (async () => {
        const existing = await base44.entities.Lead.list('-created_date', 2000);
        const existingMap = {};
        existing.forEach(r => { existingMap[r.smartsuite_id] = r; });

        const toCreate = [];
        const toUpdate = [];

        mapped.forEach(r => {
          // Werkstatus (status/bron) hoort bij de opvolging hier, niet bij de SmartSuite-instroom:
          // bij bestaande leads alleen de instroomvelden bijwerken, bij nieuwe leads status 'nieuw' + bron 'smartsuite' zetten
          const { raw_data, smartsuite_status, status, bron, ...fields } = r;
          if (existingMap[r.smartsuite_id]) {
            toUpdate.push({ id: existingMap[r.smartsuite_id].id, data: { ...fields, raw_data, smartsuite_status } });
          } else {
            toCreate.push({ ...fields, status, bron, raw_data, smartsuite_status });
          }
        });

        // Bulk create new records in chunks of 50
        const CREATE_CHUNK = 50;
        for (let i = 0; i < toCreate.length; i += CREATE_CHUNK) {
          await base44.entities.Lead.bulkCreate(toCreate.slice(i, i + CREATE_CHUNK));
          if (i + CREATE_CHUNK < toCreate.length) await new Promise(r => setTimeout(r, 300));
        }

        // Update existing records sequentially, 5 at a time
        const UPDATE_CHUNK = 5;
        for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
          const chunk = toUpdate.slice(i, i + UPDATE_CHUNK);
          await Promise.all(chunk.map(({ id, data }) => base44.entities.Lead.update(id, data)));
          if (i + UPDATE_CHUNK < toUpdate.length) await new Promise(r => setTimeout(r, 300));
        }
      })();
    }
    setFetching(false);
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

  const handleStatusSave = async (rec, newStatus) => {
    try {
      const found = await base44.entities.Lead.filter({ smartsuite_id: rec.smartsuite_id });
      if (found.length > 0) {
        await base44.entities.Lead.update(found[0].id, { status: newStatus });
      }
      setRecords(prev => prev.map(r => r.smartsuite_id === rec.smartsuite_id ? { ...r, status: newStatus } : r));
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
  }, [records, searchQuery, sortField, sortDir, showAllCountries]);

  const stats = [
    { label: 'Totaal', value: records.length, icon: Users, color: 'text-primary' },
    { label: 'Nederland (+31)', value: records.filter(r => r.phone_country === 'NL').length, icon: Users, color: 'text-accent' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lead Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Leads uit SmartSuite, centraal beschikbaar in Base44</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleFetch} disabled={fetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Ophalen…' : 'Ophalen uit SmartSuite'}
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
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedRecords.map(rec => (
                    <RecordRow
                      key={rec.smartsuite_id}
                      record={rec}
                      onStatusSave={handleStatusSave}
                      onViewDetail={setSelectedRecord}
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
      />
    </div>
  );
}