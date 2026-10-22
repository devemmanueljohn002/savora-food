export type VendorReview = {
  id: string;
  vendorRating: number;
  vendorComment: string | null;
  createdAt: string;
  /** First name only — the public API never exposes full customer identity. */
  customerFirstName: string;
};

export type VendorRatingSummary = {
  /** Average vendor rating (0 when there are no reviews yet). */
  average: number;
  count: number;
};

export type OrderReview = {
  id: string;
  orderId: string;
  customerId: string;
  vendorId: string;
  riderId: string | null;
  vendorRating: number;
  vendorComment: string | null;
  riderRating: number | null;
  riderComment: string | null;
  isHidden: boolean;
  createdAt: string;
};

export type AdminReview = OrderReview & {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  vendorName: string;
  riderName: string | null;
};

export const MIN_VENDOR_RATING_REVIEWS = 5;
