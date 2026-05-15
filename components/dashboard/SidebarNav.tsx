'use client';

import {
  BookOpenIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  PhoneIcon,
  SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export type NavIconName = 'dashboard' | 'calls' | 'kb' | 'settings' | 'simulate';

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  calls: PhoneIcon,
  kb: BookOpenIcon,
  settings: SettingsIcon,
  simulate: FlaskConicalIcon,
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
