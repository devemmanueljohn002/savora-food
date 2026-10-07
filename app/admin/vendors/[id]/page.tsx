import { AdminSignIn } from "@/components/AdminShell";
import { getAdminPageUser } from "@/server/admin-page";
import VendorDetailClient from "./detail-client";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Server-enforced admin gate: the session cookie role is verified on the
 * server before anything renders. Non-admins never reach vendor data.
 */
export default async function AdminVendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminPageUser();
  if (!admin) return <AdminSignIn />;
  const { id } = await params;
  return <VendorDetailClient id={id} />;
}
