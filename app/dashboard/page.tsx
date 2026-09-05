import PageShell from "@/components/PageShell";

const tabs = ["Overview", "Orders", "Catering", "Favorites", "Notifications", "Profile"];

export default function Page() {
  return (
    <PageShell>
      <section className="section container">
        <div className="row" style={{ alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 46, lineHeight: 1.1 }}>Welcome to Savora Food</h1>
            <p className="section-sub" style={{ marginTop: 10, marginBottom: 0 }}>
              Manage your orders, catering bookings and favorites.
            </p>
          </div>
          <button className="btn">Sign in</button>
        </div>

        <div className="tabs" style={{ maxWidth: 560 }}>
          {tabs.map((tab) => (
            <span className={tab === "Favorites" ? "selected" : ""} key={tab}>
              {tab}
            </span>
          ))}
        </div>

        <h2>Favorite products</h2>
        <div className="form-card" style={{ textAlign: "center", padding: 45, minHeight: 180, display: "grid", placeItems: "center", gap: 14 }}>
          <div aria-hidden="true" style={{ fontSize: 34, color: "#c2b8ad" }}>♡</div>
          <p className="muted" style={{ margin: 0 }}>
            Tap the heart on any product to save it here.
          </p>
          <button className="btn secondary">Find something tasty</button>
        </div>

        <h2 style={{ marginTop: 32 }}>Favorite vendors</h2>
        <div className="form-card" style={{ textAlign: "center", padding: 45, minHeight: 180, display: "grid", placeItems: "center", gap: 14 }}>
          <div aria-hidden="true" style={{ fontSize: 34, color: "#c2b8ad" }}>♡</div>
          <p className="muted" style={{ margin: 0 }}>
            No saved vendors yet.
          </p>
          <button className="btn secondary">Discover vendors</button>
        </div>
      </section>
    </PageShell>
  );
}
