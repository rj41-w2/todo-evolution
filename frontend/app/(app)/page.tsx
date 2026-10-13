import { DashboardView } from '../../components/DashboardView';

/**
 * The homepage. `DashboardView` reads the clock on the client, so this stays a
 * server component and the visitor's time is never the server's.
 */
export default function Home() {
  return <DashboardView />;
}
