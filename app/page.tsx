import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bike, CalendarCheck, Package, ShieldCheck, Search, Star, Timer, Zap, type LucideIcon } from "lucide-react";
import PageShell from "@/components/PageShell";
import HomeHero from "@/components/HomeHero";
import InvitedBanner from "./InvitedBanner";
import ProductCard from "@/components/ProductCard";
import VendorCard from "@/components/VendorCard";
import CategoryCard from "@/components/CategoryCard";
import { absoluteUrl } from "@/lib/site-url";
import { DEFAULT_OG_IMAGES, DEFAULT_TWITTER_IMAGE } from "@/lib/seo";
import { toJsonLdScript } from "@/lib/safe-json";
import {
  listCategories,
  listCateringPackages,
  listLocations,
  listProducts,
  listVendors,
} from "@/server/queries/catalog";
import { EmptyState } from "@/components/ui";

const EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate Event",
  "Conference",
  "Religious Event",
  "Party",
  "Funeral",
  "Private Event",
];

const HOW_IT_WORKS: { step: number; icon: LucideIcon; title: string; desc: string }[] = [
  { step: 1, icon: Search, title: "Search & discover", desc: "Find meals, cakes, snacks, drinks or caterers near you." },
  { step: 2, icon: Zap, title: "Order in seconds", desc: "Add to cart, choose delivery time, pay securely with Naira." },
  { step: 3, icon: Bike, title: "Track live", desc: "Watch your order from kitchen to door in real time." },
  { step: 4, icon: Star, title: "Rate & repeat", desc: "Share your experience and reorder favorites in one tap." },
];

const CATEGORIES: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Food", href: "/food", icon: Package },
  { label: "Cakes", href: "/cakes", icon: Package },
  { label: "Snacks", href: "/snacks", icon: Package },
  { label: "Drinks", href: "/drinks", icon: Package },
  { label: "Catering", href: "/catering", icon: CalendarCheck },
];

const OFFERS = [
  { title: "First order free delivery", desc: "On orders over ₦3,000 — use code WELCOME", icon: Zap },
  { title: "Weekend catering deal", desc: "10% off catering packages booked Fri–Sun", icon: CalendarCheck },
  { title: "Refer a friend", desc: "You both get ₦2,000 credit when they order", icon: Star },
];

const QUICK_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Food", href: "/food", icon: Package },
  { label: "Cakes", href: "/cakes", icon: Package },
  { label: "Snacks", href: "/snacks", icon: Package },
  { label: "Drinks", href: "/drinks", icon: Package },
  { label: "Catering", href: "/catering", icon: CalendarCheck },
  { label: "Vendors", href: "/vendors", icon: ShieldCheck },
  { label: "Orders", href: "/dashboard", icon: Package },
  { label: "Track Order", href: "/track", icon: Bike },
];

const TESTIMONIALS = [
  {
    initial: "C",
    name: "Chidinma O.",
    location: "Lekki, Lagos",
    quote:
      "Ordered jollof for the office at 11am, it arrived hot before noon. Savora Food has replaced our whole lunch rota.",
    vendor: "Mama Tolu's Kitchen",
  },
  {
    initial: "I",
    name: "Ibrahim S.",
    location: "Wuse, Abuja",
    quote:
      "The wedding cake was exactly the design we sent. Tracking the booking day by day removed all the anxiety.",
    vendor: "Sweet Crumbs Bakery",
  },
  {
    initial: "T",
    name: "Tolu A.",
    location: "Ibadan",
    quote:
      "Small chops for 80 guests, delivered warm and beautifully packaged. Payment and receipt were instant.",
    vendor: "Chops Republic",
  },
];

export const metadata: Metadata = {
  title: "Savora Food | Your Food. Your Choice. Delivered.",
  description:
    "Order hot, freshly cooked meals, cakes, snacks and drinks from trusted local kitchens. Fast delivery across Nigeria.",
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: "Savora Food | Your Food. Your Choice. Delivered.",
    description:
      "Order hot, freshly cooked meals, cakes, snacks and drinks from trusted local kitchens.",
    url: absoluteUrl("/"),
    images: DEFAULT_OG_IMAGES as any,
  },
  twitter: {
    ...DEFAULT_TWITTER_IMAGE,
    title: "Savora Food | Your Food. Your Choice. Delivered.",
    description:
      "Order hot, freshly cooked meals, cakes, snacks and drinks from trusted local kitchens.",
  },
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Savora Food",
  slogan: "Your Food. Your Choice. Delivered.",
  url: absoluteUrl("/"),
  logo: absoluteUrl("/savora-logo-wide.png"),
};

