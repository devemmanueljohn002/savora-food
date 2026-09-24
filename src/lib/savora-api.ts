import type {
  CatalogCategory,
  CatalogLocation,
  CatalogProduct,
  CatalogVendor,
  CateringPackage,
  Paginated,
  ProductDetail,
  ProductReview,
  ProductSort,
  ProductType,
  VendorSort,
} from "./catalog-types";
import type {
  Address,
  AddressInput,
  CartView,
  CheckoutResult,
  OrderItem,
  OrderListItem,
  OrderQuery,
  PaymentInitializeResult,
  PaymentVerifyResult,
} from "./order-types";

export type {
  CatalogCategory,
  CatalogLocation,
  CatalogProduct,
  CatalogVendor,
  CateringPackage,
  Paginated,
  ProductDetail,
  ProductReview,
  ProductSort,
  ProductType,
  VendorSort,
};
export type {
  Address,
  AddressInput,
  CartItemView,
  CartView,
  CheckoutOrderSummary,
  CheckoutResult,
  OrderItem,
  OrderListItem,
  OrderQuery,
  PaymentInitializeResult,
  PaymentVerifyResult,
} from "./order-types";

const API_BASE = "/api";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors?: unknown;

  constructor(message: string, status: number, code?: string, errors?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

async function parse<T>(response: Response): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload || payload.success === false) {
    const message = payload && "message" in payload && payload.message ? payload.message : `Request failed (${response.status})`;
    const code = payload && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    const errors = payload && "errors" in payload ? payload.errors : undefined;
    throw new ApiRequestError(message, response.status, code, errors);
  }

  return { data: payload.data, meta: payload.meta };
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  return parse<T>(response);
}

async function apiSend<T>(path: string, method: string, body?: unknown): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(response);
}

function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

export type CatalogQuery = {
  type?: ProductType;
  category?: string;
  vendorId?: string;
  city?: string;
  search?: string;
  sort?: ProductSort;
  featured?: boolean;
  page?: number;
  limit?: number;
};

export function getProducts(params: CatalogQuery = {}, signal?: AbortSignal) {
  return apiGet<CatalogProduct[]>(
    `/products${queryString({
      type: params.type,
      category: params.category,
      vendor: params.vendorId,
      city: params.city,
      search: params.search,
      sort: params.sort,
      featured: params.featured,
      page: params.page,
      limit: params.limit,
    })}`,
    signal,
  );
}

