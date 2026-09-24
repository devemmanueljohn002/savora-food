-- Vendor accept/reject flow: an accepted order moves PAID -> VENDOR_ACCEPTED
-- before PREPARING. CONFIRMED is kept so existing rows and history stay valid.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'PENDING_PAYMENT', 'PAID', 'VENDOR_ACCEPTED', 'CONFIRMED', 'PREPARING',
    'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED'
  ));
