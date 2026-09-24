import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import { getVendorBySlug, listProducts } from "@/server/queries/catalog";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);
  if (!vendor) notFound();

  const products = await listProducts({ vendorId: vendor.id, limit: 48 });
  const location = [vendor.city, vendor.state].filter(Boolean).join(", ") || "Nigeria";

  return (
    <PageShell>
      <section className="section container">
        <img
          className="hero-img"
          src={vendor.bannerImageUrl ?? vendor.logoUrl ?? FALLBACK_IMAGE}
          alt={vendor.name}
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