import ProductCard from "@/components/ProductCard";

type MarketplaceProps = {
  title: string;
  description: string;
  items: Array<{
    id?: string;
    name: string;
    vendor?: string;
    category?: string;
    price: number;
    oldPrice?: number;
    rating?: number;
    image: string;
    description?: string;
    location?: string;
  }>;
};

export default function Marketplace({ title, description, items }: MarketplaceProps) {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="section container">
        <div className="row" style={{ gap: 12, marginBottom: 20 }}>
          <input className="search" placeholder="Search vendors" style={{ width: "100%" }} />
          <select className="search" style={{ width: 180 }}>
            <option>All cities</option>
            <option>Lagos</option>
            <option>Abuja</option>
            <option>Ibadan</option>
          </select>
          <select className="search" style={{ width: 190 }}>
            <option>All categories</option>
            <option>Food</option>
            <option>Cakes</option>
            <option>Snacks</option>
            <option>Drinks</option>
          </select>
          <select className="search" style={{ width: 180 }}>
            <option>Highest rated</option>
            <option>Most popular</option>
            <option>Lowest price</option>
          </select>
        </div>

        <div className="grid">
          {items.map((item, index) => (
            <ProductCard key={`${item.name}-${index}`} item={item} />
          ))}
        </div>
      </section>
    </>
  );
}
