import Link from "next/link";
import { Plus, Star } from "lucide-react";
import AddToCart from "./AddToCart";
import FavoriteButton from "./FavoriteButton";
import type { CatalogProduct } from "@/lib/catalog-types";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";

export default function ProductCard({ item }: { item: CatalogProduct }) {
  const href = `/product/${item.slug}`;
  const onSale = item.compareAtPrice !== null && item.compareAtPrice > item.price;

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={href} aria-label={item.name}>
          <img className="product-card-img" src={item.image ?? FALLBACK_IMAGE} alt={item.name} />
        </Link>
        <FavoriteButton />
        {onSale ? <span className="deal-badge">Deal</span> : null}
      </div>
      <div className="product-card-body">
        <div className="product-card-top">
          <Link href={href} className="product-card-name">
            {item.name}
          </Link>
          <span className="product-rating">
            <Star className="product-star" aria-hidden="true" />
            <span>{item.rating.toFixed(1)}</span>
          </span>
        </div>
        <p className="product-vendor">{item.vendorName}</p>
        <div className="product-card-foot">
          <div>
            <span className="product-price">₦{item.price.toLocaleString()}</span>
            {onSale ? (
              <span className="product-compare">₦{item.compareAtPrice!.toLocaleString()}</span>
            ) : null}
          </div>
          <AddToCart productId={item.id} label="Add" className="add-btn" icon={<Plus className="add-btn-ico" aria-hidden="true" />} />
        </div>
      </div>
    </article>
  );
}
