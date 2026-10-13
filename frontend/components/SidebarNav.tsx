'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  CircleUser,
  LayoutDashboard,
  ListTodo,
  Settings,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NAV_GROUPS, isActiveNavItem } from '../lib/nav';

const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/tasks': ListTodo,
  '/my-tasks': CircleUser,
  '/goals': Target,
  '/team': Users,
  '/activity': Activity,
  '/settings': Settings,
};

/**
 * The grouped primary navigation. Shared by the static sidebar and the mobile
 * drawer; `onNavigate` lets the drawer close itself when a destination is chosen.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {NAV_GROUPS.map(group => (
        <div key={group.label} className="space-y-1">
          <p className="nav-group-label px-2">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map(item => {
              const Icon = ICONS[item.href] ?? LayoutDashboard;
              const active = isActiveNavItem(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="nav-item"
                    aria-current={active ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
