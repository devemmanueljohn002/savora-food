const DEFAULT_BACKEND_URL = "http://localhost:4000";

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
};

export type BackendProduct = {
  id: string;
  slug?: string;
  name: string;
  description?: string | null;
  price: number | string;
  discountPrice?: number | string | null;
  productType?: string;
  isAvailable?: boolean;
  ratingAverage?: number;
  vendor?: {
    id?: string;
    businessName?: string;
    name?: string;
    city?: string;
    state?: string;
  };
  category?: {
    id?: string;
    name?: string;
  };
  images?: Array<{
    id?: string;
    url?: string;
    isPrimary?: boolean;
  }>;
};

export type BackendVendor = {
  id: string;
  businessName?: string;
  name?: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  ratingAverage?: number;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  status?: string;
  categories?: Array<
    | { name?: string }
    | { category?: { name?: string } }
  >;
};

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  DEFAULT_BACKEND_URL;

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: string;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

export type CartView = {
  items: Array<{
    id: string;
    product: { id: string; name: string; slug?: string; image?: string };
    vendor: { id: string; businessName?: string; name?: string };
    variant?: { id: string; name: string } | null;
    quantity: number;
    unitPrice: number | string;
    lineTotal: number | string;
    customInstructions?: string | null;
  }>;
  subtotal: number | string;
  vendorCount: number;
};

export type Address = {
  id: string;
  label?: string | null;
  fullAddress: string;
  city: string;
  state: string;
  country: string;
  landmark?: string | null;
  isDefault: boolean;
};

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T> | T;

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }

  return payload as T;
}

async function requestApi<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = (await response.json()) as ApiEnvelope<T> & { message?: string };
  if (!response.ok) throw new Error(payload.message || `Request failed with status ${response.status}`);
  return payload && typeof payload === "object" && "data" in payload ? payload.data : (payload as T);
}

function toCurrencyNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function humanizeType(value?: string): string {
  if (!value) return "Food";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeProduct(item: BackendProduct) {
  const price = toCurrencyNumber(item.price);
  const oldPrice = item.discountPrice ? toCurrencyNumber(item.discountPrice) : undefined;
  const primaryImage =
    item.images?.find((image) => image.isPrimary)?.url ||
    item.images?.[0]?.url ||
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";

  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    vendor: item.vendor?.businessName || item.vendor?.name || "Savora Kitchen",
    category: item.category?.name || humanizeType(item.productType),
    price,
    oldPrice: oldPrice && oldPrice > price ? oldPrice : undefined,
    rating: Number(item.ratingAverage ?? 4.5),
    image: primaryImage,
    description: item.description || "Freshly prepared and delivered with care.",
    location: item.vendor?.city ? `${item.vendor.city}, Nigeria` : "Nigeria",
  };
}

export async function getProductById(id: string) {
  try {
    return normalizeProduct(await fetchApi<BackendProduct>(`/api/v1/products/${id}`));
  } catch {
    return null;
  }
}

export async function getVendorById(id: string) {
  try {
    return normalizeVendor(await fetchApi<BackendVendor>(`/api/v1/vendors/${id}`));
  } catch {
    return null;
  }
}

export async function getVendorProducts(id: string) {
  try {
    const response = (await fetchApi<BackendProduct[]>(`/api/v1/vendors/${id}/products?limit=20`)) || [];
    return response.map(normalizeProduct);
  } catch {
    return [];
  }
}

export function login(input: { email: string; password: string }) {
  return requestApi<AuthSession>("/api/v1/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function register(input: { firstName: string; lastName: string; email: string; phone?: string; password: string }) {
  return requestApi<AuthSession>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export function refreshSession(refreshToken: string) {
  return requestApi<AuthSession>("/api/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) });
}

export function logout(refreshToken: string) {
  return requestApi<{ message: string }>("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
}

export function getCart(token: string) { return requestApi<CartView>("/api/v1/cart", {}, token); }
export function addCartItem(token: string, productId: string, quantity = 1, customInstructions?: string) {
  return requestApi<CartView>("/api/v1/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity, customInstructions }) }, token);
}
export function updateCartItem(token: string, itemId: string, quantity: number) {
  return requestApi<CartView>(`/api/v1/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }, token);
}
export function removeCartItem(token: string, itemId: string) { return requestApi<CartView>(`/api/v1/cart/items/${itemId}`, { method: "DELETE" }, token); }
export function getAddresses(token: string) { return requestApi<Address[]>("/api/v1/addresses", {}, token); }
export function createAddress(token: string, address: Omit<Address, "id" | "isDefault" | "country"> & { country?: string }) {
  return requestApi<Address>("/api/v1/addresses", { method: "POST", body: JSON.stringify(address) }, token);
}
export function checkout(token: string, input: { addressId: string; paymentProvider: "KORAPAY" | "FLUTTERWAVE"; deliveryInstructions?: string }) {
  return requestApi<{ parentCheckout: { id: string }; totalAmount: number | string }>("/api/v1/orders/checkout", { method: "POST", body: JSON.stringify(input) }, token);
}
export function initializePayment(token: string, parentCheckoutId: string, provider: "KORAPAY" | "FLUTTERWAVE") {
  return requestApi<{ authorizationUrl: string }>("/api/v1/payments/initialize", { method: "POST", body: JSON.stringify({ parentCheckoutId, provider }) }, token);
}

export function normalizeVendor(item: BackendVendor) {
  const firstCategory = item.categories?.[0];
  const category = firstCategory && "category" in firstCategory
    ? firstCategory.category?.name
    : firstCategory && "name" in firstCategory
      ? firstCategory.name
      : "Marketplace";

  return {
    id: item.id,
    name: item.businessName || item.name || "Savora Vendor",
    tagline: item.description || "Freshly prepared by a trusted vendor.",
    category: category || "Marketplace",
    city: item.city || "Lagos",
    location: item.address || item.state || "Nigeria",
    rating: Number(item.ratingAverage ?? 4.7),
    image: item.coverImageUrl || item.logoUrl || "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80",
    verified: item.status === "VERIFIED" || item.status === "PENDING",
  };
}

export async function getProductsByType(type: "FOOD" | "CAKE" | "SNACK" | "DRINK" = "FOOD") {
  try {
    const response = (await fetchApi<BackendProduct[]>(`/api/v1/products?productType=${type}&limit=20`)) || [];
    return response.map(normalizeProduct);
  } catch {
    return [];
  }
}

export async function getFeaturedProducts() {
  try {
    const response = (await fetchApi<BackendProduct[]>("/api/v1/products?limit=6")) || [];
    return response.map(normalizeProduct);
  } catch {
    return [];
  }
}

export async function getVendors() {
  try {
    const response = (await fetchApi<BackendVendor[]>("/api/v1/vendors?limit=20")) || [];
    return response.map(normalizeVendor);
  } catch {
    return [];
  }
}
