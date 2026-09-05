import PageShell from "@/components/PageShell";
import ProductCard from "@/components/ProductCard";
import { getVendorById, getVendorProducts } from "@/lib/savora-api";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  const vendorProducts = vendor ? await getVendorProducts(id) : [];
  if (!vendor) return <PageShell><section className="section container"><h1>Vendor unavailable</h1><p className="muted">This vendor could not be loaded from Savora Food.</p></section></PageShell>;
  return <PageShell><section className="section container"><img className="hero-img" src={vendor.image} alt={vendor.name} /><h1>{vendor.name}</h1><p className="muted">{vendor.tagline}</p><p className="rating">★ {vendor.rating} · {vendor.category} · {vendor.city}</p><h2>Available products</h2><div className="grid">{vendorProducts.map(product => <ProductCard item={product} key={product.id} />)}</div></section></PageShell>;
}
