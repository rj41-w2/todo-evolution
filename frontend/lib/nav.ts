// Navigation model for the app shell.
//
// The URLs here are the canonical final paths for the base44 clone. Some of
// these destinations are built by later tickets (03/04/06/07) — until then a
// link may resolve to Next's not-found, which is expected. Only this module
// decides which path each nav entry points at, so the shell never drifts.

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/tasks', label: 'Tasks' },
      { href: '/my-tasks', label: 'My Tasks' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/goals', label: 'Goals' },
      { href: '/team', label: 'Team' },
      { href: '/activity', label: 'Activity' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

/**
 * Whether `href` is the active destination for the current `pathname`.
 *
 * The dashboard owns only the exact root — otherwise every route would light
 * it up. Every other entry is active for itself and its nested pages, but not
 * for a sibling whose path merely shares a prefix (`/tasks` vs `/tasks-archive`).
 */
export function isActiveNavItem(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
