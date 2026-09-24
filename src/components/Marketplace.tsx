import MarketplaceBrowser from "@/components/MarketplaceBrowser";
import type { CatalogProduct } from "@/lib/catalog-types";
import type { CatalogFilterState } from "@/lib/catalog-href";
import catFood from "@/assets/cat-food.jpg";
import catCakes from "@/assets/cat-cakes.jpg";
import catSnacks from "@/assets/cat-snacks.jpg";
import catDrinks from "@/assets/cat-drinks.jpg";
import catCatering from "@/assets/cat-catering.jpg";

const HERO_IMAGES: Record<string, string> = {
  "/food": catFood.src,
  "/cakes": catCakes.src,
  "/snacks": catSnacks.src,
  "/drinks": catDrinks.src,
  "/catering": catCatering.src,
};

type MarketplaceProps = {
  title: string;
  description: string;
  items: CatalogProduct[];
  total: number;
  basePath: string;
  current: CatalogFilterState;
  page: number;
  totalPages: number;
  vendors: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  maxPrice: number;
};

export default function Marketplace({
  title,
  description,
  items,
  total,
  basePath,
  current,
  page,
  totalPages,
  vendors,
  categories,
  maxPrice,
}: MarketplaceProps) {
  return (
    <>
      <section className="mk-hero">
        <div className="container mk-hero-inner">
          <div className="mk-hero-text">
            <h1>{title}</h1>
            <p>{description}</p>
            <span className="mk-count">{total} products available</span>
          </div>
          <img
            className="mk-hero-img"
            alt={title}
            loading="lazy"
            src={HERO_IMAGES[basePath] ?? catFood.src}
          />
        </div>
      </section>

      <section className="section container">
        <MarketplaceBrowser
          title={title}
          items={items}
          total={total}
          basePath={basePath}
          current={current}
          page={page}
          totalPages={totalPages}
          vendors={vendors}
          categories={categories}
          maxPrice={maxPrice}
        />
      </section>
    </>
  );
}
