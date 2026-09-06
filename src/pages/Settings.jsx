import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Save, Eye, EyeOff, Settings2, Search } from 'lucide-react';
import { discoverSmartSuiteTableIds } from '@/functions/discoverSmartSuiteTableIds';

export default function Settings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTokens, setShowTokens] = useState({});
  const [settingsId, setSettingsId] = useState(null);
  const [form, setForm] = useState({
    smartsuite_api_token: '',
    smartsuite_account_id: '',
    smartsuite_solution_id: '',
    smartsuite_table_id: '',
    lead_webhook_key: '',
  });

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(records => {
      if (records.length > 0) {
        const s = records[0];
        setSettingsId(s.id);
        setForm({
          smartsuite_api_token: s.smartsuite_api_token || '',
          smartsuite_account_id: s.smartsuite_account_id || '',
          smartsuite_solution_id: s.smartsuite_solution_id || '',
          smartsuite_table_id: s.smartsuite_table_id || '',
          lead_webhook_key: s.lead_webhook_key || '',
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    if (settingsId) {
      await base44.entities.AppSettings.update(settingsId, { ...form });
    } else {
      const created = await base44.entities.AppSettings.create({ key: 'main', ...form });
      setSettingsId(created.id);
    }
    setSaving(false);
    toast({ title: 'Settings saved', description: 'Your credentials have been saved.' });
  };

  const toggleShow = (field) => setShowTokens(p => ({ ...p, [field]: !p[field] }));

  const [discovering, setDiscovering] = useState(false);

  const handleDiscover = async () => {
    if (!form.smartsuite_api_token || !form.smartsuite_account_id) {
      toast({ title: 'Fout', description: 'Vul eerst API Token en Account ID in', variant: 'destructive' });
      return;
    }
    setDiscovering(true);
    try {
      const res = await discoverSmartSuiteTableIds({
        api_token: form.smartsuite_api_token,
        account_id: form.smartsuite_account_id,
      });
      setDiscovering(false);
      if (res.data?.solution_id) {
        setForm(p => ({ ...p, smartsuite_solution_id: res.data.solution_id, smartsuite_table_id: res.data.table_id }));
        toast({ title: 'Gevonden!', description: `Solution: ${res.data.solution_id}\nTable: ${res.data.table_id}` });
      } else {
        toast({ title: 'Niet gevonden', description: res.data?.error || 'Lead Bridge tabel niet gevonden', variant: 'destructive' });
      }
    } catch (error) {
      setDiscovering(false);
      const errorMsg = error.response?.data?.error || error.message || 'Fout bij zoeken';
      toast({ title: 'Fout', description: errorMsg, variant: 'destructive' });
    }
  };

  const Field = ({ label, name, placeholder, secret }) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          id={name}
          type={secret && !showTokens[name] ? 'password' : 'text'}
          placeholder={placeholder}
          value={form[name]}
          onChange={e => setForm(p => ({ ...p, [name]: e.target.value }))}
          className="pr-10"
        />
        {secret && (
          <button
            type="button"
            onClick={() => toggleShow(name)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showTokens[name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">

      {/* Project Description */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">FlowBridge Sync — SmartSuite lead-hub</CardTitle>
          <CardDescription className="text-sm">Haalt leads uit SmartSuite op, toont ze in dit dashboard en stelt ze via een read-only API beschikbaar voor andere BMC-apps.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="font-semibold mb-1">Architectuur (waarom via een Mac)</h3>
            <p className="text-muted-foreground">
              SmartSuite blokkeert het server-IP van base44 (sinds ongeveer april 2026), dus base44 kan niet zelf ophalen.
              Het ophalen loopt daarom via een vaste machine (Mac Studio, IP <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">209.198.140.208</code> — dit IP moet in SmartSuite gewhitelist staan).
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Hoe de datastroom werkt</h3>
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">Fetch (Mac):</strong> launchd-taak <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">com.bmc.leadbridge</code> draait dagelijks om 07:30,
                script <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">~/leadbridge/smartsuite-to-base44.mjs</code>.
                Haalt alle records op (paginatie van 200) en POST ze in batches van 100 naar de webhook (voorkomt 429 rate-limit).
              </li>
              <li>
                <strong className="text-foreground">Webhook (smartsuiteWebhookReceiver):</strong> upsert op smartsuite_id naar SyncedRecord.
                Mapping uit SmartSuite raw_data: naam, e-mail, telefoon (incl. landcode en E164-nummer), bedrijf, plaats, lead_date en smartsuite_status.
              </li>
              <li>
                <strong className="text-foreground">Dashboard:</strong> toont de leads, standaard gefilterd op +31 (Nederland); met een toggle om alle landen te tonen.
              </li>
              <li>
                <strong className="text-foreground">Hub API (hubGetLeads):</strong> read-only endpoint waarmee andere BMC-apps leads kunnen opvragen — authenticatie via de <code className="bg-muted px-1 rounded text-xs">x-hub-api-key</code> header, vergelijkt telefoonnummers op de laatste 9 cijfers.
              </li>
              <li>
                <strong className="text-foreground">Backfill-knop:</strong> vult lead_date en landcode op bestaande records uit de al opgeslagen raw_data.
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-primary" /> Settings
        </h1>
        <p className="text-muted-foreground mt-1">Configure your API credentials</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SmartSuite Configuration</CardTitle>
          <CardDescription>Connect to your SmartSuite workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="API Token" name="smartsuite_api_token" placeholder="Enter SmartSuite API token" secret />
          <Field label="Account ID" name="smartsuite_account_id" placeholder="e.g. skjergrg" />
          <div className="flex gap-2">
            <Button onClick={handleDiscover} disabled={discovering || !form.smartsuite_api_token || !form.smartsuite_account_id} className="gap-2" variant="outline">
              <Search className="w-4 h-4" />
              {discovering ? 'Zoeken…' : 'Find Lead Bridge'}
            </Button>
          </div>
          <Field label="Solution ID" name="smartsuite_solution_id" placeholder="e.g. sol_abc123" />
          <Field label="Table ID" name="smartsuite_table_id" placeholder="e.g. tbl_abc123" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Webhook</CardTitle>
          <CardDescription>Geheime sleutel waarmee SmartSuite leads naar de webhook pusht (?secret=…). Leeg = webhook weigert alles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Webhook Key" name="lead_webhook_key" placeholder="Geheime sleutel voor de lead-webhook" secret />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}