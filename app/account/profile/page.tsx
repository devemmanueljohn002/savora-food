"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "@/components/PageShell";
import { useAccount, useChangeAccountPassword, useUpdateAccount } from "@/lib/api/hooks";
import { resendVerification, type AccountProfile } from "@/lib/savora-api";

function ProfileForms({ user }: { user: AccountProfile }) {
  const router = useRouter();
  const update = useUpdateAccount();
  const changePassword = useChangeAccountPassword();

  const [form, setForm] = useState({
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: user.phone ?? "",
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");
  const [resent, setResent] = useState(false);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    try {
      await update.mutateAsync({
        firstName: form.firstName,
        lastName: form.lastName,
        ...(form.phone ? { phone: form.phone } : { phone: null }),
      });
      setProfileMessage("Profile updated.");
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : "Could not update your profile.");
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError("New passwords do not match.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      // Session was revoked server-side; force a fresh sign in.
      localStorage.removeItem("savora.user");
      router.push("/login");
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : "Could not change your password.");
    }
  }

  async function resend() {
    try {
      await resendVerification(user.email);
    } catch {
      // Respond identically either way; the link lasts 24 hours.
    }
    setResent(true);
  }

  return (
    <>
      <div className="form-card" style={{ marginBottom: 20 }}>
        <div className="row">
          <div>
            <strong>{user.email}</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>{user.role.replaceAll("_", " ")}</p>
          </div>
          {user.emailVerifiedAt ? (
            <span className="badge badge-success">Verified</span>
          ) : (
            <span className="badge badge-warning">Unverified</span>
          )}
        </div>
        {!user.emailVerifiedAt && (
          <p style={{ marginBottom: 0 }}>
            <button className="btn secondary btn-sm" type="button" onClick={resend}>
              Resend verification email
            </button>{" "}
            {resent && <span className="muted">Check your inbox — the link lasts 24 hours.</span>}
          </p>
        )}
      </div>

      <form className="form-card" style={{ marginBottom: 20 }} onSubmit={submitProfile}>
        <h3 style={{ marginTop: 0 }}>Personal details</h3>
        <label>
          First name
          <input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </label>
        {profileMessage && (
          <p className="auth-success" role="status">
            {profileMessage}
          </p>
        )}
        {profileError && (
          <p className="auth-error" role="alert">
            {profileError}
          </p>
        )}
        <button className="btn" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </form>

      <form className="form-card" onSubmit={submitPassword}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <p className="muted">Changing your password signs you out everywhere.</p>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
          />
        </label>
        {passwordError && (
          <p className="auth-error" role="alert">
            {passwordError}
          </p>
        )}
        <button className="btn" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Updating…" : "Update password"}
        </button>
      </form>
    </>
  );
}

export default function AccountProfilePage() {
  const account = useAccount();

  if (account.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading your profile…</p>
        </section>
      </PageShell>
    );
  }

  if (account.isError || !account.data) {
    return (
      <PageShell>
        <section className="section container">
          <h1>Profile</h1>
          <p className="muted">Please sign in to manage your profile.</p>
          <Link className="btn" href="/login?next=/account/profile">Sign in</Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 720 }}>
        <h1>Profile</h1>
        <p className="section-sub">Keep your contact details up to date.</p>
        <ProfileForms key={account.data.user.id} user={account.data.user} />
      </section>
    </PageShell>
  );
}
