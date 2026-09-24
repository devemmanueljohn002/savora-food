"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  Bike,
  Cake,
  CalendarCheck,
  Cookie,
  CupSoda,
  Heart,
  Home,
  Info,
  LayoutDashboard,
  Menu,
  Phone,
  ShoppingCart,
  Store,
  User,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import HeaderSearch from "./HeaderSearch";
import CartCount from "./CartCount";
import { useCurrentUser, useFavorites } from "@/lib/api/hooks";
import { dashboardForRole } from "@/lib/savora-api";

type NavItem = { label: string; href: string; icon: LucideIcon };

const links: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Food", href: "/food", icon: UtensilsCrossed },
  { label: "Cakes", href: "/cakes", icon: Cake },
  { label: "Snacks", href: "/snacks", icon: Cookie },
  { label: "Drinks", href: "/drinks", icon: CupSoda },
  { label: "Catering", href: "/catering", icon: CalendarCheck },
  { label: "Vendors", href: "/vendors", icon: Store },
  { label: "About", href: "/about", icon: Info },
  { label: "Contact", href: "/contact", icon: Phone },
];

const drawerLinks: NavItem[] = [
  ...links,
  { label: "My Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Track Order", href: "/track", icon: Bike },
];

function FavoriteCount() {
  const { data } = useFavorites();
  const count = (data?.products.length ?? 0) + (data?.vendors.length ?? 0);
  if (!count) return null;
  return <span className="hdr-badge">{count}</span>;
}

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const { data: currentUser } = useCurrentUser();
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const close = () => {
    setOpen(false);
    menuBtnRef.current?.focus();
  };

  const firstName =
    currentUser?.firstName?.trim().split(" ")[0] || "Account";
  const dashboardHref =
    currentUser && currentUser.role !== "CUSTOMER"
      ? dashboardForRole(currentUser.role)
      : "/dashboard?tab=overview";

  useEffect(() => {
    if (!open) return;
    const drawer = document.getElementById(drawerId);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const items = drawer.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, drawerId]);

  return (
    <header className="site-header">
      <div className="hdr-bar">
        <button
          ref={menuBtnRef}
          className="hdr-icon-btn hdr-menu-btn"
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={drawerId}
          data-state={open ? "open" : "closed"}
          onClick={() => setOpen(true)}
        >
          <Menu className="hdr-ico size-5" aria-hidden="true" />
        </button>

        <Link
          className={`hdr-logo${isActive("/") ? " active" : ""}`}
          href="/"
          aria-label="Savora Food — Your Food. Your Choice. Delivered."
          data-status={isActive("/") ? "active" : undefined}
          aria-current={isActive("/") ? "page" : undefined}
        >
          <img src="/savora-logo-wide.png" alt="Savora Food — Your Food. Your Choice. Delivered." />
        </Link>

        <div className="hdr-search">
          <HeaderSearch />
        </div>

        <div className="hdr-actions">
          <Link className="hdr-icon-btn" href="/dashboard?tab=favorites" aria-label="Favorites">
            <Heart className="hdr-ico" aria-hidden="true" />
            <FavoriteCount />
          </Link>
          <Link className="hdr-icon-btn" href="/cart" aria-label="Cart">
            <ShoppingCart className="hdr-ico" aria-hidden="true" />
            <CartCount />
          </Link>
          {currentUser ? (
            <Link
              className="hdr-account"
              href={dashboardHref}
              aria-label={`My Dashboard (${firstName})`}
            >
              <LayoutDashboard className="hdr-ico" aria-hidden="true" /> {firstName}
            </Link>
          ) : (
            <Link className="hdr-login" href="/login">
              <User className="hdr-ico" aria-hidden="true" /> Login
            </Link>
          )}
        </div>
      </div>

      <nav className="hdr-nav" aria-label="Primary">
        <div className="hdr-nav-inner">
          {links.map(({ label, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={active ? "active" : undefined}
                data-status={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="hdr-mobile-search">
        <HeaderSearch />
      </div>

      {open && (
        <>
          <div
            className="hdr-sheet-overlay"
            data-state="open"
            aria-hidden="true"
            onClick={close}
          />
          <div
            className="hdr-sheet"
            role="dialog"
            data-state="open"
            tabIndex={-1}
            aria-labelledby={`${drawerId}-title`}
            id={drawerId}
          >
            <button
              className="hdr-sheet-close"
              type="button"
              aria-label="Close"
              onClick={close}
              autoFocus
            >
              <X className="hdr-sheet-close-ico" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
            <h2 id={`${drawerId}-title`} className="sr-only hdr-sheet-title">
              Savora Food menu
            </h2>
            <div className="hdr-sheet-head">
              <img src="/savora-logo-wide.png" alt="Savora Food" />
            </div>
            <nav className="hdr-drawer-nav" aria-label="Mobile">
              {drawerLinks.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={`${href}-${label}`}
                    href={href}
                    className={active ? "active" : undefined}
                    data-status={active ? "active" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={close}
                  >
                    <Icon className="hdr-drawer-ico" aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
