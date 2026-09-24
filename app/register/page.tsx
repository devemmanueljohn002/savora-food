"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import PageShell from "@/components/PageShell";
import { dashboardForRole, register } from "@/lib/savora-api";

type Role = "customer" | "vendor" | "rider";

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "customer", label: "Customer", hint: "Order food and book catering." },
  { value: "vendor", label: "Vendor", hint: "Sell on the marketplace (approval required)." },
  { value: "rider", label: "Rider", hint: "Deliver orders and earn per trip." },
];

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("customer");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        ...(form.phone ? { phone: form.phone } : {}),
        password: form.password,
        role,
      });
      localStorage.setItem("savora.user", JSON.stringify(user));
      window.location.href = user.role === "VENDOR" ? "/vendor/onboarding" : dashboardForRole(user.role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="auth-wrap">
        <img className="auth-logo" src="/savora-logo-stacked.png" alt="Savora Food" width={160} height={64} />
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">One account for ordering, selling and delivering.</p>

        <div className="auth-card">
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-field auth-role">
              <label htmlFor="role">I am joining as</label>
              <select
                id="role"
                className="auth-select"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {ROLES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.hint}
                  </option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
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
                autoComplete="tel"
                placeholder="08012345678"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
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
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="auth-submit" disabled={busy}>
              {busy ? "Please wait..." : "Create account"}
            </button>
          </form>

          <div className="auth-links">
            <span>
              Have an account? <Link href="/login">Sign in</Link>
            </span>
          </div>
        </div>

        <p className="auth-note">
          <ShieldCheck className="auth-note-ico" aria-hidden="true" />
          We will email you a verification link to activate your account.
        </p>
      </div>
    </PageShell>
  );
}
