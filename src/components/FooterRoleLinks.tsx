"use client";

import Link from "next/link";
import { useCurrentUser } from "@/lib/api/hooks";
import { getOrdersRouteForRole } from "@/lib/role-routes";

/**
 * Role-dependent footer links, rendered client-side from the cached session
 * so the static (server-rendered) footer stays cache-friendly. Vendors and
 * riders get their own order destinations and never see recruitment links
 * for roles they already hold.
 */
export default function FooterRoleLinks() {
  const { data: currentUser, isLoading } = useCurrentUser();
  const role = isLoading ? undefined : (currentUser?.role ?? null);

  const items: Array<[string, string]> = [
    ["My Orders", getOrdersRouteForRole(role)],
    ...(role === "VENDOR" || role === "DELIVERY_PARTNER"
      ? []
      : [
          ["Become a Vendor", "/partner"],
          ["Ride with Savora", "/partner"],
        ] as Array<[string, string]>),
  ];

  return (
    <>
      {items.map(([label, href]) => (
        <li key={label}>
          <Link href={href}>{label}</Link>
        </li>
      ))}
    </>
  );
}
