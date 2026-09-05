"use client";

import { FormEvent, useState } from "react";
import PageShell from "@/components/PageShell";
import { login, register } from "@/lib/savora-api";

export default function Page() {
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const session = create ? await register({ ...form, ...(form.phone ? { phone: form.phone } : {}) }) : await login({ email: form.email, password: form.password });
      localStorage.setItem("savora.accessToken", session.accessToken);
      localStorage.setItem("savora.refreshToken", session.refreshToken);
      localStorage.setItem("savora.user", JSON.stringify(session.user));
      window.location.href = "/cart";
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication failed"); }
    finally { setBusy(false); }
  }

  return <PageShell><div className="auth"><div style={{ textAlign: "center" }}><h1>Your Food. Your Choice. Delivered.</h1><p className="muted">Sign in or create an account to continue.</p></div>
    <form className="form-card" onSubmit={submit}>
      <div className="tabs"><button type="button" className={!create ? "selected" : ""} onClick={() => setCreate(false)}>Sign in</button><button type="button" className={create ? "selected" : ""} onClick={() => setCreate(true)}>Create account</button></div>
      {create && <><label htmlFor="firstName">First name</label><input id="firstName" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /><label htmlFor="lastName">Last name</label><input id="lastName" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /><label htmlFor="phone">Phone number</label><input id="phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></>}
      <label htmlFor="email">Email</label><input id="email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      <label htmlFor="password">Password</label><input id="password" type="password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      <button className="btn" disabled={busy} style={{ width: "100%", marginTop: 10 }}>{busy ? "Please wait..." : create ? "Create account" : "Sign in"}</button>
    </form><p className="muted" style={{ textAlign: "center" }}>Your account, orders and bookings are stored securely in the cloud.</p></div></PageShell>;
}
