import Link from "next/link";
import NewsletterJoin from "./NewsletterJoin";

const MARKETPLACE_LINKS = [
  ["Food", "/food"],
  ["Cakes", "/cakes"],
  ["Snacks", "/snacks"],
  ["Drinks", "/drinks"],
  ["Catering", "/catering"],
  ["Vendors", "/vendors"],
];

const SUPPORT_LINKS = [
  ["About Savora Food", "/about"],
  ["Contact & Help", "/contact"],
  ["Track Order", "/track"],
  ["My Orders", "/dashboard?tab=orders"],
  ["Become a Vendor", "/partner"],
  ["Ride with Savora", "/partner"],
];

const SOCIALS: { label: string; icon: React.ReactNode }[] = [
  {
    label: "Instagram",
    icon: (
      <>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </>
    ),
  },
  {
    label: "Twitter",
    icon: (
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    ),
  },
  {
    label: "Facebook",
    icon: (
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    ),
  },
];

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <img src="/savora-logo-wide.png" alt="Savora Food" />
          <p className="muted">Your Food. Your Choice. Delivered.</p>
          <p className="muted">
            A technology-driven food marketplace built for Nigeria and designed for Africa.
          </p>
          <div className="footer-socials">
            {SOCIALS.map(({ label, icon }) => (
              <span className="footer-social" key={label} role="img" aria-label={label}>
                <svg
                  className="footer-social-ico"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {icon}
                </svg>
              </span>
            ))}
          </div>
        </div>
        <div>
          <h3 className="footer-heading">Marketplace</h3>
          <ul className="footer-list">
            {MARKETPLACE_LINKS.map(([label, href]) => (
              <li key={label}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="footer-heading">Company &amp; Support</h3>
          <ul className="footer-list">
            {SUPPORT_LINKS.map(([label, href]) => (
              <li key={label}>
                <Link href={href}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="footer-heading">Newsletter</h3>
          <p className="muted footer-newsletter-note">
            Deals, new vendors and seasonal menus — once a week.
          </p>
          <NewsletterJoin />
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <p>© 2026 Savora Food. All rights reserved.</p>
          <div className="footer-legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
