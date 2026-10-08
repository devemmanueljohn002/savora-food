"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Customer | Affiliate segmented switcher for the account/dashboard area.
 * Rendered only for affiliates (isAffiliate). The active segment is derived
 * from the URL — never from saved state — so Home / bottom-nav taps can't
 * flip it by mistake.
 */
export default function AccountTypeSwitcher({ isAffiliate }: { isAffiliate: boolean }) {
  const pathname = usePathname();
  if (!isAffiliate) return null;

  const onAffiliate = pathname === "/affiliate" || pathname.startsWith("/affiliate/");

  return (
    <nav className="tabs account-type-switcher" aria-label="Account type">
      <Link href="/dashboard" className={onAffiliate ? undefined : "selected"} aria-current={onAffiliate ? undefined : "page"}>
        Customer
      </Link>
      <Link href="/affiliate" className={onAffiliate ? "selected" : undefined} aria-current={onAffiliate ? "page" : undefined}>
        Affiliate
      </Link>
    </nav>
  );
}
