-- Payment confirmation hardening: store the winning Paystack reference on the
-- order so verify + webhook races resolve to one row. UNIQUE keeps a reference
-- from ever confirming two orders; NULLs (unpaid orders) stay distinct.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paystack_reference
  ON orders (paystack_reference);

-- Backfill already-paid orders from their latest successful payment row so
-- reconciliation and idempotency checks see the same reference.
UPDATE orders o
SET paystack_reference = p.payment_reference
FROM (
  SELECT DISTINCT ON (order_id) order_id, payment_reference
  FROM payments
  WHERE status = 'SUCCESS'
  ORDER BY order_id, paid_at DESC NULLS LAST, created_at DESC
) p
WHERE o.id = p.order_id
  AND o.paystack_reference IS NULL
  AND o.status <> 'PENDING_PAYMENT';
