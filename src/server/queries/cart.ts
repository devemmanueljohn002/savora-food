import { db } from "../db";
import { ApiError } from "../errors";
import type { CartView, CartItemView } from "../../lib/order-types";

type CartProductRow = {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  custom_instructions: string | null;
  product_name: string;
  product_slug: string;
  image_url: string | null;
  unit_price: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
};

type ProductAvailability = {
  id: string;
  is_active: boolean;
  availability: boolean;
  vendor_status: string;
};

function toCartItem(row: CartProductRow): CartItemView {
  const unitPrice = Number(row.unit_price);
  return {
    id: row.id,
    quantity: row.quantity,
    customInstructions: row.custom_instructions,
    unitPrice,
    lineTotal: Number((unitPrice * row.quantity).toFixed(2)),
    product: {
      id: row.product_id,
      name: row.product_name,
      slug: row.product_slug,
      image: row.image_url,
    },
    vendor: {
      id: row.vendor_id,
      businessName: row.vendor_name,
      slug: row.vendor_slug,
    },
  };
}

async function ensureCart(userId: string): Promise<string> {
  const sql = db();
  const existing = await sql<{ id: string }[]>`SELECT id FROM carts WHERE user_id = ${userId} LIMIT 1`;
  if (existing.length > 0) return existing[0].id;

  const created = await sql<{ id: string }[]>`
    INSERT INTO carts (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `;
  return created[0].id;
}

export async function getCartView(userId: string): Promise<CartView> {
  const sql = db();
  const cartId = await ensureCart(userId);

  const rows = await sql<CartProductRow[]>`
    SELECT
      ci.id,
      ci.cart_id,
      ci.product_id,
      ci.quantity,
      ci.custom_instructions,
      p.name AS product_name,
      p.slug AS product_slug,
      p.image_url,
      p.price::text AS unit_price,
      v.id AS vendor_id,
      v.business_name AS vendor_name,
      v.slug AS vendor_slug
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN vendors v ON v.id = p.vendor_id
    WHERE ci.cart_id = ${cartId}
    ORDER BY ci.created_at ASC
  `;

  const items = rows.map(toCartItem);
  return {
    items,
    subtotal: Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    vendorCount: new Set(items.map((item) => item.vendor.id)).size,
  };
}

export async function assertPurchasable(productId: string): Promise<void> {
  const sql = db();
  const rows = await sql<ProductAvailability[]>`
    SELECT p.id, p.is_active, p.availability, v.status AS vendor_status
    FROM products p
    JOIN vendors v ON v.id = p.vendor_id
    WHERE p.id = ${productId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw ApiError.notFound("That product is no longer available.");
  }
  const product = rows[0];
  if (!product.is_active || !product.availability) {
    throw ApiError.notFound("That product is out of stock.");
  }
  if (product.vendor_status !== "APPROVED") {
    throw ApiError.notFound("That vendor is not currently accepting orders.");
  }
}

export async function addCartItem(
  userId: string,
  productId: string,
  quantity: number,
  customInstructions?: string,
): Promise<CartView> {
  await assertPurchasable(productId);
  const sql = db();
  const cartId = await ensureCart(userId);

  await sql`
    INSERT INTO cart_items (cart_id, product_id, quantity, custom_instructions)
    VALUES (${cartId}, ${productId}, ${quantity}, ${customInstructions ?? null})
    ON CONFLICT (cart_id, product_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      custom_instructions = EXCLUDED.custom_instructions,
      updated_at = NOW()
  `;

  return getCartView(userId);
}

async function updateCartItem(userId: string, itemId: string, quantity: number): Promise<CartView> {
  const sql = db();
  const cartId = await ensureCart(userId);
  const updated = await sql`
    UPDATE cart_items
    SET quantity = ${quantity}, updated_at = NOW()
    WHERE id = ${itemId} AND cart_id = ${cartId}
    RETURNING id
  `;
  if (updated.length === 0) {
    throw ApiError.notFound("That cart item no longer exists.");
  }
  return getCartView(userId);
}

export async function setCartItemQuantity(userId: string, itemId: string, quantity: number): Promise<CartView> {
  return updateCartItem(userId, itemId, quantity);
}

export async function removeCartItem(userId: string, itemId: string): Promise<CartView> {
  const sql = db();
  const cartId = await ensureCart(userId);
  const removed = await sql`
    DELETE FROM cart_items
    WHERE id = ${itemId} AND cart_id = ${cartId}
    RETURNING id
  `;
  if (removed.length === 0) {
    throw ApiError.notFound("That cart item no longer exists.");
  }
  return getCartView(userId);
}

export async function clearCart(userId: string): Promise<void> {
  const sql = db();
  const cartId = await ensureCart(userId);
  await sql`DELETE FROM cart_items WHERE cart_id = ${cartId}`;
}

export async function removeCartItemsForProducts(userId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const sql = db();
  const cartId = await ensureCart(userId);
  await sql`DELETE FROM cart_items WHERE cart_id = ${cartId} AND product_id = ANY(${productIds})`;
}