import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import ReviewsList from "@/components/ReviewsList";
import ReviewForm from "@/components/ReviewForm";
import BuyBox from "@/components/BuyBox";
import { getProductBySlug, listProductReviews, listProducts } from "@/server/queries/catalog";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [reviews, related] = await Promise.all([
    listProductReviews(product.id, 20),
    listProducts({ vendorId: product.vendorId, limit: 4 }),
  ]);

  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;

  return (
    <PageShell>
      <section className="container product">
        <img className="product-image" src={product.image ?? FALLBACK_IMAGE} alt={product.name} />
        <div>
          {product.categoryName ? <span className="pill">{product.categoryName}</span> : null}
          <h1>{product.name}</h1>
          <p className="rating">
            ★ {product.rating.toFixed(1)} ({product.ratingCount})
            {"　"}
            <Link href={`/vendor/${product.vendorSlug}`}>{product.vendorName}</Link>
            {"　"}
            <span className="pill">{product.availability ? "Available now" : "Unavailable"}</span>
          </p>
          <p className="muted">{product.description ?? product.shortDescription ?? "Freshly prepared and delivered with care."}</p>
          <h1 className="price">₦{product.price.toLocaleString()}</h1>
          {onSale ? (
            <p className="muted">
              <del>₦{product.compareAtPrice!.toLocaleString()}</del> was
            </p>
          ) : null}
          <BuyBox productId={product.id} />
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