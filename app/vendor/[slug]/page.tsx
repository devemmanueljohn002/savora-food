import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import { getVendorBySlug, listProducts } from "@/server/queries/catalog";
import { absoluteUrl } from "@/lib/site-url";

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

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantJsonLd) }} />
      <section className="section container">
        <Image
          className="hero-img"
          src={vendor.bannerImageUrl ?? vendor.logoUrl ?? FALLBACK_IMAGE}
          alt={`${vendor.name}${location !== "Nigeria" ? ` in ${location}` : ""} — order online on Savora Food`}
          width={1600}
          height={900}
          priority
          sizes="(max-width: 1180px) 96vw, 1180px"
        />
        <h1 style={{ marginTop: 24 }}>{vendor.name}</h1>
        <p className="muted">{vendor.description ?? "Freshly prepared by a trusted vendor."}</p>
        <p className="rating">
          ★ {vendor.rating.toFixed(1)} · {vendor.categories[0] ?? "Marketplace"} · {location}
        </p>
        {vendor.address ? <p className="muted">{vendor.address}</p> : null}

        <h2 style={{ marginTop: 32 }}>Available products</h2>
        {products.items.length === 0 ? (
          <p className="muted">This vendor has no available products right now.</p>
        ) : (
          <div className="grid">
            {products.items.map((product) => (
              <ProductCard key={product.id} item={product} />
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}