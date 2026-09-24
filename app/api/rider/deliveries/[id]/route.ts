import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, toEnvelope } from "@/server/errors";
import { requireRole, ROLES } from "@/server/auth/guard";
import { getRiderByUserId } from "@/server/riders";
import { notifyWithEmail } from "@/server/notify";
import { db } from "@/server/db";

const actionSchema = z.object({
  action: z.enum(["going", "arrived", "pickup", "in_transit", "deliver", "fail"]),
  note: z.string().trim().max(500).optional().nullable(),
  code: z.string().trim().max(10).optional(),
  otp: z.string().trim().max(10).optional(),
});

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const { id } = await ctx.params;

    const rows = await db()<{
      id: string;
      status: string;
      tracking_note: string | null;
      assigned_at: Date | null;
      picked_up_at: Date | null;
      delivered_at: Date | null;
      going_to_vendor_at: Date | null;
      arrived_at_vendor_at: Date | null;
      order_id: string;
      order_number: string;
      order_status: string;
      subtotal: string;
      delivery_fee: string;
      discount: string;
      total: string;
      delivery_instructions: string | null;
      vendor_id: string;
      vendor_name: string;
      vendor_slug: string;
      vendor_phone: string | null;
      customer_id: string;
      customer_name: string | null;
      customer_phone: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      require_otp: boolean;
    }[]>`
      SELECT d.id, d.status, d.tracking_note, d.assigned_at, d.picked_up_at, d.delivered_at,
              d.going_to_vendor_at, d.arrived_at_vendor_at,
              o.id AS order_id, o.order_number, o.status AS order_status,
              o.subtotal, o.delivery_fee, o.discount, o.total, o.delivery_instructions,
              COALESCE(o.require_otp, FALSE) AS require_otp,
              v.id AS vendor_id, v.business_name AS vendor_name, v.slug AS vendor_slug, v.phone AS vendor_phone,
              u.id AS customer_id,
              TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS customer_name,
              COALESCE(u.phone, a.phone) AS customer_phone,
              a.full_address AS address, a.city, a.state
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      JOIN vendors v ON v.id = o.vendor_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE d.id = ${id} AND d.delivery_partner_id = ${rider.id}
      LIMIT 1
    `;
    const delivery = rows[0];
    if (!delivery) throw ApiError.notFound("Delivery not found.");

    const items = await db()<{
      name: string;
      quantity: number;
      custom_instructions: string | null;
    }[]>`
      SELECT name, quantity, custom_instructions FROM order_items
      WHERE order_id = ${delivery.order_id} ORDER BY created_at ASC
    `;

    return NextResponse.json(
      ok({
        id: delivery.id,
        status: delivery.status,
        trackingNote: delivery.tracking_note,
        assignedAt: delivery.assigned_at,
        goingToVendorAt: delivery.going_to_vendor_at,
        arrivedAtVendorAt: delivery.arrived_at_vendor_at,
        pickedUpAt: delivery.picked_up_at,
        deliveredAt: delivery.delivered_at,
        order: {
          id: delivery.order_id,
          orderNumber: delivery.order_number,
          status: delivery.order_status,
          subtotal: Number(delivery.subtotal),
          deliveryFee: Number(delivery.delivery_fee),
          discount: Number(delivery.discount),
          total: Number(delivery.total),
          deliveryInstructions: delivery.delivery_instructions,
          requireOtp: Boolean(delivery.require_otp),
        },
        vendor: {
          id: delivery.vendor_id,
          name: delivery.vendor_name,
          slug: delivery.vendor_slug,
          phone: delivery.vendor_phone,
        },
        customer: { id: delivery.customer_id, name: delivery.customer_name || null, phone: delivery.customer_phone },
        address:
          delivery.address == null
            ? null
            : { fullAddress: delivery.address, city: delivery.city, state: delivery.state },
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          customInstructions: item.custom_instructions,
        })),
      }),
    );
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, [ROLES.DELIVERY_PARTNER, ROLES.ADMIN]);
    const rider = await getRiderByUserId(session.id);
    if (!rider) throw ApiError.notFound("No rider profile found for this account.");
    const { id } = await ctx.params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw ApiError.validation("Please fix the errors in your submission.", parsed.error.flatten().fieldErrors);
    }

    const sql = db();
    const rows = await sql<{
      id: string;
      status: string;
      delivery_code_attempts: number;
      order_id: string;
      order_number: string;
      order_status: string;
      customer_id: string;
      vendor_id: string;
      delivery_otp: string | null;
      require_otp: boolean;
    }[]>`
      SELECT d.id, d.status, d.delivery_code_attempts,
             o.id AS order_id, o.order_number, o.status AS order_status,
             o.user_id AS customer_id, o.vendor_id,
             o.delivery_otp, COALESCE(o.require_otp, FALSE) AS require_otp
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
      WHERE d.id = ${id} AND d.delivery_partner_id = ${rider.id}
      LIMIT 1
    `;
    const delivery = rows[0];
    if (!delivery) throw ApiError.notFound("Delivery not found.");

    const vendorOwners = await sql<{ user_id: string }[]>`
      SELECT user_id FROM vendors WHERE id = ${delivery.vendor_id} LIMIT 1
    `;
    const vendorUserId = vendorOwners[0]?.user_id;

    // ASSIGNED -> GOING_TO_VENDOR
    if (parsed.data.action === "going") {
      if (delivery.status !== "ASSIGNED") throw ApiError.conflict("This delivery cannot start yet.");
      await sql`UPDATE deliveries SET status = 'GOING_TO_VENDOR', going_to_vendor_at = NOW(), tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
      await notifyWithEmail(delivery.customer_id, {
        title: `Order ${delivery.order_number}: rider on the way to vendor`,
        body: `${rider.name} is going to the vendor to pick up your order.`,
        data: { orderId: delivery.order_id, status: "GOING_TO_VENDOR" },
      });
      return NextResponse.json(ok({ status: "GOING_TO_VENDOR" }));
    }

    // GOING_TO_VENDOR -> ARRIVED_AT_VENDOR
    if (parsed.data.action === "arrived") {
      if (delivery.status !== "GOING_TO_VENDOR" && delivery.status !== "ASSIGNED") {
        throw ApiError.conflict("Start the trip before marking arrival.");
      }
      await sql`UPDATE deliveries SET status = 'ARRIVED_AT_VENDOR', arrived_at_vendor_at = NOW(), tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
      await notifyWithEmail(delivery.customer_id, {
        title: `Order ${delivery.order_number}: rider arrived at vendor`,
        body: `${rider.name} arrived at the vendor. Your food will be picked up shortly.`,
        data: { orderId: delivery.order_id, status: "ARRIVED_AT_VENDOR" },
      });
      if (vendorUserId) {
        await notifyWithEmail(vendorUserId, {
          title: `Rider arrived: ${delivery.order_number}`,
          body: `${rider.name} arrived. Verify the order number before handing over the food.`,
          data: { orderId: delivery.order_id, status: "ARRIVED_AT_VENDOR" },
        });
      }
      return NextResponse.json(ok({ status: "ARRIVED_AT_VENDOR" }));
    }

    if (parsed.data.action === "pickup") {
      if (!["ASSIGNED", "GOING_TO_VENDOR", "ARRIVED_AT_VENDOR"].includes(delivery.status)) {
        throw ApiError.conflict("This delivery cannot be picked up.");
      }
      await sql.begin(async (tx) => {
        await tx`UPDATE deliveries SET status = 'PICKED_UP', picked_up_at = NOW(), tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
        await tx`UPDATE orders SET status = 'OUT_FOR_DELIVERY', updated_at = NOW() WHERE id = ${delivery.order_id}`;
        await tx`
          INSERT INTO order_status_history (order_id, status, note)
          VALUES (${delivery.order_id}, 'OUT_FOR_DELIVERY', ${parsed.data.note ?? "Rider picked up the order"})
        `;
      });
      await notifyWithEmail(delivery.customer_id, {
        title: `Order ${delivery.order_number} is on its way`,
        body: `Your order has been picked up and is on the way.`,
        data: { orderId: delivery.order_id, status: "OUT_FOR_DELIVERY" },
      });
      if (vendorUserId) {
        await notifyWithEmail(vendorUserId, {
          title: `Pickup confirmed: ${delivery.order_number}`,
          body: `${rider.name} confirmed pickup and is out for delivery.`,
          data: { orderId: delivery.order_id, status: "OUT_FOR_DELIVERY" },
        });
      }
      return NextResponse.json(ok({ status: "PICKED_UP" }));
    }

    if (parsed.data.action === "in_transit") {
      if (delivery.status !== "PICKED_UP") throw ApiError.conflict("Pick up the order first.");
      await sql`UPDATE deliveries SET status = 'IN_TRANSIT', tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
      return NextResponse.json(ok({ status: "IN_TRANSIT" }));
    }

    if (parsed.data.action === "deliver") {
      if (delivery.status !== "IN_TRANSIT" && delivery.status !== "PICKED_UP") {
        throw ApiError.conflict("Pick up the order before marking it delivered.");
      }
      // OTP handshake: the order carries the customer-visible code (orders.delivery_otp).
      if (delivery.require_otp) {
        const supplied = (parsed.data.otp ?? parsed.data.code ?? "").trim();
        if (!supplied) throw ApiError.validation("Enter the 4-digit delivery code from the customer.");
        if (delivery.delivery_code_attempts >= 3) {
          throw ApiError.forbidden("Too many wrong codes. Ask the vendor or support to re-issue the code.");
        }
        const { verifyDeliveryOtp } = await import("@/server/orders");
        if (!verifyDeliveryOtp(delivery.delivery_otp, supplied)) {
          await sql`UPDATE deliveries SET delivery_code_attempts = delivery_code_attempts + 1 WHERE id = ${id}`;
          throw ApiError.validation("Incorrect delivery code. It was not completed.");
        }
      }
      await sql.begin(async (tx) => {
        await tx`UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW(), delivery_code_verified_at = NOW(), tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
        await tx`UPDATE orders SET status = 'DELIVERED', updated_at = NOW() WHERE id = ${delivery.order_id}`;
        await tx`
          INSERT INTO order_status_history (order_id, status, note)
          VALUES (${delivery.order_id}, 'DELIVERED', ${parsed.data.note ?? "Delivery verified with code"})
        `;
      });
      // Ledger: split + transactions + vendor settlement (best-effort; delivery stays DELIVERED).
      try {
        const { upsertMoneySplit, recordTransactions } = await import("@/server/money");
        const split = await upsertMoneySplit(delivery.order_id);
        const payRows = await sql<{ id: string }[]>`SELECT id FROM payments WHERE order_id = ${delivery.order_id} ORDER BY created_at DESC LIMIT 1`;
        if (split) {
          await recordTransactions({
            orderId: delivery.order_id,
            paymentId: payRows[0]?.id ?? null,
            entries: [
              { kind: "VENDOR_PAYOUT", amount: split.vendorAmount, beneficiaryType: "VENDOR", beneficiaryId: delivery.vendor_id },
              { kind: "RIDER_EARNING", amount: split.riderAmount, beneficiaryType: "RIDER", beneficiaryId: rider.id },
              { kind: "PLATFORM_FEE", amount: split.platformAmount, beneficiaryType: "PLATFORM" },
            ],
          });
          const orderRows = await sql<{
            subtotal: string; delivery_fee: string; service_fee: string | null; tax_amount: string | null;
            discount: string; total: string; commission_rate: string | null;
          }[]>`
            SELECT o.subtotal::text AS subtotal, o.delivery_fee::text AS delivery_fee,
                   o.service_fee::text AS service_fee, o.tax_amount::text AS tax_amount,
                   o.discount::text AS discount, o.total::text AS total,
                   v.commission_rate::text AS commission_rate
            FROM orders o JOIN vendors v ON v.id = o.vendor_id
            WHERE o.id = ${delivery.order_id} LIMIT 1
          `;
          const o = orderRows[0];
          if (o) {
            await sql`
              INSERT INTO order_settlements (order_id, vendor_id, subtotal, delivery_fee, service_fee, tax_amount, discount, gross, commission_rate, commission_amount, rider_fee, vendor_net, status)
              VALUES (${delivery.order_id}, ${delivery.vendor_id}, ${o.subtotal}, ${o.delivery_fee}, ${o.service_fee ?? 0}, ${o.tax_amount ?? 0}, ${o.discount}, ${o.total}, ${o.commission_rate ?? 10}, ${split.commission}, ${split.riderAmount}, ${split.vendorAmount}, 'PAYABLE')
              ON CONFLICT (order_id) DO NOTHING
            `;
          }
        }
      } catch {
        // ledger failure is auditable via missing order_money_splits row; delivery stays DELIVERED
      }
      await notifyWithEmail(delivery.customer_id, {
        title: `Order ${delivery.order_number} delivered`,
        body: "Delivery verified. Enjoy your meal! Please rate your experience.",
        data: { orderId: delivery.order_id, status: "DELIVERED" },
      });
      if (vendorUserId) {
        await notifyWithEmail(vendorUserId, {
          title: `Order ${delivery.order_number} delivered`,
          body: `${rider.name} completed the delivery (code verified).`,
          data: { orderId: delivery.order_id, status: "DELIVERED" },
        });
      }
      return NextResponse.json(ok({ status: "DELIVERED" }));
    }

    // fail
    if (["DELIVERED", "FAILED", "CANCELLED"].includes(delivery.status)) {
      throw ApiError.conflict("This delivery is already closed.");
    }
    await sql.begin(async (tx) => {
      await tx`UPDATE deliveries SET status = 'FAILED', tracking_note = COALESCE(${parsed.data.note ?? null}, tracking_note) WHERE id = ${id}`;
      await tx`
        UPDATE orders SET status = 'READY_FOR_PICKUP', delivery_partner_id = NULL, updated_at = NOW()
        WHERE id = ${delivery.order_id}
      `;
      await tx`
        INSERT INTO order_status_history (order_id, status, note)
        VALUES (${delivery.order_id}, 'READY_FOR_PICKUP', ${parsed.data.note ?? "Delivery failed; order released for reassignment"})
      `;
    });
    try {
      const { createDispatchOffers } = await import("@/server/dispatch");
      await createDispatchOffers(delivery.order_id);
    } catch {
      // ignore
    }
    if (vendorUserId) {
      await notifyWithEmail(vendorUserId, {
        title: `Delivery failed for ${delivery.order_number}`,
        body: "The order was released and is available for another rider.",
        data: { orderId: delivery.order_id, status: "FAILED" },
      });
    }
    return NextResponse.json(ok({ status: "FAILED" }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}
