import Link from "next/link";
import PageShell from "@/components/PageShell";
import { Home, Search, RotateCcw } from "lucide-react";

export default function NotFound() {
  return (
    <PageShell>
      <section className="section container" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 80 }}>
        <div style={{ fontSize: 96, fontWeight: 800, color: "var(--line)", lineHeight: 1, marginBottom: 16 }}>
          404
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 32 }}>Page not found</h1>
        <p className="muted" style={{ marginBottom: 32, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
          Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn" href="/">
            <Home className="hdr-ico" aria-hidden="true" /> Home
          </Link>
          <Link className="btn secondary" href="/search">
            <Search className="hdr-ico" aria-hidden="true" /> Search
          </Link>
          <Link className="btn ghost" href="#" onClick={() => window.history.back()}>
            <RotateCcw className="hdr-ico" aria-hidden="true" /> Go back
          </Link>
        </div>
      </section>
    </PageShell>
  );
}