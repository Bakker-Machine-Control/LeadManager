import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { fetchZohoActivities } from '@/functions/fetchZohoActivities';
import { updateZohoActivityStatus } from '@/functions/updateZohoActivityStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { CalendarDays, RefreshCw, Video, CheckSquare, Clock, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const MEETING_STATUSES = ['Open', 'Held', 'Not Held'];
const TASK_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Deferred'];

function StatusBadge({ status }) {
  const colors = {
    'Open': 'bg-blue-100 text-blue-700 border-blue-200',
    'Held': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Not Held': 'bg-gray-100 text-gray-500 border-gray-200',
    'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
    'Not Started': 'bg-gray-100 text-gray-500 border-gray-200',
    'Deferred': 'bg-red-100 text-red-600 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status || 'Unknown'}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
      type === 'Meeting' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-accent/10 text-accent border-accent/20'
    }`}>
      {type === 'Meeting' ? <Video className="w-3 h-3" /> : <CheckSquare className="w-3 h-3" />}
      {type}
    </span>
  );
}

function ActivityCard({ item, onStatusUpdate, updatingId }) {
  const [selectedStatus, setSelectedStatus] = useState(item.Status || '');
  const statuses = item._type === 'Meeting' ? MEETING_STATUSES : TASK_STATUSES;
  const dateStr = item.Start_DateTime || item.Due_Date;
  const formattedDate = dateStr ? (() => { try { return format(parseISO(dateStr), 'MMM d, yyyy HH:mm'); } catch { return dateStr; } })() : '—';
  const isUpdating = updatingId === item.id;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-foreground leading-snug">{item.Subject || '(No title)'}</p>
          <TypeBadge type={item._type} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {dateStr && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formattedDate}
            </span>
          )}
          {item.Contact_Name && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {typeof item.Contact_Name === 'object' ? item.Contact_Name.name : item.Contact_Name}
            </span>
          )}
        </div>
        {item.Description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.Description}</p>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <StatusBadge status={item.Status} />
          <div className="flex-1" />
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStatusUpdate(item, selectedStatus)}
            disabled={isUpdating || !selectedStatus || selectedStatus === item.Status}
            className="h-7 text-xs gap-1"
          >
            {isUpdating && <RefreshCw className="w-3 h-3 animate-spin" />}
            Update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Activities() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: 'main' }).then(s => {
      if (s.length > 0) setSettings(s[0]);
    });
  }, []);

  const handleFetch = async () => {
    if (!settings?.zoho_access_token) {
      toast({ title: 'Missing Zoho token', description: 'Add your Zoho access token in Settings.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const res = await fetchZohoActivities({
      zoho_access_token: settings.zoho_access_token,
      zoho_api_domain: settings.zoho_api_domain,
    });
    if (res.data?.error) {
      toast({ title: 'Fetch failed', description: res.data.error, variant: 'destructive' });
    } else {
      setMeetings(res.data?.meetings || []);
      setTasks(res.data?.tasks || []);
      toast({ title: 'Loaded', description: `${res.data?.meetings?.length || 0} meetings, ${res.data?.tasks?.length || 0} tasks` });
    }
    setLoading(false);
  };

  const handleStatusUpdate = async (item, newStatus) => {
    if (!settings?.zoho_access_token || !newStatus) return;
    setUpdatingId(item.id);
    const module = item._type === 'Meeting' ? 'Meetings' : 'Tasks';
    const res = await updateZohoActivityStatus({
      zoho_access_token: settings.zoho_access_token,
      zoho_api_domain: settings.zoho_api_domain,
      record_id: item.id,
      module,
      status: newStatus,
    });
    if (res.data?.error) {
      toast({ title: 'Update failed', description: res.data.error, variant: 'destructive' });
    } else {
      // Update local state
      if (item._type === 'Meeting') {
        setMeetings(prev => prev.map(m => m.id === item.id ? { ...m, Status: newStatus } : m));
      } else {
        setTasks(prev => prev.map(t => t.id === item.id ? { ...t, Status: newStatus } : t));
      }
      toast({ title: 'Status updated', description: `"${item.Subject}" → ${newStatus}` });
    }
    setUpdatingId(null);
  };

  const all = [...meetings, ...tasks].sort((a, b) => {
    const da = a.Start_DateTime || a.Due_Date || '';
    const db = b.Start_DateTime || b.Due_Date || '';
    return da.localeCompare(db);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            Tasks & Meetings
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">View and update Zoho CRM activities</p>
        </div>
        <Button onClick={handleFetch} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Fetch from Zoho CRM'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Meetings', value: meetings.length, color: 'text-primary' },
          { label: 'Held', value: meetings.filter(m => m.Status === 'Held').length, color: 'text-emerald-500' },
          { label: 'Open Meetings', value: meetings.filter(m => m.Status === 'Open').length, color: 'text-amber-500' },
          { label: 'Total Tasks', value: tasks.length, color: 'text-accent' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="meetings">Meetings ({meetings.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
        </TabsList>

        {[
          { value: 'all', items: all },
          { value: 'meetings', items: meetings },
          { value: 'tasks', items: tasks },
        ].map(({ value, items }) => (
          <TabsContent key={value} value={value}>
            {items.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No activities. Click "Fetch from Zoho CRM" to load data.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                {items.map(item => (
                  <ActivityCard
                    key={`${item._type}-${item.id}`}
                    item={item}
                    onStatusUpdate={handleStatusUpdate}
                    updatingId={updatingId}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}