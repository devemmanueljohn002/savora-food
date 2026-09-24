"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { dashboardForRole, login } from "@/lib/savora-api";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login({ identifier: form.identifier, password: form.password });
      localStorage.setItem("savora.user", JSON.stringify(user));
      const target = next.startsWith("/") && !next.startsWith("//") ? next : dashboardForRole(user.role);
      window.location.href = target;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-sub">Sign in to order, sell or deliver with Savora Food.</p>

      <div className="auth-card">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="identifier">Email or phone number</label>
            <input
              id="identifier"
              required
              autoComplete="username"
              value={form.identifier}
              onChange={(event) => setForm({ ...form, identifier: event.target.value })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="auth-submit" disabled={busy}>
            {busy ? "Please wait..." : "Sign in"}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <span>
            New here? <Link href="/register">Create an account</Link>
          </span>
        </div>
      </div>

      <p className="auth-note">
        <ShieldCheck className="auth-note-ico" aria-hidden="true" />
        Your account, orders and bookings are stored securely in the cloud.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PageShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </PageShell>
  );
}
