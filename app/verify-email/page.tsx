"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { resendVerification, verifyEmail } from "@/lib/savora-api";

type Status = "idle" | "working" | "done" | "error";

function VerifyPanel() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "working" : "idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setStatus("done");
          setMessage("Email confirmed. Your account is fully activated.");
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setStatus("error");
          setMessage(reason instanceof Error ? reason.message : "Verification failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      await resendVerification(email);
      setResent(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
      <h1 className="auth-title">Verify your email</h1>
      <p className="auth-sub">Confirm your address to fully activate your account.</p>

      <div className="auth-card">
        {status === "working" && <p className="muted">Confirming your email…</p>}
        {status === "done" && (
          <p className="auth-success" role="status">
            {message}           <Link href="/auth">Sign in to continue</Link>.
          </p>
        )}
        {status === "error" && (
          <p className="auth-error" role="alert">
            {message}
          </p>
        )}
        {status === "idle" && !token && (
          <p className="muted">This page confirms the link from your verification email. No token was provided.</p>
        )}

        <form className="auth-form" onSubmit={resend}>
          <div className="auth-field">
            <label htmlFor="email">Didn&apos;t get the email? Resend it</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {resent && (
            <p className="auth-success" role="status">
              If that email is registered, a verification link is on its way (valid for 24 hours).
            </p>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy ? "Please wait..." : "Resend verification email"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/auth">Back to sign in</Link>
          <Link href="/auth?tab=up">Create an account</Link>
        </div>
      </div>

      <p className="auth-note">
        <MailCheck className="auth-note-ico" aria-hidden="true" />
        Verification links expire after 24 hours and can only be used once.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <PageShell>
      <Suspense>
        <VerifyPanel />
      </Suspense>
    </PageShell>
  );
}