export function getProduct(slug: string, signal?: AbortSignal) {
  return apiGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`, signal);
}

export function getProductReviews(slug: string, signal?: AbortSignal) {
  return apiGet<ProductReview[]>(`/products/${encodeURIComponent(slug)}/reviews`, signal);
}

export function getCategories(signal?: AbortSignal) {
  return apiGet<CatalogCategory[]>("/categories", signal);
}

export function getLocations(signal?: AbortSignal) {
  return apiGet<CatalogLocation[]>("/locations", signal);
}

export type VendorQuery = {
  city?: string;
  category?: string;
  search?: string;
  sort?: VendorSort;
  featured?: boolean;
  page?: number;
  limit?: number;
};

export function getVendors(params: VendorQuery = {}, signal?: AbortSignal) {
  return apiGet<CatalogVendor[]>(
    `/vendors${queryString({
      city: params.city,
      category: params.category,
      search: params.search,
      sort: params.sort,
      featured: params.featured,
      page: params.page,
      limit: params.limit,
    })}`,
    signal,
  );
}

export function getVendor(slug: string, signal?: AbortSignal) {
  return apiGet<CatalogVendor>(`/vendors/${encodeURIComponent(slug)}`, signal);
}

export function getVendorProducts(slug: string, params: { page?: number; limit?: number } = {}, signal?: AbortSignal) {
  return apiGet<CatalogProduct[]>(
    `/vendors/${encodeURIComponent(slug)}/products${queryString({ page: params.page, limit: params.limit })}`,
    signal,
  );
}

export function getCateringPackages(params: { limit?: number } = {}, signal?: AbortSignal) {
  return apiGet<CateringPackage[]>(`/catering/packages${queryString({ limit: params.limit })}`, signal);
}

// ── Auth (cookie sessions) ──────────────────────────────────────────────

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: string;
};

export function login(input: { email?: string; identifier?: string; password: string }) {
  return apiSend<AuthUser>("/auth/login", "POST", {
    identifier: input.identifier ?? input.email ?? "",
    password: input.password,
  }).then((result) => result.data);
}

export function register(input: { firstName: string; lastName: string; email: string; phone?: string; password: string; role?: string }) {
  return apiSend<AuthUser>("/auth/register", "POST", input).then((result) => result.data);
}

export function logout() {
  return apiSend<null>("/auth/logout", "POST").then((result) => result.data);
}

export function currentUser() {
  return apiGet<AuthUser>("/auth/me").then((result) => result.data);
}

// ── Account (any signed-in role) ──────────────────────────────────────────

export type AccountProfile = AuthUser & {
  emailVerifiedAt: string | null;
};

export type AccountOverview = {
  user: AccountProfile;
  vendor: { id: string; businessName: string; slug: string; status: string } | null;
  rider: { id: string; status: string; verificationStatus: string } | null;
};

export function getAccount() {
  return apiGet<AccountOverview>("/account").then((result) => result.data);
}

export type ConsumerOverview = {
  totalOrders: number;
  activeOrders: number;
  cateringBookings: number;
  upcomingCatering: number;
  totalSpend: number;
};

export function getConsumerOverview() {
  return apiGet<ConsumerOverview>("/account/overview").then((result) => result.data);
}

export function updateAccount(input: { firstName?: string; lastName?: string; phone?: string | null }) {
  return apiSend<AccountProfile>("/account", "PATCH", input).then((result) => result.data);
}

export function changeAccountPassword(input: { currentPassword: string; newPassword: string }) {
  return apiSend<null>("/account/password", "POST", input).then((result) => result.data);
}

// ── Vendor onboarding ─────────────────────────────────────────────────────

export type VendorOnboarding = {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
  bannerImageUrl: string | null;
  status: string;
};

export type VendorOnboardingInput = {
  businessName: string;
  ownerName?: string;
  phone?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export function getVendorOnboarding() {
  return apiGet<VendorOnboarding>("/vendor/onboarding").then((result) => result.data);
}

export function updateVendorOnboarding(input: VendorOnboardingInput) {
  return apiSend<VendorOnboarding>("/vendor/onboarding", "PATCH", input).then((result) => result.data);
}

export function dashboardForRole(role?: string): string {
  if (role === "VENDOR") return "/vendor/dashboard";
  if (role === "DELIVERY_PARTNER") return "/rider/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "SUPER_ADMIN") return "/super-admin/dashboard";
  return "/dashboard";
}

// ── Vendor ──────────────────────────────────────────────────────────────────

export type VendorProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  imageUrl: string | null;
  ingredients: string[];
  prepInfo: string | null;
  availability: boolean;
  stockQuantity: number;
  ratingAverage: number;
  ratingCount: number;
  isFeatured: boolean;
  isActive: boolean;
  productType: string | null;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  variantCount: number;
  orders30d: number;
  revenue30d: number;
};

export type ProductVariant = {
  id: string;
  name: string;
  price: number | null;
  stockQuantity: number;
  isActive: boolean;
};

export type VendorProductDetail = Omit<VendorProduct, "variantCount" | "orders30d" | "revenue30d"> & {
  preparationMinutes: number | null;
  variants: ProductVariant[];
};

export type VendorProductInput = {
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  imageUrl?: string | null;
  ingredients?: string[] | null;
  prepInfo?: string | null;
  preparationMinutes?: number | null;
  availability?: boolean;
  stockQuantity?: number;
  isActive?: boolean;
  productType?: "FOOD" | "CAKE" | "SNACK" | "DRINK" | "CATERING" | null;
  categoryId?: string | null;
};

export function listVendorProducts(params: { search?: string; active?: boolean; lowStock?: boolean } = {}) {
  return apiGet<VendorProduct[]>(
    `/vendor/products${queryString({ search: params.search, active: params.active, lowStock: params.lowStock })}`,
  ).then((result) => result.data);
}

export function createVendorProduct(input: VendorProductInput) {
  return apiSend<VendorProduct>("/vendor/products", "POST", input).then((result) => result.data);
}

export function getVendorProduct(id: string) {
  return apiGet<VendorProductDetail>(`/vendor/products/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function updateVendorProduct(id: string, input: Partial<VendorProductInput>) {
  return apiSend<{ updated: boolean; id: string }>(`/vendor/products/${encodeURIComponent(id)}`, "PATCH", input).then(
    (result) => result.data,
  );
}

export function deleteVendorProduct(id: string) {
  return apiSend<{ removed?: boolean; deactivated?: boolean; id: string }>(
    `/vendor/products/${encodeURIComponent(id)}`,
    "DELETE",
  ).then((result) => result.data);
}

export function listProductVariants(productId: string) {
  return apiGet<ProductVariant[]>(`/vendor/products/${encodeURIComponent(productId)}/variants`).then(
    (result) => result.data,
  );
}

export function createProductVariant(
  productId: string,
  input: { name: string; price?: number | null; stockQuantity?: number; isActive?: boolean },
) {
  return apiSend<ProductVariant>(`/vendor/products/${encodeURIComponent(productId)}/variants`, "POST", input).then(
    (result) => result.data,
  );
}

export function updateProductVariant(
  productId: string,
  variantId: string,
  input: { name?: string; price?: number | null; stockQuantity?: number; isActive?: boolean },
) {
  return apiSend<ProductVariant>(
    `/vendor/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    "PATCH",
    input,
  ).then((result) => result.data);
}

export function deleteProductVariant(productId: string, variantId: string) {
  return apiSend<{ removed: boolean }>(
    `/vendor/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    "DELETE",
  ).then((result) => result.data);
}

export type VendorOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  deliveryInstructions: string | null;
  preferredDeliveryTime: string | null;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
};

