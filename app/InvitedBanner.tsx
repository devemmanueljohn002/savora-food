import Link from "next/link";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifySessionToken } from "@/server/auth/session";
import { AFFILIATE_COOKIE, getAffiliateByCode } from "@/server/affiliates";

/**
 * "Invited by {first name}" banner for visitors arriving via /ref/[code].
 * Server-rendered from the referral cookie. Only the referrer's first name
 * is ever exposed — and never to logged-in users.
 */
export default async function InvitedBanner() {
  const store = await cookies();

  // Signed-in users never see referrer data.
  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    try {
      await verifySessionToken(access);
      return null;
    } catch {
      // Invalid session — treat as logged out.
    }
  }

  const code = (store.get(AFFILIATE_COOKIE)?.value ?? "").trim().toUpperCase();
  if (!code) return null;
  const affiliate = await getAffiliateByCode(code).catch(() => undefined);
  if (!affiliate || affiliate.status !== "ACTIVE") return null;
  const firstName = affiliate.full_name.trim().split(/\s+/)[0] || "A friend";

  return (
    <div className="container">
      <p className="info-box" role="status" style={{ margin: "16px 0 0" }}>
        <span>
          Invited by <strong>{firstName}</strong> —{" "}
          <Link href="/register" style={{ color: "var(--orange)", fontWeight: 700 }}>
            create an account
          </Link>{" "}
          and their referral applies automatically.
        </span>
      </p>
    </div>
  );
}
