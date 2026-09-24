"use client";

import { useState } from "react";
import { SuperAdminShell, SuperAdminSignIn } from "@/components/SuperAdminShell";
import { Table } from "@/components/ui";
import { useAuditLog } from "@/lib/api/hooks";

export default function SuperAdminAuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const log = useAuditLog({ action: action || undefined, page, limit: 20 });

  if (log.isError) return <SuperAdminSignIn />;

  return (
    <SuperAdminShell title="Audit log" sub="Who changed what, and when.">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Filter by action (e.g. vendor.update)…"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <Table
        loading={log.isLoading}
        rows={log.data?.items ?? []}
        keyOf={(row) => row.id}
        emptyTitle="No audit entries"
        columns={[
          {
            key: "when",
            header: "When",
            render: (row) => (
              <div>
                <div>{new Date(row.createdAt).toLocaleString("en-NG")}</div>
                <div className="muted-small">{row.userEmail ?? "system"}</div>
              </div>
            ),
          },
          {
            key: "action",
            header: "Action",
            render: (row) => (
              <div>
                <strong>{row.action}</strong>
                <div className="muted-small">
                  {[row.entityType, row.entityId].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            ),
          },
          {
            key: "meta",
            header: "Details",
            render: (row) => (
              <code style={{ fontSize: 12, wordBreak: "break-word" }}>
                {JSON.stringify(row.meta ?? {}).slice(0, 160)}
              </code>
            ),
          },
        ]}
      />
      {(log.data?.totalPages ?? 1) > 1 && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn secondary btn-sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page} of {log.data?.totalPages}
          </span>
          <button
            className="btn secondary btn-sm"
            disabled={page >= (log.data?.totalPages ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      )}
    </SuperAdminShell>
  );
}