export type VendorOrderDetail = VendorOrder & {
  customer: { id: string; name: string | null; email: string; phone: string | null };
  address: { fullAddress: string; city: string | null; state: string | null } | null;
  items: {
    id: string;
    productId: string | null;
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    customInstructions: string | null;
  }[];
  history: { status: string; note: string | null; createdAt: string }[];
  nextStatus: string | null;
};

export function listVendorOrders(params: { status?: string; page?: number; limit?: number } = {}) {
  return apiGet<VendorOrder[]>(
    `/vendor/orders${queryString({ status: params.status, page: params.page, limit: params.limit })}`,
  ).then((result) => {
    const meta = result.meta ?? {};
    return {
      items: result.data,
      total: typeof meta.total === "number" ? meta.total : result.data.length,
      page: typeof meta.page === "number" ? meta.page : 1,
      pageSize: typeof meta.pageSize === "number" ? meta.pageSize : result.data.length,
      totalPages: typeof meta.totalPages === "number" ? meta.totalPages : 1,
    };
  });
}

export function getVendorOrder(id: string) {
  return apiGet<VendorOrderDetail>(`/vendor/orders/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function advanceVendorOrder(id: string, note?: string | null) {
  return apiSend<{ status: string }>(`/vendor/orders/${encodeURIComponent(id)}`, "PATCH", {
    action: "advance",
    ...(note ? { note } : {}),
  }).then((result) => result.data);
}

export function cancelVendorOrder(id: string, note?: string | null) {
  return apiSend<{ status: string }>(`/vendor/orders/${encodeURIComponent(id)}`, "PATCH", {
    action: "cancel",
    ...(note ? { note } : {}),
  }).then((result) => result.data);
}

export function acceptVendorOrder(id: string, note?: string | null) {
  return apiSend<{ status: string }>(`/vendor/orders/${encodeURIComponent(id)}`, "PATCH", {
    action: "accept",
    ...(note ? { note } : {}),
  }).then((result) => result.data);
}

export function rejectVendorOrder(id: string, note?: string | null) {
  return apiSend<{ status: string }>(`/vendor/orders/${encodeURIComponent(id)}`, "PATCH", {
    action: "reject",
    ...(note ? { note } : {}),
  }).then((result) => result.data);
}

export type VendorCateringRequest = {
  id: string;
  status: string;
  fullName: string;
  phone: string;
  email: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  guestCount: number;
  specialRequirements: string | null;
  createdAt: string;
  package: { id: string; title: string };
  quote: { id: string; amount: number; status: string | null } | null;
};

export type VendorCateringDetail = VendorCateringRequest & {
  package: { id: string; title: string; pricePerGuest: number };
  quote:
    | {
        id: string;
        amount: number;
        perGuest: number | null;
        message: string | null;
        status: string | null;
        respondedAt: string | null;
      }
    | null;
};

export function listVendorCatering(params: { status?: string } = {}) {
  return apiGet<VendorCateringRequest[]>(`/vendor/catering${queryString({ status: params.status })}`).then(
    (result) => result.data,
  );
}

export function getVendorCatering(id: string) {
  return apiGet<VendorCateringDetail>(`/vendor/catering/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function quoteVendorCatering(
  id: string,
  input: { amount: number; perGuest?: number | null; message?: string | null },
) {
  return apiSend<{ status: string }>(`/vendor/catering/${encodeURIComponent(id)}`, "PATCH", {
    action: "quote",
    ...input,
  }).then((result) => result.data);
}

export function declineVendorCatering(id: string) {
  return apiSend<{ status: string }>(`/vendor/catering/${encodeURIComponent(id)}`, "PATCH", {
    action: "decline",
  }).then((result) => result.data);
}

export type VendorEarnings = {
  commissionRate: number;
  last30Days: { gross: number; commission: number; net: number; orders: number };
  lifetime: { gross: number; commission: number; net: number; orders: number };
  availableBalance: number;
  paidOut: number;
  payouts: {
    id: string;
    reference: string;
    periodStart: string | null;
    periodEnd: string | null;
    gross: number;
    commission: number;
    net: number;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }[];
};

export function getVendorEarnings() {
  return apiGet<VendorEarnings>("/vendor/earnings").then((result) => result.data);
}

export type VendorAnalytics = {
  revenueByDay: { day: string; gross: number; orders: number }[];
  ordersByStatus: { status: string; count: number }[];
  topProducts: { id: string; name: string; revenue: number; quantity: number }[];
  lowStock: { id: string; name: string; stock_quantity: number }[];
  rating: { average: number; count: number };
};

export function getVendorAnalytics() {
  return apiGet<VendorAnalytics>("/vendor/analytics").then((result) => result.data);
}

export type VendorProfile = {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
  bannerImageUrl: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  status: string;
  commissionRate: number | null;
  ratingAverage: number;
  ratingCount: number;
  isFeatured: boolean;
};

export function getVendorProfile() {
  return apiGet<VendorProfile>("/vendor/profile").then((result) => result.data);
}

export function updateVendorProfileFull(input: {
  businessName?: string;
  ownerName?: string;
  phone?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  logoUrl?: string | null;
  bannerImageUrl?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
}) {
  return apiSend<VendorProfile>("/vendor/profile", "PATCH", input).then((result) => result.data);
}

export function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/uploads", { method: "POST", credentials: "include", body: form }).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: { url: string };
    } | null;
    if (!response.ok || !payload?.success || !payload.data?.url) {
      throw new ApiRequestError(payload?.message ?? `Upload failed (${response.status})`, response.status);
    }
    return payload.data.url;
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function paged<T>(result: { data: T[]; meta?: Record<string, unknown> }): Paged<T> {
  const meta = result.meta ?? {};
  return {
    items: result.data,
    total: typeof meta.total === "number" ? meta.total : result.data.length,
    page: typeof meta.page === "number" ? meta.page : 1,
    pageSize: typeof meta.pageSize === "number" ? meta.pageSize : result.data.length,
    totalPages: typeof meta.totalPages === "number" ? meta.totalPages : 1,
  };
}

export type AdminOverview = {
  usersByRole: { role: string; count: number }[];
  vendorsByStatus: { status: string; count: number }[];
  ridersByVerification: { status: string; count: number }[];
  today: { orders: number; gross: number };
  last30Days: { orders: number; gross: number };
  openCatering: number;
  revenueByDay: { day: string; gross: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    vendorName: string;
  }[];
};

export function getAdminOverview() {
  return apiGet<AdminOverview>("/admin/overview").then((result) => result.data);
}

export type AdminVendor = {
  id: string;
  businessName: string;
  slug: string;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  commissionRate: number;
  ratingAverage: number;
  ratingCount: number;
  isFeatured: boolean;
  createdAt: string;
  productCount: number;
  orderCount: number;
};

export function listAdminVendors(params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  return apiGet<AdminVendor[]>(
    `/admin/vendors${queryString({ status: params.status, search: params.search, page: params.page, limit: params.limit })}`,
  ).then(paged);
}

export type AdminVendorDetail = AdminVendor & {
  userEmail: string;
  description: string | null;
  address: string | null;
  state: string | null;
  documents: { id: string; kind: string; url: string; status: string; createdAt: string }[];
};

export function getAdminVendor(id: string) {
  return apiGet<AdminVendorDetail>(`/admin/vendors/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function updateAdminVendor(
  id: string,
  input: { status?: string; commissionRate?: number; isFeatured?: boolean },
) {
  return apiSend<{ updated: boolean; id: string; status: string }>(
    `/admin/vendors/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  ).then((result) => result.data);
}

export type AdminRider = {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string | null;
  status: string;
  verificationStatus: string;
  ratingAverage: number;
  ratingCount: number;
  createdAt: string;
  deliveryCount: number;
  pendingDocuments: number;
};

export function listAdminRiders(
  params: { verification?: string; search?: string; page?: number; limit?: number } = {},
) {
  return apiGet<AdminRider[]>(
    `/admin/riders${queryString({ verification: params.verification, search: params.search, page: params.page, limit: params.limit })}`,
  ).then(paged);
}

export type AdminRiderDetail = AdminRider & {
  vehicleNumber: string | null;
  verifiedAt: string | null;
  documentNote: string | null;
  userEmail: string;
  delivered: number;
  earned: number;
  documents: { id: string; kind: string; url: string; status: string; createdAt: string }[];
};

export function getAdminRider(id: string) {
  return apiGet<AdminRiderDetail>(`/admin/riders/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function updateAdminRider(
  id: string,
  input: { status?: string; verificationStatus?: string; documentNote?: string | null; reviewDocuments?: "APPROVED" | "REJECTED" },
) {
  return apiSend<{ updated: boolean; id: string }>(`/admin/riders/${encodeURIComponent(id)}`, "PATCH", input).then(
    (result) => result.data,
  );
}

export type AdminCustomer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
};

export function listAdminCustomers(params: { search?: string; page?: number; limit?: number } = {}) {
  return apiGet<AdminCustomer[]>(
    `/admin/customers${queryString({ search: params.search, page: params.page, limit: params.limit })}`,
  ).then(paged);
}

export type AdminCustomerDetail = Omit<AdminCustomer, "orderCount" | "totalSpent"> & {
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    createdAt: string;
    vendorName: string;
  }[];
};

export function getAdminCustomer(id: string) {
  return apiGet<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function updateAdminCustomer(id: string, input: { status: "ACTIVE" | "SUSPENDED" }) {
  return apiSend<{ updated: boolean; id: string; status: string }>(
    `/admin/customers/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  ).then((result) => result.data);
}

export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  vendorName: string;
  vendorSlug: string;
  customerEmail: string;
};

