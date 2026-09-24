"use client";

import { FormEvent, useState } from "react";
import { AdminShell, AdminSignIn } from "@/components/AdminShell";
import { Table } from "@/components/ui";
import { useAdminCategories, useCreateAdminCategory, useUpdateAdminCategory } from "@/lib/api/hooks";

function CategoryActions({ id, isActive }: { id: string; isActive: boolean }) {
  const update = useUpdateAdminCategory(id);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    try {
      await update.mutateAsync({ isActive: !isActive });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action failed.");
    }
  }

  return (
    <span>
      <button className="btn secondary btn-sm" disabled={update.isPending} onClick={toggle}>
        {isActive ? "Deactivate" : "Activate"}
      </button>
      {error && <span className="auth-error">{error}</span>}
    </span>
  );
}

export default function AdminSettingsPage() {
  const categories = useAdminCategories();
  const create = useCreateAdminCategory();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (categories.isError) return <AdminSignIn />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await create.mutateAsync({ name: name.trim() });
      setName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the category.");
    }
  }

  return (
    <AdminShell title="Settings" sub="Catalog categories used across the marketplace.">
      <form className="form-card" style={{ maxWidth: 560, marginBottom: 20 }} onSubmit={submit}>
        <h3 style={{ marginTop: 0 }}>Add category</h3>
        <label>
          Name
          <input required value={name} placeholder="e.g. Shawarma" onChange={(event) => setName(event.target.value)} />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Add category"}
        </button>
      </form>

      <Table
        loading={categories.isLoading}
        rows={categories.data ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No categories"
        columns={[
          {
            key: "name",
            header: "Category",
            render: (row) => (
              <div>
                <strong>{row.name}</strong>
                <div className="muted-small">
                  /{row.slug} · {row.productCount} products · order {row.sortOrder}
                </div>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (row) => (
              <span className={`badge ${row.isActive ? "badge-success" : "badge-warning"}`}>
                {row.isActive ? "Active" : "Inactive"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (row) => <CategoryActions id={row.id} isActive={row.isActive} />,
          },
        ]}
      />
    </AdminShell>
  );
}
