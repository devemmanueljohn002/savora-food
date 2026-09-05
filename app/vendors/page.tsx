import PageShell from "@/components/PageShell";
import Link from "next/link";
import { vendors } from "@/lib/data";
import { getVendors } from "@/lib/savora-api";

export default async function Page() {
  const liveVendors = await getVendors();

  return (
    <PageShell>
      <section className="section container">
        <h1 style={{ margin: 0, fontSize: 52, lineHeight: 1.1 }}>Vendors on Savora Food</h1>
        <p className="section-sub" style={{ marginTop: 10 }}>
          Restaurants, home kitchens, bakers, snack makers, drink brands and caterers — all verified before they go live.
        </p>

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
          {(liveVendors.length ? liveVendors : vendors).map((vendor) => (
            <article className="card" key={vendor.id}>
              <img src={vendor.image} alt={vendor.name} style={{ height: 230, objectFit: "cover" }} />
              <div className="card-body">
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <strong>{vendor.name}</strong>
                    <p className="muted" style={{ margin: "6px 0 0" }}>{vendor.tagline}</p>
                  </div>
                  <span className="rating">★ {vendor.rating}</span>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="pill" style={{ background: "#f9ebd3", color: "#5b3d13" }}>{vendor.category}</span>
                  <span className="muted">{vendor.verified ? "Verified" : "New"}</span>
                </div>
                <div className="muted" style={{ marginTop: 12 }}>{vendor.location}, {vendor.city}</div>
                <Link className="btn secondary" href={`/vendor/${vendor.id}`} style={{ width: "100%", marginTop: 18, textAlign: "center" }}>View Vendor</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