export function listAdminOrders(params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  return apiGet<AdminOrder[]>(
    `/admin/orders${queryString({ status: params.status, search: params.search, page: params.page, limit: params.limit })}`,
  ).then(paged);
}

export type AdminOrderDetail = AdminOrder & {
  currency: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  customerName: string | null;
  riderName: string | null;
  settlement: {
    gross: number;
    commissionRate: number;
    commissionAmount: number;
    riderFee: number;
    vendorNet: number;
    status: string;
    createdAt: string;
  } | null;
  items: { name: string; quantity: number; lineTotal: number }[];
  history: { status: string; note: string | null; createdAt: string }[];
};

export function getAdminOrder(id: string) {
  return apiGet<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`).then((result) => result.data);
}

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  isActive: boolean;
  isFeatured: boolean;
  stockQuantity: number;
  ratingAverage: number;
  createdAt: string;
  vendorName: string;
  vendorSlug: string;
};

export function listAdminProducts(params: { search?: string; page?: number; limit?: number } = {}) {
  return apiGet<AdminProduct[]>(
    `/admin/products${queryString({ search: params.search, page: params.page, limit: params.limit })}`,
  ).then(paged);
}

export function updateAdminProduct(id: string, input: { isFeatured?: boolean; isActive?: boolean }) {
  return apiSend<{ updated: boolean; id: string }>(`/admin/products/${encodeURIComponent(id)}`, "PATCH", input).then(
    (result) => result.data,
  );
}

export type AdminPayout = {
  id: string;
  vendorId: string;
  vendorName: string;
  reference: string;
  periodStart: string | null;
  periodEnd: string | null;
  gross: number;
  commission: number;
  fees: number;
  net: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

export function listAdminPayouts(params: { status?: string } = {}) {
  return apiGet<AdminPayout[]>(`/admin/payouts${queryString({ status: params.status })}`).then(
    (result) => result.data,
  );
}

export function createAdminPayout(input: { vendorId: string; periodStart?: string | null; periodEnd?: string | null; feesAmount?: number }) {
  return apiSend<{ id: string; reference: string; net: number }>("/admin/payouts", "POST", input).then(
    (result) => result.data,
  );
}

export function updateAdminPayout(id: string, input: { status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" }) {
  return apiSend<{ updated: boolean; id: string; status: string }>(
    `/admin/payouts/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  ).then((result) => result.data);
}

