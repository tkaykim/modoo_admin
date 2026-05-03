import { CalibrationPageClient } from './components/CalibrationPageClient';

export const dynamic = 'force-dynamic';

// Access control: relies on admin auth whitelist (`useAdminAuth.allowedRoutesByRole.admin`).
// Non-admins are redirected to /dashboard. URL is unindexed and not linked from any nav.
export default function CalibrationTestPage() {
  return <CalibrationPageClient />;
}
