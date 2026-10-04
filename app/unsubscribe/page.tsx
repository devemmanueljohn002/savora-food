"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/PageShell";

async function postUnsubscribe(token: string, resubscribe: boolean): Promise<{ optedOut: boolean }> {
  const res = await fetch("/api/email/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, resubscribe }),
  });
  const envelope = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { optedOut: boolean };
  } | null;
  if (!envelope?.success || !envelope.data) {
    throw new Error(envelope?.message ?? "Something went wrong. Please try again.");
  }
  return envelope.data;
}

function UnsubscribeForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  async function run(resubscribe: boolean) {
    setError("");
    setState("working");
    try {
      const result = await postUnsubscribe(token, resubscribe);
      setOptedOut(result.optedOut);
      setState("done");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
      setState("error");
    }
  }

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 560 }}>
        <h1>Email preferences</h1>
        <p className="muted">
          Control whether Savora Food sends order updates and offers to your inbox. In-app
          notifications are unaffected.
        </p>
        {!token ? (
          <p className="auth-error" role="alert">
            This link is missing its token. Please open the unsubscribe link from your email again.
          </p>
        ) : state === "done" && optedOut !== null ? (
          <>
            <p className="auth-success" role="status">
              {optedOut
                ? "You are unsubscribed — no more order update emails."
                : "You are subscribed again — order update emails are back on."}
            </p>
            <button className="btn secondary" type="button" onClick={() => run(!optedOut)}>
              {optedOut ? "Resubscribe" : "Unsubscribe again"}
            </button>
          </>
        ) : (
          <>
            {state === "error" && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn" type="button" disabled={state === "working"} onClick={() => run(false)}>
                {state === "working" ? "Working…" : "Unsubscribe me"}
              </button>
              <button
                className="btn secondary"
                type="button"
                disabled={state === "working"}
                onClick={() => run(true)}
              >
                Keep me subscribed
              </button>
            </div>
          </>
        )}
        <p style={{ marginTop: 24 }}>
          <Link href="/">Back to Savora Food</Link>
        </p>
      </section>
    </PageShell>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <UnsubscribeForm />
    </Suspense>
  );
}