export type AdminCoupon = {
  id: string;
  code: string;
  type: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  vendorId: string | null;
  vendorName: string | null;
  createdAt: string;
};

export function listAdminCoupons() {
  return apiGet<AdminCoupon[]>("/admin/coupons").then((result) => result.data);
}

export function createAdminCoupon(input: {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxUses?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
  vendorId?: string | null;
}) {
  return apiSend<AdminCoupon>("/admin/coupons", "POST", input).then((result) => result.data);
}

export function updateAdminCoupon(id: string, input: Partial<Omit<AdminCoupon, "id" | "code" | "usedCount" | "createdAt" | "vendorName">>) {
  return apiSend<{ updated: boolean; id: string }>(`/admin/coupons/${encodeURIComponent(id)}`, "PATCH", input).then(
    (result) => result.data,
  );
}

export function deleteAdminCoupon(id: string) {
  return apiSend<{ removed: boolean; id: string }>(`/admin/coupons/${encodeURIComponent(id)}`, "DELETE").then(
    (result) => result.data,
  );
}

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
};

export function listAdminCategories() {
  return apiGet<AdminCategory[]>("/admin/categories").then((result) => result.data);
}

export function createAdminCategory(input: { name: string; description?: string | null; isActive?: boolean; sortOrder?: number }) {
  return apiSend<{ id: string; name: string; slug: string }>("/admin/categories", "POST", input).then(
    (result) => result.data,
  );
}

export function updateAdminCategory(
  id: string,
  input: { name?: string; description?: string | null; isActive?: boolean; sortOrder?: number },
) {
  return apiSend<{ updated: boolean; id: string }>(`/admin/categories/${encodeURIComponent(id)}`, "PATCH", input).then(
    (result) => result.data,
  );
}

// ── Super admin ─────────────────────────────────────────────────────────────

export type SuperAdminEntry = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export function listSuperAdmins(params: { page?: number; limit?: number } = {}) {
  return apiGet<SuperAdminEntry[]>(
    `/super-admin/admins${queryString({ page: params.page, limit: params.limit })}`,
  ).then((result) => {
    const meta = result.meta ?? {};
    return {
      items: result.data,
      total: typeof meta.total === "number" ? meta.total : result.data.length,
      page: typeof meta.page === "number" ? meta.page : 1,
      pageSize: typeof meta.pageSize === "number" ? meta.pageSize : result.data.length,
      totalPages: typeof meta.totalPages === "number" ? meta.totalPages : 1,
    };
  });
}

export function createSuperAdmin(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  role?: "ADMIN" | "SUPER_ADMIN";
}) {
  return apiSend<{ id: string; role: string; created?: boolean; promoted?: boolean }>(
    "/super-admin/admins",
    "POST",
    input,
  ).then((result) => result.data);
}

