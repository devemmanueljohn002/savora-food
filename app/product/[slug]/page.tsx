import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import ProductImage from "@/components/ProductImage";
import ReviewsList from "@/components/ReviewsList";
import ReviewForm from "@/components/ReviewForm";
import BuyBox from "@/components/BuyBox";
import { getProductBySlug, listProductReviews, listProducts } from "@/server/queries/catalog";
import { absoluteUrl } from "@/lib/site-url";
import { toJsonLdScript } from "@/lib/safe-json";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  const title = `${product.name} | ${product.vendorName}`;
  const description =
    product.description ??
    product.shortDescription ??
    `Order ${product.name} from ${product.vendorName} on Savora Food.`;
  const url = absoluteUrl(`/product/${product.slug}`);
  const image = product.image ?? FALLBACK_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: [{ url: image, alt: product.name }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [reviews, related] = await Promise.all([
    listProductReviews(product.id, 20),
    listProducts({ vendorId: product.vendorId, limit: 4 }),
  ]);

  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;
  const productJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? product.shortDescription ?? undefined,
    image: product.image ?? undefined,
    url: absoluteUrl(`/product/${product.slug}`),
    brand: { "@type": "Brand", name: product.vendorName },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: "NGN",
      price: product.price,
      availability: product.availability
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    // Only real ratings — never emitted when the product has none.
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating.toFixed(1),
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(productJsonLd) }} />
      <section className="container product">
        <ProductImage className="product-image" src={product.image} alt={product.name} width={1200} height={900} priority sizes="(max-width: 1180px) 96vw, 560px" />
        <div>
          {product.categoryName ? <span className="pill">{product.categoryName}</span> : null}
          <h1>{product.name}</h1>
          <p className="rating">
            ★ {product.rating.toFixed(1)} ({product.ratingCount})
            {"　"}
            <Link href={`/vendor/${product.vendorSlug}`}>{product.vendorName}</Link>
            {"　"}
            <span className="pill">{product.availability ? "Available now" : "Unavailable"}</span>
            {product.vendorOpen === false ? (
              <>
                {"　"}
                <span className="badge badge-danger">Closed · kitchen not accepting orders</span>
              </>
            ) : null}
          </p>
          <p className="muted">{product.description ?? product.shortDescription ?? "Freshly prepared and delivered with care."}</p>
          <p className="price" style={{ fontSize: 30, margin: "12px 0 0" }}>₦{product.price.toLocaleString()}</p>
          {onSale ? (
            <p className="muted">
              <del>₦{product.compareAtPrice!.toLocaleString()}</del> was
            </p>
          ) : null}
          <BuyBox productId={product.id} disabled={product.vendorOpen === false} />
          {product.vendorOpen === false ? (
            <p className="muted" style={{ marginTop: 8 }}>
              This kitchen is closed right now — ordering is paused until they reopen.
            </p>
          ) : null}
          {product.prepInfo ? (
            <div className="form-card">
              <strong>Preparation</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{product.prepInfo}</p>
            </div>
          ) : null}
          {product.ingredients.length > 0 ? (
            <div className="form-card">
              <strong>Ingredients</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{product.ingredients.join(", ")}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section container">
        <h2>Customer reviews</h2>
        <ReviewsList reviews={reviews} />
        <div style={{ marginTop: 20 }}>
          <ReviewForm productId={product.id} slug={slug} />
        </div>
      </section>

      {related.items.filter((item) => item.id !== product.id).length > 0 ? (
        <section className="section container">
          <h2>More from {product.vendorName}</h2>
          <div className="grid">
            {related.items
              .filter((item) => item.id !== product.id)
              .map((item) => (
                <ProductCard key={item.id} item={item} />
              ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}