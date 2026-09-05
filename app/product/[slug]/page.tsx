import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import { food } from "@/lib/data";
import { getProductById } from "@/lib/savora-api";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductById(slug);
  if (!product) return <PageShell><section className="section container"><h1>Product unavailable</h1><p className="muted">This product could not be loaded from Savora Food.</p></section></PageShell>;
  return <PageShell><section className="container product"><img className="product-image" src={product.image} alt={product.name} /><div><span className="pill">{product.category}</span><h1>{product.name}</h1><p className="rating">★ {product.rating}　 {product.vendor}　 <span className="pill">Available now</span></p><p className="muted">{product.description}</p><h1 className="price">₦{product.price.toLocaleString()}</h1><div className="form-card"><p className="muted">Add this item from the product card or choose a vendor listing to add it to your saved cart.</p></div></div></section><section className="section container"><h2>More food</h2><div className="grid">{food.slice(0, 3).map((item, index) => <ProductCard item={item} key={index} />)}</div></section></PageShell>;
}
