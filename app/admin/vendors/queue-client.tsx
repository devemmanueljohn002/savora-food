"use client";

import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import VendorApprovalPanel, { VENDOR_TABS, type VendorTabKey } from "./approval-panel";

export default function VendorQueueClient() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "pending";
  const initialTab: VendorTabKey = VENDOR_TABS.some((t) => t.key === raw) ? (raw as VendorTabKey) : "pending";

  return (
    <AdminShell title="Vendors" sub="Review kitchen applications and manage live kitchens.">
      <VendorApprovalPanel key={initialTab} initialTab={initialTab} limit={15} showPager />
    </AdminShell>
  );
}
