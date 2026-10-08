import Link from "next/link";
import Image from "next/image";
import PageShell from "@/components/PageShell";
import { Heart, Rocket, ShieldCheck, Users } from "lucide-react";
import heroImage from "@/assets/hero-food.jpg";

import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: 'About Savora Food',
  description: "We're building Nigeria's most loved food marketplace. Your Food. Your Choice. Delivered.",
  alternates: { canonical: absoluteUrl('/about') },
  openGraph: { title: 'About Savora Food', description: "We're building Nigeria's most loved food marketplace. Your Food. Your Choice. Delivered.", url: absoluteUrl('/about') },
  twitter: { card: 'summary_large_image', title: 'About Savora Food', description: "We're building Nigeria's most loved food marketplace. Your Food. Your Choice. Delivered." },
};

export default function Page() {
  return (
    <PageShell>
      <section className="about-hero">
        <Image className="about-hero-img" src={heroImage} alt="Nigerian dishes spread on a table" priority sizes="100vw" />
        <div className="about-hero-shade" aria-hidden="true" />
        <div className="about-hero-body">
          <h1>We&rsquo;re building Nigeria&rsquo;s most loved food marketplace</h1>
          <p>Your Food. Your Choice. Delivered.</p>
        </div>
      </section>

      <div className="about-body">
        <p className="about-lede">
          Savora Food started with a simple observation: Nigeria has extraordinary food, but ordering it was
          unreliable. We built one platform where customers discover trusted kitchens, bakers, snack makers and
          caterers - and where those vendors get the tools, riders and payments they need to grow.
        </p>

        <div className="about-grid">
          <div className="about-card">
            <Heart aria-hidden="true" />
            <h2>Food first</h2>
            <p>Every vendor is tasted, vetted and rated by real customers before they go live.</p>
          </div>
          <div className="about-card">
            <ShieldCheck aria-hidden="true" />
            <h2>Trust &amp; safety</h2>
            <p>Verified kitchens, hygienic packaging and secure payments on every order.</p>
          </div>
          <div className="about-card">
            <Users aria-hidden="true" />
            <h2>Local livelihoods</h2>
            <p>We help home kitchens, bakers and riders build sustainable income.</p>
          </div>
          <div className="about-card">
            <Rocket aria-hidden="true" />
            <h2>Speed</h2>
            <p>Optimised routing keeps most Lagos deliveries under 45 minutes.</p>
          </div>
        </div>

        <div className="about-stats">
          <div className="about-stat">
            <b>1,200+</b>
            <span>Meals delivered weekly</span>
          </div>
          <div className="about-stat">
            <b>60+</b>
            <span>Verified vendors</span>
          </div>
          <div className="about-stat">
            <b>4.8★</b>
            <span>Average customer rating</span>
          </div>
        </div>

        <div className="about-cta">
          <Link className="btn" href="/food">
            Order now
          </Link>
          <Link className="btn secondary" href="/partner">
            Partner with us
          </Link>
        </div>
      </div>
    </PageShell>
  );
}