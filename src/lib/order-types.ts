export type CartItemView = {
  id: string;
  quantity: number;
  customInstructions: string | null;
  unitPrice: number;
  lineTotal: number;
  product: { id: string; name: string; slug: string; image: string | null };
  vendor: { id: string; businessName: string; slug: string };
};

export type CartView = {
  items: CartItemView[];
  subtotal: number;
  itemCount: number;
  vendorCount: number;
};

export type Address = {
  id: string;
  label: string | null;
  recipientName: string | null;
  phone: string | null;
  fullAddress: string;
  city: string;
  state: string;
  country: string;
  landmark: string | null;
  isDefault: boolean;
};

export type AddressInput = {
  label?: string;
  recipientName?: string;
  phone?: string;
  fullAddress: string;
  city: string;
  state: string;
  country?: string;
  landmark?: string;
  isDefault?: boolean;
};

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "VENDOR_ACCEPTED",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "RIDER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  createdAt: string;
  vendor: { id: string; name: string; slug: string };
  itemCount: number;
};

export type OrderItem = {
  id: string;
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  customInstructions: string | null;
};

export type OrderDetail = OrderListItem & {
  address?: {
    fullAddress: string;
    city: string;
    state: string;
    recipientName: string | null;
    phone: string | null;
  } | null;
  deliveryInstructions: string | null;
  deliveryOtp: string | null;
  requireOtp: boolean;
  items: OrderItem[];
};

export type CheckoutOrderSummary = {
  id: string;
  orderNumber: string;
  vendorName: string;
  vendorSlug: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
};

export type CheckoutResult = {
  orders: CheckoutOrderSummary[];
  clearedItems: number;
};

export type PaymentInitializeResult = {
  orderId: string;
  orderNumber: string;
  reference: string;
  authorizationUrl: string;
  amount: number;
  currency: string;
};

export type PaymentVerifyResult = {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  paid: boolean;
};

export type OrderQuery = {
  page?: number;
  limit?: number;
};