"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Store,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type NavLink = { label: string; href: string; Icon: LucideIcon };

const LINKS: NavLink[] = [
  { label: "Dashboard", href: "/vendor/dashboard", Icon: LayoutDashboard },
  { label: "Orders", href: "/vendor/orders", Icon: ClipboardList },
  { label: "Products", href: "/vendor/products", Icon: Store },
  { label: "Catering", href: "/vendor/catering", Icon: CalendarCheck },
  { label: "Payouts", href: "/vendor/payouts", Icon: Wallet },
  {label: "Schedule", href: "/vendor/schedule", Icon: Clock },
  { label: "Profile", href: "/vendor/profile", Icon: UserRound },
];

/**
 * The ONE vendor navigation: a horizontally scrollable tab bar on mobile,
 * a sticky sidebar on desktop (see .vendor-tabs CSS). Vendor pages never
 * render the customer header search or bottom nav — VendorShell is
 * vendor-chrome only.
 */
export default function VendorNav() {
  const pathname = usePathname();
  return (
    <nav className="vendor-tabs" aria-label="Vendor">
      {LINKS.map(({ label, href, Icon }) => {
        const active = pathname === href || (href !== "/vendor/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            className={`vendor-tab${active ? " selected" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="vendor-tab-ico" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
