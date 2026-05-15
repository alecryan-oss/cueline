import { cookies } from 'next/headers';

import { Logo } from '@/components/brand/Logo';
import { SidebarNav, type NavItem } from '@/components/dashboard/SidebarNav';
import { ThemeToggle } from '@/components/theme-toggle';
import { createServerClient } from '@/lib/db/client';
import { env } from '@/lib/env';
import { requireTenant } from '@/lib/tenant/context';

import { HeaderMenu } from './header-menu';

const BASE_NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard' },
  { href: '/calls', label: 'Calls', icon: 'calls' },
  { href: '/kb', label: 'Knowledge base', icon: 'kb' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const MOCK_NAV_ITEM: NavItem = { href: '/calls/simulate', label: 'Mock calls', icon: 'simulate' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenantId } = await requireTenant();

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  const [{ data: userData }, { data: tenant }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ]);

  const email = userData.user?.email ?? '';
  const tenantName = tenant?.name ?? 'Workspace';

  const showMockLink = env.NODE_ENV === 'development' && env.ENABLE_MOCK_CALLS === 'true';
  const navItems = showMockLink ? [...BASE_NAV_ITEMS, MOCK_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <Logo size="md" />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav items={navItems} />
        </div>
        <div className="border-t p-3">
          <p className="truncate px-2 text-xs text-muted-foreground" title={tenantName}>
            {tenantName}
          </p>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
          <div className="text-sm text-muted-foreground">{tenantName}</div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <HeaderMenu email={email} tenantName={tenantName} />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
