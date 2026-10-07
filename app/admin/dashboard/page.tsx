import { AdminSignIn } from "@/components/AdminShell";
import { getAdminPageUser } from "@/server/admin-page";
import AdminDashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Server-enforced admin gate: the session cookie role is verified on the
 * server before anything renders. Non-admins never reach dashboard data
 * (every admin API route re-checks the role independently).
 */
export default async function AdminDashboardPage() {
  const admin = await getAdminPageUser();
  if (!admin) return <AdminSignIn />;
  return <AdminDashboardClient />;
}
