"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bike,
  Cake,
  CalendarCheck,
  ChevronRight,
  Cookie,
  CupSoda,
  Heart,
  Home,
  Info,
  LayoutDashboard,
  MapPin,
  Menu,
  Phone,
  ShoppingCart,
  Store,
  User,
  UserPlus,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import HeaderSearch from "./HeaderSearch";
import CartCount from "./CartCount";
import SignOutButton from "./SignOutButton";
import { useAddresses, useCurrentUser, useFavorites } from "@/lib/api/hooks";
import { getAccountRouteForRole, getDashboardRouteForRole, usesConsumerTabs } from "@/lib/role-routes";

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

const shopLinks: NavItem[] = [...links];

const savoraLinks: NavItem[] = [{ label: "Track Order", href: "/track", icon: Bike }];

function FavoriteCount() {
  const { data } = useFavorites();
  const count = (data?.products.length ?? 0) + (data?.vendors.length ?? 0);
  if (!count) return null;
  return <span className="hdr-badge">{count}</span>;
}

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const drawerId = useId();
  const { data: currentUser } = useCurrentUser();
  const { data: addresses } = useAddresses();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const cancelCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
      menuBtnRef.current?.focus();
    }, 180);
  }, [closing]);

  const openDrawer = useCallback(() => {
    cancelCloseTimer();
    setClosing(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Force-close on navigation (e.g. back/forward buttons) without stealing focus.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    cancelCloseTimer();
    setClosing(false);
    setOpen(false);
  }, [pathname]);

  const firstName =
    currentUser?.firstName?.trim().split(" ")[0] || "Account";
  // Account entry points follow the signed-in role: customers land on account
  // settings, vendors/riders/admins on their own dashboard. While the user is
  // still loading, fall back to the logged-out destinations (no flicker).
  const accountHref = getAccountRouteForRole(currentUser?.role);
  const dashboardHref = getDashboardRouteForRole(currentUser?.role);
  // "Profile & Settings" must keep staff in their own area: vendors stay on
  // the vendor profile, riders on the rider profile — never bounced to the
  // consumer /account pages.
  const profileHref =
    currentUser?.role === "VENDOR"
      ? "/vendor/profile"
      : currentUser?.role === "DELIVERY_PARTNER"
        ? "/rider/profile"
        : "/account/profile";
  const showConsumerShortcuts = usesConsumerTabs(currentUser?.role);
  // Delivery city from the shopper's default saved address (real data).
  const deliveryCity =
    currentUser
      ? (addresses?.find((address) => address.isDefault) ?? addresses?.[0])?.city?.trim() || null
      : null;
  // The landing hero owns the only search field on "/".
  const hideSearch = pathname === "/";

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
  }, [open, drawerId, close]);

  const renderDrawerRow = ({ label, href, icon: Icon }: NavItem) => {
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
        <ChevronRight className="hdr-drawer-chev" aria-hidden="true" />
      </Link>
    );
  };

  return (
    <header className={`site-header${hideSearch ? " hdr-search-hidden" : ""}`}>
      <div className="hdr-bar">
        <button
          ref={menuBtnRef}
          className="hdr-icon-btn hdr-menu-btn"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={drawerId}
          data-state={open ? "open" : "closed"}
          onClick={() => (open && !closing ? close() : openDrawer())}
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

        {hideSearch ? null : (
          <div className="hdr-search">
            <HeaderSearch />
          </div>
        )}

        <Link className="hdr-location" href="/search" aria-label="Delivery location">
          <MapPin className="hdr-ico" aria-hidden="true" />
          <span>{deliveryCity ?? "Nigeria"}</span>
        </Link>

        <div className="hdr-actions">
          {showConsumerShortcuts ? (
            <Link className="hdr-icon-btn hdr-shortcut" href="/dashboard?tab=favorites" aria-label="Favorites">
              <Heart className="hdr-ico" aria-hidden="true" />
              <FavoriteCount />
            </Link>
          ) : null}
          {showConsumerShortcuts ? (
            <Link className="hdr-icon-btn hdr-shortcut" href="/cart" aria-label="Cart">
              <ShoppingCart className="hdr-ico" aria-hidden="true" />
              <CartCount />
            </Link>
          ) : null}
          {currentUser ? (
            <Link
              className="hdr-account"
              href={accountHref}
              aria-label={`Account dashboard (${firstName})`}
            >
              <LayoutDashboard className="hdr-ico" aria-hidden="true" /> {firstName}
            </Link>
          ) : (
            <Link className="hdr-login" href="/auth">
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

      {open
        ? createPortal(
            <>
              <div
                className="hdr-sheet-overlay"
                data-state={closing ? "closed" : "open"}
                aria-hidden="true"
                onClick={close}
              />
              <div
                className="hdr-sheet"
                role="dialog"
                data-state={closing ? "closed" : "open"}
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
              <p className="hdr-sec-label" aria-hidden="true">Shop</p>
              {shopLinks.map(renderDrawerRow)}
              <p className="hdr-sec-label" aria-hidden="true">Account</p>
              {renderDrawerRow({ label: "My Dashboard", href: dashboardHref, icon: LayoutDashboard })}
              {savoraLinks.map(renderDrawerRow)}
            </nav>
            <div className="hdr-drawer-foot">
              {currentUser ? (
                <SignOutButton className="hdr-drawer-signout" onClick={close} />
              ) : (
                <>
                  <Link className="hdr-drawer-login" href="/auth" onClick={close}>
                    <User className="hdr-drawer-ico" aria-hidden="true" />
                    Login
                  </Link>
                  <Link className="hdr-drawer-register" href="/register" onClick={close}>
                    <UserPlus className="hdr-drawer-ico" aria-hidden="true" />
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )
      : null}
    </header>
  );
}
