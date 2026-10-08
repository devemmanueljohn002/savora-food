import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bike, CalendarCheck, Package, ShieldCheck, type LucideIcon } from "lucide-react";
import PageShell from "@/components/PageShell";
import HomeHero from "@/components/HomeHero";
import InvitedBanner from "./InvitedBanner";
import ProductCard from "@/components/ProductCard";
import VendorCard from "@/components/VendorCard";
import CategoryCard from "@/components/CategoryCard";
import { absoluteUrl } from "@/lib/site-url";
import { toJsonLdScript } from "@/lib/safe-json";
import {
  listCategories,
  listCateringPackages,
  listLocations,
  listProducts,
  listVendors,
} from "@/server/queries/catalog";

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
  },
  twitter: {
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

      <section className="section container">
        <div className="section-head">
          <div>
            <h2>Shop by category</h2>
            <p>Everything from a quick lunch to a full event spread.</p>
          </div>
        </div>
        <div className="category">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>

      <section className="section container">
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
          <p className="muted">Vendors are being onboarded. Check back soon.</p>
        ) : (
          <div className="vendor-grid">
            {vendorResult.items.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} delivery={deliveryFor(vendor.city)} />
            ))}
          </div>
        )}
      </section>

      <section className="section container">
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
          <p className="muted">No products available yet.</p>
        ) : (
          <div className="product-grid">
            {featured.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="section" style={{ background: "#fff5e4" }}>
        <div className="container">
          <div className="two-col-center">
            <div>
              <div className="catering-badge">Catering Marketplace</div>
              <h2 className="catering-title">Book trusted caterers for any event</h2>
              <p className="catering-lead">
                Share your event details, receive a quote, confirm the booking and track it right up to event day.
              </p>
              <div className="event-chips">
                {EVENT_TYPES.map((event) => (
                  <span className="tag-badge" key={event}>{event}</span>
                ))}
              </div>
              <Link className="catering-btn" href="/catering">
                <CalendarCheck className="catering-btn-ico" aria-hidden="true" /> Request catering
              </Link>
            </div>
            {packages.length === 0 ? (
              <p className="muted">Catering packages are being added. Check back soon.</p>
            ) : (
              <div className="package-grid">
                {packages.map((pkg) => (
                  <div className="package-card" key={pkg.id}>
                    <h3 className="package-title">{pkg.title}</h3>
                    <p className="package-vendor">{pkg.vendorName}</p>
                    <p className="package-price-line">
                      <span className="package-price">₦{pkg.pricePerGuest.toLocaleString()}</span> per guest · min{" "}
                      {pkg.minimumGuests}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section container">
        <h2>Loved by customers</h2>
        <p className="section-sub">Real orders, real reviews from across Nigeria.</p>
        <div className="grid">
          {TESTIMONIALS.map((testimonial) => (
            <div className="card card-body testimonial" key={testimonial.name}>
              <div className="row" style={{ justifyContent: "flex-start" }}>
                <span className="avatar">{testimonial.initial}</span>
                <div>
                  <strong>{testimonial.name}</strong>
                  <p className="muted" style={{ margin: 0 }}>{testimonial.location}</p>
                </div>
              </div>
              <blockquote>“{testimonial.quote}”</blockquote>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>— {testimonial.vendor}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="quick-links container">
        <h2>Quick links</h2>
        <div className="quick-grid">
          {QUICK_LINKS.map(({ label, href, icon: Icon }) => (
            <Link className="quick-link" href={href} key={href}>
              <Icon className="quick-link-ico" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}