export function updateSuperAdmin(id: string, input: { role?: "ADMIN" | "SUPER_ADMIN"; status?: "ACTIVE" | "SUSPENDED" }) {
  return apiSend<{ updated: boolean; id: string; role: string; status: string }>(
    `/super-admin/admins/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  ).then((result) => result.data);
}

export type PlatformSetting = {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
};

export function listPlatformSettings() {
  return apiGet<PlatformSetting[]>("/super-admin/settings").then((result) => result.data);
}

export function updatePlatformSetting(key: string, value: Record<string, unknown>) {
  return apiSend<PlatformSetting>("/super-admin/settings", "PATCH", { key, value }).then((result) => result.data);
}

export type AuditEntry = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export function listAuditLog(params: { action?: string; page?: number; limit?: number } = {}) {
  return apiGet<AuditEntry[]>(
    `/super-admin/audit${queryString({ action: params.action, page: params.page, limit: params.limit })}`,
  ).then((result) => {
    const meta = result.meta ?? {};
    return {
      items: result.data,
      total: typeof meta.total === "number" ? meta.total : result.data.length,
      page: typeof meta.page === "number" ? meta.page : 1,
      pageSize: typeof meta.pageSize === "number" ? meta.pageSize : result.data.length,
      totalPages: typeof meta.totalPages === "number" ? meta.totalPages : 1,
    };
  });
}

export type SuperAnalytics = {
  gmvByDay: { day: string; gross: number; orders: number; commission: number }[];
  topVendors: { id: string; businessName: string; slug: string; gross: number; orders: number }[];
  topCategories: { name: string; gross: number; orders: number }[];
  userGrowth: { week: string; customers: number; vendors: number }[];
  cateringByStatus: { status: string; count: number }[];
};

export function getSuperAnalytics() {
  return apiGet<SuperAnalytics>("/super-admin/analytics").then((result) => result.data);
}

// ── Rider ───────────────────────────────────────────────────────────────────

export type RiderDocument = {
  id: string;
  kind: string;
  url: string;
  status: string;
  createdAt: string;
};

export type RiderProfile = {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  status: string;
  verificationStatus: string;
  verifiedAt: string | null;
  ratingAverage: number;
  ratingCount: number;
  documentNote: string | null;
  documents: RiderDocument[];
};

export function getRiderProfile() {
  return apiGet<RiderProfile>("/rider/profile").then((result) => result.data);
}

export function updateRiderProfile(input: {
  name?: string;
  phone?: string | null;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  status?: "ACTIVE" | "OFFLINE";
}) {
  return apiSend<Partial<RiderProfile>>("/rider/profile", "PATCH", input).then((result) => result.data);
}

export function uploadRiderDocument(input: { kind: string; url: string }) {
  return apiSend<RiderDocument>("/rider/documents", "POST", input).then((result) => result.data);
}

export type RiderJob = {
  id: string;
  orderNumber: string;
  total: number;
  deliveryFee: number;
  earnings: number;
  itemCount: number;
  createdAt: string;
  offerId: string | null;
  offerExpiresAt: string | null;
  offered: boolean;
  vendor: { name: string; slug: string };
  pickupZone: string | null;
  address: { fullAddress: string; city: string | null; state: string | null } | null;
};

export function listRiderJobs() {
  return apiGet<RiderJob[]>("/rider/jobs").then((result) => result.data);
}

export function acceptRiderJob(orderId: string) {
  return apiSend<{ deliveryId: string; orderId: string }>("/rider/jobs/accept", "POST", { orderId }).then(
    (result) => result.data,
  );
}

export function declineRiderJob(orderId: string) {
  return apiSend<{ declined: boolean }>("/rider/jobs/decline", "POST", { orderId }).then(
    (result) => result.data,
  );
}

export function postRiderLocation(input: {
  deliveryId?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  zone?: string | null;
}) {
  return apiSend<{ recorded: boolean }>("/rider/locations", "POST", input).then((result) => result.data);
}

export type RiderDelivery = {
  id: string;
  status: string;
  assignedAt: string | null;
  goingToVendorAt?: string | null;
  arrivedAtVendorAt?: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  requireOtp: boolean;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    deliveryFee: number;
    itemCount: number;
    createdAt: string;
  };
  vendor: { name: string; slug: string };
  customer: { name: string | null; phone: string | null };
  address: { fullAddress: string; city: string | null; state: string | null } | null;
};

export function listRiderDeliveries(params: { status?: string; active?: boolean } = {}) {
  return apiGet<RiderDelivery[]>(
    `/rider/deliveries${queryString({ status: params.status, active: params.active })}`,
  ).then((result) => result.data);
}

export type RiderDeliveryDetail = {
  id: string;
  status: string;
  trackingNote: string | null;
  assignedAt: string | null;
  goingToVendorAt: string | null;
  arrivedAtVendorAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
    deliveryInstructions: string | null;
    requireOtp: boolean;
  };
  vendor: { id: string; name: string; slug: string; phone: string | null };
  customer: { id: string; name: string | null; phone: string | null };
  address: { fullAddress: string; city: string | null; state: string | null } | null;
  items: { name: string; quantity: number; customInstructions: string | null }[];
};

export function getRiderDelivery(id: string) {
  return apiGet<RiderDeliveryDetail>(`/rider/deliveries/${encodeURIComponent(id)}`).then((result) => result.data);
}

export type RiderDeliveryAction = "going" | "arrived" | "pickup" | "in_transit" | "deliver" | "fail";

export function riderDeliveryAction(id: string, action: RiderDeliveryAction, note?: string | null, otp?: string | null) {
  return apiSend<{ status: string }>(`/rider/deliveries/${encodeURIComponent(id)}`, "PATCH", {
    action,
    ...(note ? { note } : {}),
    ...(otp ? { otp } : {}),
  }).then((result) => result.data);
}

export type RiderEarnings = {
  delivered: number;
  earned: number;
  last7Days: { earned: number; delivered: number };
  rating: { average: number; count: number };
  byDay: { day: string; earned: number; trips: number }[];
  recent: { id: string; orderNumber: string; deliveryFee: number; deliveredAt: string | null }[];
};

export function getRiderEarnings() {
  return apiGet<RiderEarnings>("/rider/earnings").then((result) => result.data);
}

// ── Favorites (customers) ─────────────────────────────────────────────────

export type FavoriteProduct = {
  id: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice: number | null;
    imageUrl: string | null;
    ratingAverage: number;
    vendorName: string | null;
    vendorSlug: string | null;
  };
};

export type FavoriteVendor = {
  id: string;
  createdAt: string;
  vendor: {
    id: string;
    businessName: string;
    slug: string;
    logoUrl: string | null;
    city: string | null;
    ratingAverage: number;
  };
};

export type FavoritesResult = {
  products: FavoriteProduct[];
  vendors: FavoriteVendor[];
};

export function getFavorites() {
  return apiGet<FavoritesResult>("/favorites").then((result) => result.data);
}

export function toggleFavorite(input: { productId?: string; vendorId?: string }) {
  return apiSend<{ favorited: boolean; productId?: string; vendorId?: string }>("/favorites", "POST", input).then(
    (result) => result.data,
  );
}

export function removeFavorite(input: { productId?: string; vendorId?: string }) {
  return apiSend<{ removed: boolean }>("/favorites", "DELETE", input).then((result) => result.data);
}

// ── Notifications (any signed-in role) ────────────────────────────────────

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export function getNotifications(params: { unreadOnly?: boolean; limit?: number } = {}) {
  return apiGet<NotificationItem[]>(
    `/notifications${queryString({ unreadOnly: params.unreadOnly, limit: params.limit })}`,
  ).then((result) => ({
    items: result.data,
    unreadCount: typeof result.meta?.unreadCount === "number" ? result.meta.unreadCount : 0,
  }));
}

export function markNotificationsRead(input: { ids?: string[]; allRead?: boolean }) {
  return apiSend<{ markedRead: boolean }>("/notifications", "PATCH", input).then((result) => result.data);
}

// ── Catering requests (customers) ─────────────────────────────────────────

export type CateringQuote = {
  id: string;
  amount: number;
  perGuest: number | null;
  message: string | null;
  status: string | null;
  respondedAt?: string | null;
};

export type CateringRequest = {
  id: string;
  status: string;
  fullName: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  guestCount: number;
  createdAt: string;
  package: { id: string; title: string; slug: string; pricePerGuest: number; minimumGuests?: number };
  vendor: { id: string; businessName: string; slug: string };
  quote: CateringQuote | null;
};

export type CateringRequestDetail = CateringRequest & {
  phone: string;
  email: string;
  specialRequirements: string | null;
};

export type CateringRequestInput = {
  packageId?: string;
  packageSlug?: string;
  fullName: string;
  phone: string;
  email: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  guestCount: number;
  specialRequirements?: string | null;
};

export function getCateringRequests() {
  return apiGet<CateringRequest[]>("/catering/requests").then((result) => result.data);
}

export function createCateringRequest(input: CateringRequestInput) {
  return apiSend<CateringRequest>("/catering/requests", "POST", input).then((result) => result.data);
}

export function getCateringRequest(id: string) {
  return apiGet<CateringRequestDetail>(`/catering/requests/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function updateCateringRequest(id: string, action: "accept" | "cancel") {
  return apiSend<{ status: string }>(`/catering/requests/${encodeURIComponent(id)}`, "PATCH", { action }).then(
    (result) => result.data,
  );
}

// ── Addresses: update & delete ────────────────────────────────────────────

export function updateAddress(id: string, address: Partial<AddressInput> & { isDefault?: boolean }) {
  return apiSend<Address>(`/addresses/${encodeURIComponent(id)}`, "PATCH", address).then((result) => result.data);
}

export function deleteAddress(id: string) {
  return apiSend<{ removed: boolean }>(`/addresses/${encodeURIComponent(id)}`, "DELETE").then(
    (result) => result.data,
  );
}

// ── Product reviews ───────────────────────────────────────────────────────

export function createProductReview(
  slug: string,
  input: { orderId: string; rating: number; comment?: string | null },
) {
  return apiSend<ProductReview[]>(`/products/${encodeURIComponent(slug)}/reviews`, "POST", input).then(
    (result) => result.data,
  );
}

export type ReviewableOrder = {
  orderId: string;
  orderNumber: string;
  deliveredAt: string | null;
  reviewed: boolean;
};

export function getReviewableOrders(productId: string) {
  return apiGet<ReviewableOrder[]>(`/orders/reviewable${queryString({ productId })}`).then(
    (result) => result.data,
  );
}

// ── Email verification, password reset & password change ─────────────────────

export function requestPasswordReset(email: string) {
  return apiSend<null>("/auth/forgot-password", "POST", { email }).then((result) => result.data);
}

export function resetPassword(input: { token: string; password: string }) {
  return apiSend<null>("/auth/reset-password", "POST", input).then((result) => result.data);
}

export function verifyEmail(token: string) {
  return apiSend<null>("/auth/verify-email", "POST", { token }).then((result) => result.data);
}

export function resendVerification(email: string) {
  return apiSend<null>("/auth/verify-email/send", "POST", { email }).then((result) => result.data);
}

// ── Cart, checkout & payments (cookie sessions) ─────────────────────────────

export function getCart() {
  return apiGet<CartView>("/cart").then((result) => result.data);
}

export function addCartItem(productId: string, quantity = 1, customInstructions?: string) {
  return apiSend<CartView>("/cart/items", "POST", { productId, quantity, customInstructions }).then(
    (result) => result.data,
  );
}

export function updateCartItem(itemId: string, quantity: number) {
  return apiSend<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, "PATCH", { quantity }).then(
    (result) => result.data,
  );
}

export function removeCartItem(itemId: string) {
  return apiSend<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, "DELETE").then((result) => result.data);
}

