import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Save, Eye, EyeOff, Settings2, CheckCircle2 } from 'lucide-react';

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
    zoho_api_domain: 'https://www.zohoapis.eu',
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
          zoho_api_domain: s.zoho_api_domain || 'https://www.zohoapis.eu',
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
          <Field label="Account ID" name="smartsuite_account_id" placeholder="e.g. abc123" />
          <Field label="Solution ID" name="smartsuite_solution_id" placeholder="e.g. sol_abc123" />
          <Field label="Table ID" name="smartsuite_table_id" placeholder="e.g. tbl_abc123" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zoho CRM</CardTitle>
          <CardDescription>Zoho authenticates automatisch via de opgeslagen secrets (Client ID, Client Secret, Refresh Token)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Zoho secrets zijn geconfigureerd. Tokens worden automatisch vernieuwd.
          </div>
          <Field label="API Domain" name="zoho_api_domain" placeholder="https://www.zohoapis.eu" />
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