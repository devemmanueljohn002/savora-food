"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [
  ["Dashboard", "/vendor/dashboard"],
  ["Orders", "/vendor/orders"],
  ["Products", "/vendor/products"],
  ["Catering", "/vendor/catering"],
  ["Payouts", "/vendor/payouts"],
  ["Profile", "/vendor/profile"],
];

export default function VendorNav() {
  const pathname = usePathname();
  return (
    <nav className="vendor-tabs" aria-label="Vendor">
      {LINKS.map(([label, href]) => {
        const active = pathname === href || (href !== "/vendor/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} className={`vendor-tab${active ? " selected" : ""}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
