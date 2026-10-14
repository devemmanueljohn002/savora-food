import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import VendorCartSummary from "@/components/VendorCartSummary";
import { getVendorBySlug, listProducts } from "@/server/queries/catalog";
import { absoluteUrl } from "@/lib/site-url";
import { toJsonLdScript } from "@/lib/safe-json";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) return { title: "Vendor not found" };
  const location = [vendor.city, vendor.state].filter(Boolean).join(", ");
  const title = `${vendor.name}${location ? ` in ${location}` : ""} | Order online`;
  const description = vendor.description ?? `Order from ${vendor.name} on Savora Food. Your Food. Your Choice. Delivered.`;
  const url = absoluteUrl(`/vendor/${vendor.slug}`);
  const image = vendor.bannerImageUrl ?? vendor.logoUrl ?? FALLBACK_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: [{ url: image, alt: vendor.name }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const products = await listProducts({ vendorId: vendor.id, limit: 48 });
  const location = [vendor.city, vendor.state].filter(Boolean).join(", ") || "Nigeria";
  const restaurantJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: vendor.name,
    url: absoluteUrl(`/vendor/${vendor.slug}`),
    image: vendor.bannerImageUrl ?? vendor.logoUrl ?? undefined,
    servesCuisine: vendor.categories.length > 0 ? vendor.categories : undefined,
    address:
      vendor.address || vendor.city
        ? {
            "@type": "PostalAddress",
            streetAddress: vendor.address ?? undefined,
            addressLocality: vendor.city ?? undefined,
            addressRegion: vendor.state ?? undefined,
            addressCountry: "NG",
          }
        : undefined,
    // Only real ratings — never emitted when the vendor has none.
    ...(vendor.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: vendor.rating.toFixed(1),
            reviewCount: vendor.ratingCount,
          },
        }
      : {}),
  };

  // Group menu items by category for the sticky category nav + sections.
  const groups = new Map<string, { name: string; slug: string; items: typeof products.items }>();
  for (const product of products.items) {
    const key = product.categorySlug ?? "all";
    const entry = groups.get(key) ?? {
      name: product.categoryName ?? "Menu",
      slug: (product.categorySlug ?? "menu").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "menu",
      items: [],
    };
    entry.items.push(product);
    groups.set(key, entry);
  }
  const menuGroups = [...groups.values()];
  const showGroups = menuGroups.length > 1;

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(restaurantJsonLd) }} />
      {/* Header banner */}
      <div
        className="banner"
        role="img"
        aria-label={`${vendor.name} kitchen banner`}
        style={{
          backgroundImage: `linear-gradient(90deg,#2d1709bb,#2d170944),url('${vendor.bannerImageUrl ?? vendor.logoUrl ?? FALLBACK_IMAGE}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="container">
          <h1>{vendor.name}</h1>
        </div>
      </div>
      <section className="section container">
        {vendor.isOpen === false ? (
          <p style={{ margin: "8px 0 0" }}>
            <span className="badge badge-danger">Closed · not accepting orders right now</span>
          </p>
        ) : null}
        <p className="muted">{vendor.description ?? "Freshly prepared by a trusted vendor."}</p>
        <p className="rating">
          ★ {vendor.rating.toFixed(1)} · {vendor.categories[0] ?? "Marketplace"} · {location}
        </p>
        {vendor.address ? <p className="muted">{vendor.address}</p> : null}

        <h2 style={{ marginTop: 32 }}>Available products</h2>
        {vendor.isOpen === false ? (
          <p className="muted">This kitchen is closed right now — ordering is paused until they reopen.</p>
        ) : null}
        {products.items.length === 0 ? (
          <p className="muted">This vendor has no available products right now.</p>
        ) : (
          <div className="vendor-menu-layout" style={{ marginTop: 20 }}>
            {/* Sticky category list (left on desktop, scroll chips on mobile). */}
            {showGroups ? (
              <nav className="vendor-menu-cats" aria-label="Menu categories">
                {menuGroups.map((group) => (
                  <a key={group.slug} className="vendor-menu-cat" href={`#menu-${group.slug}`}>
                    {group.name} ({group.items.length})
                  </a>
                ))}
              </nav>
            ) : (
              <span aria-hidden="true" />
            )}
            {/* Items in 2 columns on desktop, single column on phones. */}
            <div style={{ minWidth: 0 }}>
              {showGroups ? (
                menuGroups.map((group) => (
                  <section key={group.slug} id={`menu-${group.slug}`} style={{ scrollMarginTop: 90, marginBottom: 28 }}>
                    <h3 style={{ margin: "0 0 12px" }}>{group.name}</h3>
                    <div className="vendor-menu-items">
                      {group.items.map((product) => (
                        <ProductCard key={product.id} item={product} orderDisabled={vendor.isOpen === false} />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <div className="vendor-menu-items">
                  {products.items.map((product) => (
                    <ProductCard key={product.id} item={product} orderDisabled={vendor.isOpen === false} />
                  ))}
                </div>
              )}
            </div>
            {/* Sticky cart summary (right on desktop). */}
            <VendorCartSummary vendorName={vendor.name} />
          </div>
        )}
      </section>
    </PageShell>
  );
}