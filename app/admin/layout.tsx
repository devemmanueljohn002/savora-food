import type { Metadata } from "next";
import { requireAdminPageUser } from "@/server/admin-page";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  // Server-side enforcement for EVERY /admin route: redirects signed-out
  // visitors to sign-in and non-admins to their own home before any admin UI
  // renders. The edge proxy enforces the same rule; this is defense in depth.
  await requireAdminPageUser();
  return <>{children}</>;
}
