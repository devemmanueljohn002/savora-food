import Link from "next/link";
import NewsletterJoin from "./NewsletterJoin";
import FooterRoleLinks from "./FooterRoleLinks";

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
];

const SOCIALS: { label: string; href: string; icon: React.ReactNode; filled?: boolean }[] = [
  {
    label: "X",
    href: "https://x.com/Savorafood247",
    filled: true,
    icon: (
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/savorafood247",
    icon: (
      <>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </>
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@SavorafoodOfficialChannel",
    icon: (
      <>
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </>
    ),
  },
];

export default function Footer({ showSocials = true }: { showSocials?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <img src="/savora-logo-wide.png" alt="Savora Food" />
          <p className="muted">Your Food. Your Choice. Delivered.</p>
          <p className="muted">
            A technology-driven food marketplace built for Nigeria and designed for Africa.
          </p>
          {showSocials && (
            <div className="footer-socials">
              {SOCIALS.map(({ label, href, icon, filled }) => (
                <a
                  className="footer-social"
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Savora Food on ${label}`}
                >
                  <svg
                    className="footer-social-ico"
                    viewBox="0 0 24 24"
                    fill={filled ? "currentColor" : "none"}
                    stroke={filled ? "none" : "currentColor"}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    {icon}
                  </svg>
                </a>
              ))}
            </div>
          )}
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
            <FooterRoleLinks />
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
