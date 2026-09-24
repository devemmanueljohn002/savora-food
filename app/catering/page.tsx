import PageShell from "@/components/PageShell";
import CateringMarketplace from "@/components/CateringMarketplace";
import { listCateringPackages } from "@/server/queries/catalog";
import heroImage from "@/assets/cat-catering.jpg";

export default async function Page() {
  const packages = await listCateringPackages(48);

  return (
    <PageShell>
      <section className="cat-hero">
        <img className="cat-hero-img" src={heroImage.src} alt="Catering buffet setup" />
        <div className="cat-hero-shade" aria-hidden="true" />
        <div className="cat-hero-body">
          <span className="cat-hero-badge">Catering Marketplace</span>
          <h1>Catering for weddings, corporate events and everything in between</h1>
          <p>Pick a package, share your event details and get a quote from a verified Savora Food caterer.</p>
        </div>
      </section>

      <CateringMarketplace packages={packages} />
    </PageShell>
  );
}