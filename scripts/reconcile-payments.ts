import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

/**
 * Reconcile orders stuck in PENDING_PAYMENT whose Paystack references actually
 * succeeded (e.g. verify/webhook failed before the PENDING_PAYMENT -> PAID fix).
 *
 * Usage:
 *   tsx scripts/reconcile-payments.ts [--dry-run] [--limit 50] [--reference SV-XXX]
 *
 * For each candidate it calls Paystack's verify API server-side and requires
 * status=success + reference match + amount (kobo) == order total + currency
 * NGN before flipping via the same atomic markOrderPaymentPaid path the
 * webhook uses (so vendor notifications still fire exactly once).
 */

function arg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY is not set.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(arg("--limit") ?? 50);
  const onlyReference = arg("--reference");

  const sql = postgres(databaseUrl, { max: 2, ssl: "require", onnotice: () => {} });
  try {
    const rows = await sql<{ order_id: string; order_number: string; total: string; currency: string; reference: string; payment_status: string }[]>`
      SELECT o.id AS order_id, o.order_number, o.total::text, o.currency,
             p.payment_reference AS reference, p.status AS payment_status
      FROM orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.status = 'PENDING_PAYMENT'
        AND p.status <> 'FAILED'
        ${onlyReference ? sql`AND p.payment_reference = ${onlyReference}` : sql``}
      ORDER BY o.created_at ASC
      LIMIT ${Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50}
    `;
    console.log(`Found ${rows.length} stuck candidate(s)${dryRun ? " (dry run)" : ""}.`);

    let confirmed = 0;
    for (const row of rows) {
      const expectedKobo = Math.round(Number(row.total) * 100);
      let verified: { status?: unknown; amount?: unknown; currency?: unknown; reference?: unknown } | null = null;
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(row.reference)}`, {
          headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
        });
        const body = (await res.json().catch(() => null)) as { status?: boolean; data?: Record<string, unknown> } | null;
        verified = (body?.data ?? null) as { status?: unknown; amount?: unknown; currency?: unknown; reference?: unknown } | null;
        if (!res.ok || body?.status === false) {
          console.log(`- ${row.order_number} ${row.reference}: Paystack lookup failed, skipping.`);
          continue;
        }
      } catch (error) {
        console.log(`- ${row.order_number} ${row.reference}: verify call error, skipping.`, error);
        continue;
      }
      const vStatus = typeof verified?.status === "string" ? (verified as { status: string }).status : "";
      const vRef = typeof verified?.reference === "string" ? (verified as { reference: string }).reference : null;
      const vCur = typeof verified?.currency === "string" ? (verified as { currency: string }).currency : null;
      const vAmt = typeof verified?.amount === "number" ? (verified as { amount: number }).amount : null;
      const ok =
        vStatus === "success" &&
        (!vRef || vRef === row.reference) &&
        (!vCur || vCur.toUpperCase() === (row.currency ?? "NGN").toUpperCase()) &&
        (vAmt == null || vAmt === expectedKobo);
      if (!ok) {
        console.log(
          `- ${row.order_number} ${row.reference}: not successful (status=${vStatus}, amount=${vAmt}, want=${expectedKobo}), skipping.`,
        );
        continue;
      }
      if (dryRun) {
        console.log(`- ${row.order_number} ${row.reference}: WOULD confirm (dry run).`);
        continue;
      }
      // Flip via the app path so ledger + notifications stay consistent.
      // Dynamic import keeps the script runnable without pulling Next.js.
      const { markOrderPaymentPaid } = await import("../src/server/orders");
      const owner = await sql<{ user_id: string }[]>`SELECT user_id FROM orders WHERE id = ${row.order_id} LIMIT 1`;
      if (!owner[0]) {
        console.log(`- ${row.order_number}: order vanished, skipping.`);
        continue;
      }
      try {
        await markOrderPaymentPaid(row.order_id, owner[0].user_id, row.reference);
        confirmed += 1;
        console.log(`- ${row.order_number} ${row.reference}: confirmed PAID.`);
      } catch (error) {
        console.error(`- ${row.order_number} ${row.reference}: Paystack success but order update failed — needs manual review.`, error);
      }
    }
    console.log(`Done. Confirmed ${confirmed}/${rows.length}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Reconcile failed:", error);
  process.exit(1);
});
