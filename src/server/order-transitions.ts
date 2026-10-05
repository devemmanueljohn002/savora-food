import { ApiError } from "./errors";

/**
 * Single enforced order state machine. Every code path that writes
 * orders.status must pass through assertOrderTransition (or use a WHERE
 * predicate that implies it). Terminal states accept nothing.
 */
export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["VENDOR_ACCEPTED", "CANCELLED"],
  VENDOR_ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "RIDER_ASSIGNED", "CANCELLED"],
  READY_FOR_PICKUP: ["RIDER_ASSIGNED", "CANCELLED"],
  RIDER_ASSIGNED: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "READY_FOR_PICKUP", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Pure check — unit-tested. Unknown statuses transition nowhere. */
export function canTransitionOrder(from: string, to: string): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw a 409 when a writer attempts an illegal jump (stale client, race loser, bug). */
export function assertOrderTransition(from: string, to: string): void {
  if (!canTransitionOrder(from, to)) {
    throw ApiError.conflict(
      `This order cannot move from ${from.replaceAll("_", " ")} to ${to.replaceAll("_", " ")}. Please refresh.`,
    );
  }
}
