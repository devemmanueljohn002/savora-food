"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageShell from "./PageShell";
import { useCurrentUser } from "@/lib/api/hooks";
import { getHomeRouteForRole } from "@/lib/role-routes";

/**
 * Client-side role gate for dashboard roots. The proxy enforces the same
 * rules server-side on every navigation; this wrapper only improves the UX:
 * it shows a loader until the role is known (no wrong-role flash) and sends
 * cross-role visitors to their own home instead of a dead sign-in prompt.
 *
 * Unauthenticated visitors go to login and return here after signing in.
 */
export default function RoleGuard({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!allow.includes(user.role)) {
      router.replace(getHomeRouteForRole(user.role));
    }
  }, [isLoading, isError, user, allow, router, pathname]);

  if (isLoading || isError || !user || !allow.includes(user.role)) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </PageShell>
    );
  }
  return <>{children}</>;
}
