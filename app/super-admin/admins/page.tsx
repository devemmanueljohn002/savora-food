"use client";

import { FormEvent, useEffect, useState } from "react";
import { SuperAdminShell, SuperAdminSignIn } from "@/components/SuperAdminShell";
import { Table } from "@/components/ui";
import { useCreateSuperAdmin, useSuperAdmins, useUpdateSuperAdmin } from "@/lib/api/hooks";
import { currentUser } from "@/lib/savora-api";

function AdminActions({ id, role, status, isSelf }: { id: string; role: string; status: string; isSelf: boolean }) {
  const update = useUpdateSuperAdmin(id);
  const [error, setError] = useState("");

  async function act(input: { role?: "ADMIN" | "SUPER_ADMIN"; status?: "ACTIVE" | "SUSPENDED" }) {
    setError("");
    try {
      await update.mutateAsync(input);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  if (isSelf) return <span className="muted">You</span>;

  return (
    <span>
      <span style={{ display: "inline-flex", gap: 8 }}>
        {role === "ADMIN" ? (
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => act({ role: "SUPER_ADMIN" })}>
            Make super
          </button>
        ) : (
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => act({ role: "ADMIN" })}>
            Demote
          </button>
        )}
        {status === "SUSPENDED" ? (
          <button className="btn secondary btn-sm" disabled={update.isPending} onClick={() => act({ status: "ACTIVE" })}>
            Reactivate
          </button>
        ) : (
          <button className="btn danger btn-sm" disabled={update.isPending} onClick={() => act({ status: "SUSPENDED" })}>
            Suspend
          </button>
        )}
      </span>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}

export default function SuperAdminsPage() {
  const admins = useSuperAdmins({ limit: 50 });
  const create = useCreateSuperAdmin();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "", role: "ADMIN" });
  const [error, setError] = useState("");
  const [selfId, setSelfId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentUser()
      .then((user) => {
        if (!cancelled) setSelfId(user.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (admins.isError) return <SuperAdminSignIn />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        email: form.email,
        ...(form.firstName ? { firstName: form.firstName } : {}),
        ...(form.lastName ? { lastName: form.lastName } : {}),
        ...(form.password ? { password: form.password } : {}),
        role: form.role as "ADMIN" | "SUPER_ADMIN",
      });
      setForm({ email: "", firstName: "", lastName: "", password: "", role: "ADMIN" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the admin.");
    }
  }

  return (
    <SuperAdminShell title="Admins" sub="Create and moderate admin accounts. You cannot change your own account.">
      <form className="form-card" style={{ maxWidth: 680, marginBottom: 20 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Add or promote admin</h3>
        <p className="muted">A new email creates an account; an existing admin email promotes it.</p>
        <div className="two-col">
          <label>
            Email
            <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super admin</option>
            </select>
          </label>
        </div>
        <div className="two-col">
          <label>
            First name <span className="field-optional">(new accounts)</span>
            <input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
          </label>
          <label>
            Last name <span className="field-optional">(new accounts)</span>
            <input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
          </label>
        </div>
        <label>
          Password <span className="field-optional">(required for new accounts)</span>
          <input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save admin"}
        </button>
      </form>

      <Table
        loading={admins.isLoading}
        rows={admins.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No admins"
        columns={[
          {
            key: "admin",
            header: "Admin",
            render: (row) => (
              <div>
                <strong>{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.email}</strong>
                <div className="muted-small">
                  {row.email} · Last login {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleDateString("en-NG") : "never"}
                </div>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            render: (row) => (
              <span className={`badge ${row.role === "SUPER_ADMIN" ? "badge-info" : "badge"}`}>{row.role.replaceAll("_", " ")}</span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${row.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>{row.status}</span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <AdminActions id={row.id} role={row.role} status={row.status} isSelf={selfId === row.id} />,
          },
        ]}
      />
    </SuperAdminShell>
  );
}
