"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@/lib/savora-api";

export default function SignOutButton({ className = "btn secondary" }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } catch {
      // Session may already be expired; still clear client state.
    }
    localStorage.removeItem("savora.user");
    queryClient.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <button className={className} type="button" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
