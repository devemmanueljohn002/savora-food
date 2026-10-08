"use client";

import { useEffect } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { Home, AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Client error]", error);
  }, [error]);

  return (
    <PageShell>
      <section className="section container" style={{ textAlign: "center", paddingTop: 80, paddingBottom: 80 }}>
        <AlertTriangle className="hdr-ico" style={{ fontSize: 48, color: "var(--danger)", marginBottom: 16 }} aria-hidden="true" />
        <h1 style={{ margin: "0 0 12px", fontSize: 32 }}>Something went wrong</h1>
        <p className="muted" style={{ marginBottom: 32, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
          An unexpected error occurred. Our team has been notified.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={() => reset()}>
            <RefreshCw className="hdr-ico" aria-hidden="true" /> Try again
          </button>
          <Link className="btn secondary" href="/">
            <Home className="hdr-ico" aria-hidden="true" /> Home
          </Link>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details style={{ marginTop: 32, textAlign: "left", maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
            <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Error details (dev)</summary>
            <pre style={{ marginTop: 12, padding: 16, background: "var(--paper)", borderRadius: 8, overflow: "auto", fontSize: 12 }}>
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}
      </section>
    </PageShell>
  );
}