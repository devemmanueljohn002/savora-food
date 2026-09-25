"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { requestPasswordReset } from "@/lib/savora-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="auth-wrap">
        <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
        <h1 className="auth-title">Forgot your password?</h1>
        <p className="auth-sub">Enter your account email and we will send you a reset link.</p>

        <div className="auth-card">
          {done ? (
            <p className="auth-success" role="status">
              If that email is registered, a reset link is on its way. The link expires in 1 hour — check your inbox
              (and spam folder).
            </p>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <div className="auth-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy ? "Please wait..." : "Send reset link"}
              </button>
            </form>
          )}

          <div className="auth-links">
            <Link href="/auth">Back to sign in</Link>
            <Link href="/auth?tab=up">Create an account</Link>
          </div>
        </div>

        <p className="auth-note">
          <ShieldCheck className="auth-note-ico" aria-hidden="true" />
          Reset links expire after 1 hour and can only be used once.
        </p>
      </div>
    </PageShell>
  );
}