export function clearCart() {
  return apiSend<null>("/cart", "DELETE").then((result) => result.data);
}

export function getAddresses() {
  return apiGet<Address[]>("/addresses").then((result) => result.data);
}

export function createAddress(address: AddressInput) {
  return apiSend<Address>("/addresses", "POST", address).then((result) => result.data);
}

export type OrderDetail = OrderListItem & {
  address: {
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

export function getOrder(id: string) {
  return apiGet<OrderDetail>(`/orders/${encodeURIComponent(id)}`).then((result) => result.data);
}

export function getOrders(params: OrderQuery = {}) {
  return apiGet<OrderListItem[]>(`/orders${queryString({ page: params.page, limit: params.limit })}`).then(
    (result) => {
      const meta = result.meta ?? {};
      return {
        items: result.data,
        total: typeof meta.total === "number" ? meta.total : result.data.length,
        page: typeof meta.page === "number" ? meta.page : 1,
        pageSize: typeof meta.pageSize === "number" ? meta.pageSize : result.data.length,
        totalPages: typeof meta.totalPages === "number" ? meta.totalPages : 1,
      };
    },
  );
}

export type OrderTracking = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  vendor: { name: string; slug: string; phone: string | null };
  address: { fullAddress: string; city: string | null; state: string | null } | null;
  delivery: {
    status: string;
    riderName: string | null;
    riderPhone: string | null;
    vehicleType: string | null;
    assignedAt: string | null;
    goingToVendorAt: string | null;
    arrivedAtVendorAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    progressPct: number;
  } | null;
  items: { name: string; quantity: number; lineTotal: number }[];
  history: { status: string; note: string | null; createdAt: string }[];
};

export function trackOrderByNumber(number: string) {
  return apiGet<OrderTracking>(`/orders/track${queryString({ number })}`).then((result) => result.data);
}

export function createCheckoutOrders(input: { addressId: string; deliveryInstructions?: string; couponCode?: string }) {
  return apiSend<CheckoutResult>("/orders/checkout", "POST", input).then((result) => result.data);
}

export type CheckoutQuoteLine = {
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  couponApplied: boolean;
};

export type CheckoutQuote = {
  lines: CheckoutQuoteLine[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  discount: number;
  total: number;
  pricing?: { serviceFeeType: string; serviceFeeValue: number; taxRatePercent: number };
  coupon: { code: string; type: string; value: number; vendorName: string | null } | null;
};

export function quoteCheckout(input: { addressId?: string; couponCode?: string }) {
  return apiSend<CheckoutQuote>("/orders/checkout/quote", "POST", input).then((result) => result.data);
}

export function initializePayment(orderId: string) {
  return apiSend<PaymentInitializeResult>("/payments/initialize", "POST", { orderId }).then(
    (result) => result.data,
  );
}

export function verifyPayment(reference: string) {
  return apiGet<PaymentVerifyResult>(`/payments/verify${queryString({ reference })}`).then(
    (result) => result.data,
  );
}