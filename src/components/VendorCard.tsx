import Link from "next/link";
import { BadgeCheck, Bike, MapPin, Star } from "lucide-react";
import type { CatalogVendor } from "@/lib/catalog-types";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80";

export default function VendorCard({
  vendor,
  delivery = null,
}: {
  vendor: CatalogVendor;
  delivery?: { fee: number; minutes: number } | null;
}) {
  const image = vendor.bannerImageUrl ?? vendor.logoUrl ?? FALLBACK_IMAGE;
  const location = [vendor.city, vendor.state].filter(Boolean).join(", ") || "Nigeria";

  return (
    <article className="vendor-card">
      <img className="vendor-card-img" src={image} alt={vendor.name} />
      <div className="vendor-card-body">
        <div className="vendor-card-head">
          <div>
            <h3 className="vendor-card-name">
              {vendor.name}
              <BadgeCheck className="vendor-verified" aria-hidden="true" />
            </h3>
            <p className="vendor-card-desc">
              {vendor.description ?? "Freshly prepared by a trusted vendor."}
            </p>
          </div>
          <span className="vendor-rating">
            <Star className="vendor-star" aria-hidden="true" />
            <span>{vendor.rating.toFixed(1)}</span>
          </span>
        </div>
        <div className="vendor-tags">
          {vendor.categories.slice(0, 2).map((category) => (
            <div className="tag-badge" key={category}>{category}</div>
          ))}
        </div>
        <div className="vendor-meta">
          <span>
            <MapPin aria-hidden="true" /> {location}
          </span>
          {delivery ? (
            <span>
              <Bike aria-hidden="true" /> {delivery.minutes} min · &#8358;{delivery.fee.toLocaleString()}
            </span>
          ) : null}
        </div>
        <Link className="vendor-view-btn" href={`/vendor/${vendor.slug}`}>
          View Vendor
        </Link>
      </div>
    </article>
  );
}