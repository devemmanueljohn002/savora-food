import { Suspense } from "react";
import { AdminSignIn } from "@/components/AdminShell";
import PageShell from "@/components/PageShell";
import { getAdminPageUser } from "@/server/admin-page";
import VendorQueueClient from "./queue-client";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Server-enforced admin gate: the session cookie role is verified on the
 * server before anything renders. Non-admins never reach the queue.
 */
export default async function AdminVendorsPage() {
  const admin = await getAdminPageUser();
  if (!admin) return <AdminSignIn />;
  return (
    <Suspense
      fallback={
        <PageShell>
          <section className="section container">
            <p className="muted">Loading vendors…</p>
          </section>
        </PageShell>
      }
    >
      <VendorQueueClient />
    </Suspense>
  );
}
