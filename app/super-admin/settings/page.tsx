"use client";

import { FormEvent, useState } from "react";
import { SuperAdminShell, SuperAdminSignIn } from "@/components/SuperAdminShell";
import { usePlatformSettings, useUpdatePlatformSetting } from "@/lib/api/hooks";

const KEY_HELP: Record<string, string> = {
  payment_config: "Payment provider and toggles used at checkout.",
  subscription_config: "Vendor subscription tiers offered on the platform.",
  country_config: "Operating country and currency.",
  delivery_config: "Base fee and per-km fee used for delivery estimates.",
  commission_config: "Default commission rate applied to new kitchens.",
  pricing_config: "Checkout fees: service_fee_type PERCENT|FLAT, service_fee_value, tax_rate_percent. Applied per vendor order.",
};

function SettingCard({ settingKey, value }: { settingKey: string; value: Record<string, unknown> }) {
  const update = useUpdatePlatformSetting();
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("Invalid JSON. Fix the syntax and try again.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("Settings must be a JSON object.");
      return;
    }
    try {
      const next = await update.mutateAsync({ key: settingKey, value: parsed as Record<string, unknown> });
      setText(JSON.stringify(next.value, null, 2));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    }
  }

  return (
    <form className="form-card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>
        <code>{settingKey}</code>
      </h3>
      <p className="muted">{KEY_HELP[settingKey] ?? "Platform configuration."}</p>
      <label>
        Value (JSON)
        <textarea value={text} rows={8} spellCheck={false} onChange={(event) => setText(event.target.value)} />
      </label>
      {saved && (
        <p className="auth-success" role="status">
          Saved.
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-sm" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export default function SuperAdminSettingsPage() {
  const settings = usePlatformSettings();

  if (settings.isError) return <SuperAdminSignIn />;

  return (
    <SuperAdminShell title="Platform settings" sub="Validated JSON config consumed across checkout, payouts and delivery.">
      {settings.isLoading ? (
        <p className="muted">Loading settings…</p>
      ) : (
        (settings.data ?? []).map((setting) => (
          <SettingCard key={setting.key} settingKey={setting.key} value={setting.value} />
        ))
      )}
    </SuperAdminShell>
  );
}
