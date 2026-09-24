import { ApiError } from "./errors";
import { db } from "./db";

export type RiderRow = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  status: string;
  verification_status: string;
  verified_at: Date | null;
  rating_average: string;
  rating_count: number;
  document_note: string | null;
};

export async function getRiderByUserId(userId: string): Promise<RiderRow | undefined> {
  const rows = await db()<RiderRow[]>`SELECT * FROM delivery_partners WHERE user_id = ${userId} LIMIT 1`;
  return rows[0];
}

/** Loads the caller's rider profile, optionally requiring verification approval. */
export async function getRiderContext(userId: string, approvedOnly = true): Promise<RiderRow> {
  const rider = await getRiderByUserId(userId);
  if (!rider) {
    throw ApiError.notFound("No rider profile found for this account.");
  }
  if (approvedOnly && rider.verification_status !== "APPROVED") {
    throw ApiError.forbidden(
      rider.verification_status === "PENDING"
        ? "Your rider application is still under review. You can take jobs once it is approved."
        : "Your rider application was not approved. Contact support.",
    );
  }
  return rider;
}
