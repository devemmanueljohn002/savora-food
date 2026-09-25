"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { dashboardForRole, login, register } from "@/lib/savora-api";

type Tab = "in" | "up";
type Role = "customer" | "vendor" | "rider";

const ROLES: { value: Role; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "rider", label: "Rider" },
];

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3h-4a12 12 0 0 0 0 10.7l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

function AuthCard() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [tab, setTab] = useState<Tab>(searchParams.get("tab") === "up" ? "up" : "in");
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function selectTab(value: Tab) {
    setTab(value);
    setError("");
    setNotice("");
    const url = new URL(window.location.href);
    if (value === "up") url.searchParams.set("tab", "up");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  }

  function destination(roleName: string) {
    return next.startsWith("/") && !next.startsWith("//") ? next : dashboardForRole(roleName);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const user = await login({ email: form.email, password: form.password });
      localStorage.setItem("savora.user", JSON.stringify(user));
      window.location.href = destination(user.role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
      setBusy(false);
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const [firstName, ...rest] = form.name.trim().split(/\s+/);
    const lastName = rest.join(" ");
    if (!firstName || !lastName) {
      setError("Enter your first and last name");
      return;
    }

    setBusy(true);
    try {
      const phone = form.phone.replace(/[\s()-]/g, "");
      const user = await register({
        firstName,
        lastName,
        email: form.email,
        ...(phone ? { phone } : {}),
        password: form.password,
        role,
      });
      localStorage.setItem("savora.user", JSON.stringify(user));
      window.location.href = user.role === "VENDOR" ? "/vendor/onboarding" : destination(user.role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
      <h1 className="auth-title">Your Food. Your Choice. Delivered.</h1>
      <p className="auth-sub">Sign in or create an account to continue.</p>

      <div className="auth-card">
        <button
          className="auth-google"
          type="button"
          disabled={busy}
          onClick={() => {
            setError("");
            setNotice("Google sign-in is not set up yet. Use your email and password below.");
          }}
        >
          <GoogleMark />
          Continue with Google
        </button>

        <div className="auth-divider">
          <span />
          <em>or use email</em>
          <span />
        </div>

        <div className="auth-field auth-role">
          <label htmlFor="role">I am signing up as</label>
          <select
            id="role"
            className="auth-select"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "in"}
            aria-controls="auth-panel-in"
            id="auth-tab-in"
            className={tab === "in" ? "selected" : undefined}
            onClick={() => selectTab("in")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "up"}
            aria-controls="auth-panel-up"
            id="auth-tab-up"
            className={tab === "up" ? "selected" : undefined}
            onClick={() => selectTab("up")}
          >
            Create account
          </button>
        </div>

        {tab === "in" ? (
          <div role="tabpanel" id="auth-panel-in" aria-labelledby="auth-tab-in">
            <form className="auth-form" onSubmit={signIn}>
              <div className="auth-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              {notice && (
                <p className="auth-error" role="alert">
                  {notice}
                </p>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy ? "Please wait..." : "Sign in"}
              </button>
              <div className="auth-links">
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            </form>
          </div>
        ) : (
          <div role="tabpanel" id="auth-panel-up" aria-labelledby="auth-tab-up">
            <form className="auth-form" onSubmit={signUp}>
              <div className="auth-field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="su-email">Email</label>
                <input
                  id="su-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  name="phone"
                  autoComplete="tel"
                  placeholder="0803 000 0000"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="su-password">Password</label>
                <input
                  id="su-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              {role === "vendor" && (
                <p className="auth-success" role="note">
                  Vendor accounts start in review. After signing up you will complete your business profile, and an
                  admin will approve your kitchen before it goes live.
                </p>
              )}
              {notice && (
                <p className="auth-error" role="alert">
                  {notice}
                </p>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button className="auth-submit" disabled={busy}>
                {busy ? "Please wait..." : "Create account"}
              </button>
            </form>
          </div>
        )}
      </div>

      <p className="auth-note">
        <ShieldCheck className="auth-note-ico" aria-hidden="true" />
        Your account, orders and bookings are stored securely in the cloud.
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <PageShell>
      <Suspense>
        <AuthCard />
      </Suspense>
    </PageShell>
  );
}
