"use client";

import Link from "next/link";
import { ArrowRight, Bike, Search, ShieldCheck, Star, Timer } from "lucide-react";
import { useCurrentUser } from "@/lib/api/hooks";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=85";

function HeroSearch() {
  return (
    <form className="hero-search" action="/search" method="get" role="search">
      <div className="hero-search-field">
        <Search className="hero-search-icon" aria-hidden="true" />
        <input
          className="hero-search-input"
          type="search"
          name="q"
          placeholder="Search jollof, cakes, small chops, vendors…"
          aria-label="Search food and vendors"
        />
      </div>
      <button className="hero-search-btn" type="submit">
        Find Food <ArrowRight className="hero-search-btn-ico" aria-hidden="true" />
      </button>
    </form>
  );
}

/**
 * Home hero. Logged-out visitors get the full marketing hero; signed-in
 * users get a compact greeting with search and a track-order shortcut.
 */
export default function HomeHero() {
  const { data: currentUser, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <section className="hero" aria-busy="true" aria-label="Loading">
        <div className="container">
          <p className="muted">Finding today&rsquo;s kitchens…</p>
        </div>
      </section>
    );
  }

  if (!currentUser) {
    return (
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-badge">Now delivering in Lagos, Abuja, Ibadan &amp; Port Harcourt</div>
            <h1 className="hero-title">
              Your Food.
              <br />
              Your Choice. <span className="hero-gradient">Delivered.</span>
            </h1>
            <p className="hero-lead">
              Savora Food connects you with restaurants, bakers, snack vendors, drink makers and caterers —
              order in minutes, pay securely and track every delivery.
            </p>
            <HeroSearch />
            <div className="hero-points">
              <span className="hero-point">
                <Timer className="text-primary" aria-hidden="true" /> 30-min average delivery
              </span>
              <span className="hero-point">
                <ShieldCheck className="text-accent" aria-hidden="true" /> Secure Naira payments
              </span>
              <span className="hero-point">
                <Star className="text-secondary fill-secondary" aria-hidden="true" /> 4.8 average vendor rating
              </span>
            </div>
          </div>
          <img className="hero-img" src={HERO_IMAGE} alt="Nigerian food spread" />
        </div>
      </section>
    );
  }

  const firstName = currentUser.firstName?.trim().split(" ")[0] || "there";

  return (
    <section className="hero hero-compact">
      <div className="container">
        <h1 className="hero-hello">Hi {firstName}, what are you craving?</h1>
        <HeroSearch />
        <Link className="hero-track" href="/track">
          <Bike className="hero-track-ico" aria-hidden="true" /> Track order
        </Link>
      </div>
    </section>
  );
}