export default async function Home() {
  const [categories, featuredResult, vendorResult, packages, locations] = await Promise.all([
    listCategories(),
    listProducts({ featured: true, limit: 6, sort: "rating" }),
    listVendors({ limit: 3, sort: "rating" }),
    listCateringPackages(4),
    listLocations(),
  ]);

  const featured = featuredResult.items.length
    ? featuredResult.items
    : (await listProducts({ limit: 6, sort: "rating" })).items;

  const deliveryByCity = new Map(locations.map((location) => [location.name.toLowerCase(), location]));
  function deliveryFor(city: string | null) {
    const location = deliveryByCity.get((city ?? "").toLowerCase());
    return location ? { fee: location.deliveryFee, minutes: location.deliveryTimeMinutes } : null;
  }

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(ORG_JSON_LD) }} />
      <InvitedBanner />
      <HomeHero />

      <section className="section container" aria-label="Categories">
        <div className="chip-row" role="tablist" aria-label="Food categories">
          {CATEGORIES.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className="chip" role="tab">
              <Icon className="chip-ico" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="section container" aria-label="Featured vendors">
        <div className="section-head">
          <div>
            <h2>Featured vendors</h2>
            <p>Verified kitchens, bakers and caterers on Savora Food.</p>
          </div>
          <Link className="section-link" href="/vendors">
            All vendors <ArrowRight className="section-link-ico" aria-hidden="true" />
          </Link>
        </div>
        {vendorResult.items.length === 0 ? (
          <EmptyState compact icon={<ShieldCheck />} title="Vendors are being onboarded. Check back soon." />
        ) : (
          <div className="vendor-grid">
            {vendorResult.items.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} delivery={deliveryFor(vendor.city)} />
            ))}
          </div>
        )}
      </section>

      <section className="section container" aria-label="Popular meals">
        <div className="section-head">
          <div>
            <h2>Popular right now</h2>
            <p>What Savora Food customers are ordering today.</p>
          </div>
          <Link className="section-link" href="/food">
            Browse food <ArrowRight className="section-link-ico" aria-hidden="true" />
          </Link>
        </div>
        {featured.length === 0 ? (
          <EmptyState compact icon={<Package />} title="No products available yet." />
        ) : (
          <div className="product-grid">
            {featured.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="section container" style={{ background: "#fff5e4" }} aria-label="Offers">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {OFFERS.map((offer, i) => (
            <div key={i} className="card card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
                <Zap className="text-primary" aria-hidden="true" style={{ fontSize: 24 }} />
                <h3 style={{ margin: 0 }}>{offer.title}</h3>
              </div>
              <p className="muted" style={{ margin: 0 }}>{offer.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container" aria-label="How it works">
        <div className="section-head">
          <h2>How it works</h2>
          <p>From craving to doorstep in four simple steps.</p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="card card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row" style={{ justifyContent: "flex-start", gap: 10 }}>
                <span className="chip" style={{ background: "#fff5e4", color: "var(--orange)", borderColor: "transparent" }}>
                  <strong style={{ fontSize: 20 }}>{step}</strong>
                </span>
                <Icon className="text-primary" aria-hidden="true" style={{ fontSize: 24 }} />
              </div>
              <h3 style={{ margin: 0 }}>{title}</h3>
              <p className="muted" style={{ margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container" aria-label="Testimonials">
        <h2>Loved by customers</h2>
        <p className="section-sub">Real orders, real reviews from across Nigeria.</p>
        <div className="grid">
          {TESTIMONIALS.map((testimonial) => (
            <div className="card card-body" key={testimonial.name}>
              <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
                <span className="avatar">{testimonial.initial}</span>
                <div>
                  <strong>{testimonial.name}</strong>
                  <p className="muted" style={{ margin: 0 }}>{testimonial.location}</p>
                </div>
              </div>
              <blockquote style={{ margin: "12px 0 0" }}>“{testimonial.quote}”</blockquote>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>— {testimonial.vendor}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section container" aria-label="Quick links">
        <div className="chip-row" role="tablist" aria-label="Quick links">
          {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className="chip" role="tab">
              <Icon className="chip-ico" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}