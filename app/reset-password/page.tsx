"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { resetPassword } from "@/lib/savora-api";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
      <h1 className="auth-title">Set a new password</h1>
      <p className="auth-sub">Choose a strong password of at least 8 characters.</p>

      <div className="auth-card">
        {!token ? (
          <p className="auth-error" role="alert">
            This reset link is missing its token. <Link href="/forgot-password">Request a new link</Link>.
          </p>
        ) : done ? (
          <p className="auth-success" role="status">
            Password updated. <Link href="/login">Sign in with your new password</Link>.
          </p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm">Confirm new password</label>
              <input
                id="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="auth-submit" disabled={busy}>
              {busy ? "Please wait..." : "Update password"}
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>

      <p className="auth-note">
        <ShieldCheck className="auth-note-ico" aria-hidden="true" />
        All other sessions are signed out when your password changes.
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <PageShell>
      <Suspense>
        <ResetForm />
      </Suspense>
    </PageShell>
  );
}
