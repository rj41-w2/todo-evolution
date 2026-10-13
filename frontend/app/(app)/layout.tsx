import AppShell from '../../components/AppShell';

/**
 * Route group for every signed-in page. It has no URL segment of its own, so
 * `/` stays `/` — but login and register live outside the group and keep their
 * own focused-column presentation (ticket 01/09).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
