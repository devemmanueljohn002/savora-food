import PageShell from "@/components/PageShell";
import PartnerApply from "@/components/PartnerApply";
import { Store, Users, Wallet } from "lucide-react";

import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Partner with Savora Food",
  description: "Join thousands of Nigerian food entrepreneurs and riders earning on Savora Food. Zero setup fee, weekly payouts.",
  alternates: { canonical: absoluteUrl("/partner") },
  openGraph: {
    title: "Partner with Savora Food",
    description: "Join thousands of Nigerian food entrepreneurs and riders earning on Savora Food. Zero setup fee, weekly payouts.",
    url: absoluteUrl("/partner"),
  },
  twitter: {
    card: "summary_large_image",
    title: "Partner with Savora Food",
    description: "Join thousands of Nigerian food entrepreneurs and riders earning on Savora Food. Zero setup fee, weekly payouts.",
  },
};

const FEATURES = [
  {
    icon: Users,
    title: "Reach more customers",
    text: "Get discovered by hungry customers in your area every day.",
  },
  {
    icon: Wallet,
    title: "Weekly payouts",
    text: "Settlements to your Nigerian bank account every Tuesday.",
  },
  {
    icon: Store,
    title: "Free storefront",
    text: "A branded vendor page, menu tools and live order management.",
  },
];

export default function Page() {
  return (
    <PageShell>
      <section className="vendors-hero">
        <div className="vendors-wrap">
          <h1>Partner with Savora Food</h1>
          <p>Join thousands of Nigerian food entrepreneurs and riders earning on Savora Food. Zero setup fee, weekly payouts.</p>
        </div>
      </section>

      <div className="part-wrap">
        <div className="part-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div className="about-card" key={title}>
              <Icon aria-hidden="true" />
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          ))}
        </div>

        <PartnerApply />
      </div>
    </PageShell>
  );
}