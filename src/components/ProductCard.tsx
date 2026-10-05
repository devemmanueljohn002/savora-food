import Link from "next/link";
import { Plus, Star } from "lucide-react";
import AddToCart from "./AddToCart";
import FavoriteButton from "./FavoriteButton";
import ProductImage from "./ProductImage";
import type { CatalogProduct } from "@/lib/catalog-types";

export default function ProductCard({ item }: { item: CatalogProduct }) {
  const href = `/product/${item.slug}`;
  const onSale = item.compareAtPrice !== null && item.compareAtPrice > item.price;

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={href} aria-label={item.name}>
          <ProductImage className="product-card-img" src={item.image} alt={item.name} width={800} height={600} />
        </Link>
        <FavoriteButton productId={item.id} />
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
