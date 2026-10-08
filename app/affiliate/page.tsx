import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, verifySessionToken } from "@/server/auth/session";
import { getAffiliateByUserId } from "@/server/affiliates";
import AffiliateDashboard from "./AffiliateDashboard";

/**
 * Server guard: only ACTIVE affiliates may see the dashboard. Everyone else —
 * signed out, never joined, suspended or banned — goes to the "Become an
 * affiliate" page (APIs enforce ACTIVE independently, so this is the
 * consistent front door, not the data boundary).
 */
export default async function AffiliatePage() {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) redirect("/affiliate/register");

  let userId: string | null = null;
  try {
    userId = (await verifySessionToken(token)).id;
  } catch {
    redirect("/affiliate/register");
  }
  const affiliate = userId ? await getAffiliateByUserId(userId).catch(() => undefined) : undefined;
  if (!affiliate || affiliate.status !== "ACTIVE") redirect("/affiliate/register");

  return <AffiliateDashboard />;
}
