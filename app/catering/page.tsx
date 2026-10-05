import Image from "next/image";
import PageShell from "@/components/PageShell";
import CateringMarketplace from "@/components/CateringMarketplace";
import { listCateringPackages } from "@/server/queries/catalog";
import heroImage from "@/assets/cat-catering.jpg";

import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: 'Catering for events in Nigeria',
  description: 'Wedding, corporate and party catering from vetted kitchens. Get a quote in minutes.',
  alternates: { canonical: absoluteUrl('/catering') },
  openGraph: { title: 'Catering for events in Nigeria', description: 'Wedding, corporate and party catering from vetted kitchens. Get a quote in minutes.', url: absoluteUrl('/catering') },
};

export default async function Page() {
  const packages = await listCateringPackages(48);

  return (
    <PageShell>
      <section className="cat-hero">
        <Image className="cat-hero-img" src={heroImage} alt="Catering buffet setup" priority sizes="100vw" />
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