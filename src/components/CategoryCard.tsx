import Link from "next/link";
import type { CatalogCategory } from "@/lib/catalog-types";

const CATEGORY_ROUTES: Record<string, string> = {
  food: "/food",
  cakes: "/cakes",
  snacks: "/snacks",
  drinks: "/drinks",
  catering: "/catering",
};

const CATEGORY_IMAGES: Record<string, string> = {
  food: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
  cakes: "https://images.unsplash.com/photo-1559620192-032c4bc4674e?auto=format&fit=crop&w=1200&q=80",
  snacks: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80",
  drinks: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=1200&q=80",
  catering: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85",
};

export function categoryHref(category: CatalogCategory): string {
  return CATEGORY_ROUTES[category.slug] ?? `/search?category=${encodeURIComponent(category.slug)}`;
}

const CATEGORY_SUB: Record<string, string> = {
  food: "Hot meals from trusted kitchens",
  cakes: "Celebration & custom cakes",
  snacks: "Small chops, pies & pastries",
  drinks: "Juices, smoothies & more",
  catering: "Book caterers for any event",
};

export default function CategoryCard({ category }: { category: CatalogCategory }) {
  return (
    <Link className="card category-card" href={categoryHref(category)}>
      <img src={CATEGORY_IMAGES[category.slug] ?? CATEGORY_IMAGES.food} alt={category.name} />
      <div className="card-body">
        <h3 className="category-name">{category.name}</h3>
        <p className="muted category-sub">{CATEGORY_SUB[category.slug] ?? "Explore Savora Food"}</p>
      </div>
    </Link>
  );
}