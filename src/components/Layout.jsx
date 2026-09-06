import { Link, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, RefreshCw, Globe, Inbox, Megaphone } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { separator: 'channels' },
  { path: '/meta', label: 'Meta', icon: Megaphone },
  { path: '/website', label: 'Website', icon: Globe },
  { path: '/smartsuite', label: 'SmartSuite', icon: Inbox },
  { separator: 'settings' },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground leading-tight">BMC Sales tool</p>
              <p className="text-xs text-muted-foreground">Leads en verkoop</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon, separator }) => {
            if (separator) return <div key={separator} role="separator" className="!my-3 border-t border-border" />;
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">BMC Sales tool</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}