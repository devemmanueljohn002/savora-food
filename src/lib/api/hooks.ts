"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptRiderJob,
  declineRiderJob,
  acceptVendorOrder,
  addCartItem,
  advanceVendorOrder,
  cancelVendorOrder,
  changeAccountPassword,
  clearCart,
  createAddress,
  createAdminCategory,
  createAdminCoupon,
  createAdminPayout,
  createCateringRequest,
  createSuperAdmin,
  createCheckoutOrders,
  createProductReview,
  createProductVariant,
  createVendorProduct,
  currentUser,
  declineVendorCatering,
  deleteAddress,
  deleteAdminCoupon,
  deleteProductVariant,
  deleteVendorProduct,
  getAccount,
  getConsumerOverview,
  getAddresses,
  getAdminCustomer,
  getAdminOrder,
  getAdminOverview,
  getAdminRider,
  getAdminVendor,
  getCart,
  getCateringRequest,
  getCateringRequests,
  getCategories,
  getCateringPackages,
  getFavorites,
  getLocations,
  getNotifications,
  getOrder,
  getOrders,
  getProduct,
  getProductReviews,
  getProducts,
  getReviewableOrders,
  getRiderDelivery,
  getRiderEarnings,
  getRiderProfile,
  getSuperAnalytics,
  getVendor,
  getVendorAnalytics,
  getVendorCatering,
  getVendorEarnings,
  getVendorOnboarding,
  getVendorOrder,
  getVendorProduct,
  getVendorProfile,
  getVendors,
  getVendorProducts,
  initializePayment,
  listAdminCategories,
  listAdminCoupons,
  listAdminCustomers,
  listAdminOrders,
  listAdminPayouts,
  listAdminProducts,
  listAdminRiders,
  listAdminVendors,
  listAuditLog,
  listPlatformSettings,
  listProductVariants,
  listRiderDeliveries,
  listRiderJobs,
  listSuperAdmins,
  listVendorCatering,
  listVendorOrders,
  listVendorProducts,
  markNotificationsRead,
  quoteCheckout,
  quoteVendorCatering,
  rejectVendorOrder,
  removeCartItem,
  removeFavorite,
  riderDeliveryAction,
  toggleFavorite,
  updateAccount,
  updateAddress,
  updateAdminCategory,
  updateAdminCoupon,
  updateAdminCustomer,
  updateAdminPayout,
  updateAdminProduct,
  updateAdminRider,
  updateAdminVendor,
  updateCateringRequest,
  updateCartItem,
  updatePlatformSetting,
  updateProductVariant,
  updateRiderProfile,
  updateSuperAdmin,
  updateVendorOnboarding,
  updateVendorProduct,
  updateVendorProfileFull,
  uploadRiderDocument,
  verifyPayment,
  type AccountOverview,
  type CatalogQuery,
  type CateringRequestInput,
  type OrderQuery,
  type VendorOnboardingInput,
  type VendorProductInput,
  type VendorQuery,
} from "@/lib/savora-api";

// ── Live dashboards ─────────────────────────────────────────────────────────
// Consumer, vendor and rider dashboards show real-time data by polling while
// a query holds data (so logged-out visitors don't ping auth endpoints).
// React Query pauses polling automatically when the browser tab is hidden.
export const LIVE_POLL_INTERVAL = 15_000;

export function livePoll<T>(data: T | undefined): number | false {
  return data ? LIVE_POLL_INTERVAL : false;
}

export const catalogKeys = {
  products: (params: CatalogQuery) => ["products", params] as const,
  product: (slug: string) => ["product", slug] as const,
  productReviews: (slug: string) => ["product-reviews", slug] as const,
  categories: ["categories"] as const,
  locations: ["locations"] as const,
  vendors: (params: VendorQuery) => ["vendors", params] as const,
  vendor: (slug: string) => ["vendor", slug] as const,
  vendorProducts: (slug: string) => ["vendor-products", slug] as const,
  cateringPackages: ["catering-packages"] as const,
  currentUser: ["current-user"] as const,
};

export function useProducts(params: CatalogQuery = {}) {
  return useQuery({
    queryKey: catalogKeys.products(params),
    queryFn: async ({ signal }) => (await getProducts(params, signal)).data,
    staleTime: 30_000,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: async ({ signal }) => (await getProduct(slug, signal)).data,
    enabled: Boolean(slug),
  });
}

export function useProductReviews(slug: string) {
  return useQuery({
    queryKey: catalogKeys.productReviews(slug),
    queryFn: async ({ signal }) => (await getProductReviews(slug, signal)).data,
    enabled: Boolean(slug),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: async ({ signal }) => (await getCategories(signal)).data,
    staleTime: 5 * 60_000,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: catalogKeys.locations,
    queryFn: async ({ signal }) => (await getLocations(signal)).data,
    staleTime: 5 * 60_000,
  });
}

export function useVendors(params: VendorQuery = {}) {
  return useQuery({
    queryKey: catalogKeys.vendors(params),
    queryFn: async ({ signal }) => (await getVendors(params, signal)).data,
    staleTime: 30_000,
  });
}

export function useVendor(slug: string) {
  return useQuery({
    queryKey: catalogKeys.vendor(slug),
    queryFn: async ({ signal }) => (await getVendor(slug, signal)).data,
    enabled: Boolean(slug),
  });
}

export function useVendorProducts(slug: string, params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: catalogKeys.vendorProducts(slug),
    queryFn: async ({ signal }) => (await getVendorProducts(slug, params, signal)).data,
    enabled: Boolean(slug),
  });
}

export function useCateringPackages(params: { limit?: number } = {}) {
  return useQuery({
    queryKey: catalogKeys.cateringPackages,
    queryFn: async ({ signal }) => (await getCateringPackages(params, signal)).data,
    staleTime: 5 * 60_000,
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: catalogKeys.currentUser,
    queryFn: () => currentUser(),
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export const cartKeys = {
  cart: ["cart"] as const,
  addresses: ["addresses"] as const,
  orders: (params: OrderQuery) => ["orders", params] as const,
};

export function useCart() {
  return useQuery({
    queryKey: cartKeys.cart,
    queryFn: getCart,
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useAddresses() {
  return useQuery({
    queryKey: cartKeys.addresses,
    queryFn: getAddresses,
    retry: false,
    staleTime: 30_000,
  });
}

export function useOrders(params: OrderQuery = {}) {
  return useQuery({
    queryKey: cartKeys.orders(params),
    queryFn: () => getOrders(params),
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useOrder(id: string, enabled = true) {
  return useQuery({
    queryKey: ["order", id] as const,
    queryFn: () => getOrder(id),
    enabled: Boolean(id) && enabled,
    retry: false,
    staleTime: 10_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useAddCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, quantity, customInstructions }: { productId: string; quantity?: number; customInstructions?: string }) =>
      addCartItem(productId, quantity, customInstructions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) => updateCartItem(itemId, quantity),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearCart,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAddress,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.addresses });
    },
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCheckoutOrders,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
    },
  });
}

export function useCheckoutQuote(addressId?: string, couponCode?: string) {
  return useQuery({
    queryKey: ["checkout-quote", addressId ?? null, couponCode ?? null] as const,
    queryFn: () => quoteCheckout({ ...(addressId ? { addressId } : {}), ...(couponCode ? { couponCode } : {}) }),
    retry: false,
    staleTime: 30_000,
  });
}

export function useInitializePayment() {
  return useMutation({
    mutationFn: (orderId: string) => initializePayment(orderId),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => verifyPayment(reference),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ── Account ───────────────────────────────────────────────────────────────

export const accountKeys = {
  overview: ["account"] as const,
};

export function useAccount() {
  return useQuery({
    queryKey: accountKeys.overview,
    queryFn: getAccount,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useConsumerOverview() {
  return useQuery({
    queryKey: ["account", "overview"] as const,
    queryFn: getConsumerOverview,
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstName?: string; lastName?: string; phone?: string | null }) => updateAccount(input),
    onSuccess: (profile) => {
      queryClient.setQueryData<AccountOverview | undefined>(accountKeys.overview, (current) =>
        current ? { ...current, user: { ...current.user, ...profile } } : current,
      );
      void queryClient.invalidateQueries({ queryKey: accountKeys.overview });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.currentUser });
    },
  });
}

export function useChangeAccountPassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => changeAccountPassword(input),
  });
}

// ── Favorites ─────────────────────────────────────────────────────────────

export const favoriteKeys = {
  all: ["favorites"] as const,
};

export function useFavorites() {
  return useQuery({
    queryKey: favoriteKeys.all,
    queryFn: getFavorites,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId?: string; vendorId?: string }) => toggleFavorite(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });
}

export function useRemoveFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId?: string; vendorId?: string }) => removeFavorite(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });
}

// ── Notifications ─────────────────────────────────────────────────────────

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread"] as const,
};

export function useNotifications(params: { unreadOnly?: boolean; limit?: number } = {}) {
  return useQuery({
    queryKey: [...notificationKeys.all, params] as const,
    queryFn: () => getNotifications(params),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useUnreadNotifications() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => getNotifications({ unreadOnly: true, limit: 10 }),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; allRead?: boolean }) => markNotificationsRead(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unread });
    },
  });
}

// ── Catering requests ─────────────────────────────────────────────────────

export const cateringRequestKeys = {
  all: ["catering-requests"] as const,
  detail: (id: string) => ["catering-request", id] as const,
};

export function useCateringRequests() {
  return useQuery({
    queryKey: cateringRequestKeys.all,
    queryFn: getCateringRequests,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useCateringRequest(id: string) {
  return useQuery({
    queryKey: cateringRequestKeys.detail(id),
    queryFn: () => getCateringRequest(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useCreateCateringRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CateringRequestInput) => createCateringRequest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cateringRequestKeys.all });
    },
  });
}

export function useUpdateCateringRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "cancel" }) => updateCateringRequest(id, action),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: cateringRequestKeys.all });
      void queryClient.invalidateQueries({ queryKey: cateringRequestKeys.detail(variables.id) });
    },
  });
}

// ── Addresses: update & delete ────────────────────────────────────────────

export function useUpdateAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateAddress>[1] }) =>
      updateAddress(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.addresses });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cartKeys.addresses });
    },
  });
}

// ── Reviews ───────────────────────────────────────────────────────────────

export function useCreateProductReview(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: string; rating: number; comment?: string | null }) =>
      createProductReview(slug, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.productReviews(slug) });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.product(slug) });
    },
  });
}

export function useReviewableOrders(productId: string) {
  return useQuery({
    queryKey: ["reviewable-orders", productId] as const,
    queryFn: () => getReviewableOrders(productId),
    enabled: Boolean(productId),
    retry: false,
    staleTime: 60_000,
  });
}

// ── Vendor onboarding ─────────────────────────────────────────────────────

export const vendorOnboardingKeys = {
  detail: ["vendor-onboarding"] as const,
};

export function useVendorOnboarding() {
  return useQuery({
    queryKey: vendorOnboardingKeys.detail,
    queryFn: getVendorOnboarding,
    retry: false,
    staleTime: 60_000,
  });
}

export function useUpdateVendorOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorOnboardingInput) => updateVendorOnboarding(input),
    onSuccess: (vendor) => {
      queryClient.setQueryData(vendorOnboardingKeys.detail, vendor);
    },
  });
}

// ── Vendor dashboard ──────────────────────────────────────────────────────

export const vendorKeys = {
  products: ["vendor-products"] as const,
  product: (id: string) => ["vendor-product", id] as const,
  variants: (productId: string) => ["vendor-variants", productId] as const,
  orders: ["vendor-orders"] as const,
  order: (id: string) => ["vendor-order", id] as const,
  catering: ["vendor-catering"] as const,
  cateringDetail: (id: string) => ["vendor-catering", id] as const,
  earnings: ["vendor-earnings"] as const,
  analytics: ["vendor-analytics"] as const,
  profile: ["vendor-profile"] as const,
};

export function useVendorProductsList(params: { search?: string; active?: boolean; lowStock?: boolean } = {}) {
  return useQuery({
    queryKey: [...vendorKeys.products, params] as const,
    queryFn: () => listVendorProducts(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useVendorProduct(id: string) {
  return useQuery({
    queryKey: vendorKeys.product(id),
    queryFn: () => getVendorProduct(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreateVendorProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorProductInput) => createVendorProduct(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.products });
    },
  });
}

export function useUpdateVendorProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateVendorProduct>[1]) => updateVendorProduct(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.products });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.product(id) });
    },
  });
}

export function useDeleteVendorProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => deleteVendorProduct(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.products });
    },
  });
}

export function useProductVariants(productId: string) {
  return useQuery({
    queryKey: vendorKeys.variants(productId),
    queryFn: () => listProductVariants(productId),
    enabled: Boolean(productId),
    retry: false,
  });
}

export function useCreateProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; price?: number | null; stockQuantity?: number; isActive?: boolean }) =>
      createProductVariant(productId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.variants(productId) });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.product(productId) });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.products });
    },
  });
}

export function useUpdateProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: { name?: string; price?: number | null; stockQuantity?: number; isActive?: boolean } }) =>
      updateProductVariant(productId, variantId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.variants(productId) });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.product(productId) });
    },
  });
}

export function useDeleteProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => deleteProductVariant(productId, variantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.variants(productId) });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.product(productId) });
    },
  });
}

export function useVendorOrders(params: { status?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...vendorKeys.orders, params] as const,
    queryFn: () => listVendorOrders(params),
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useVendorOrder(id: string) {
  return useQuery({
    queryKey: vendorKeys.order(id),
    queryFn: () => getVendorOrder(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useAdvanceVendorOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note?: string | null) => advanceVendorOrder(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.orders });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.order(id) });
    },
  });
}

export function useCancelVendorOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note?: string | null) => cancelVendorOrder(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.orders });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.order(id) });
    },
  });
}

export function useAcceptVendorOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note?: string | null) => acceptVendorOrder(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.orders });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.order(id) });
    },
  });
}

export function useRejectVendorOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note?: string | null) => rejectVendorOrder(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.orders });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.order(id) });
    },
  });
}

export function useVendorCatering() {
  return useQuery({
    queryKey: vendorKeys.catering,
    queryFn: () => listVendorCatering(),
    retry: false,
    staleTime: 30_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useVendorCateringDetail(id: string) {
  return useQuery({
    queryKey: vendorKeys.cateringDetail(id),
    queryFn: () => getVendorCatering(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useQuoteVendorCatering(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number; perGuest?: number | null; message?: string | null }) =>
      quoteVendorCatering(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.catering });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.cateringDetail(id) });
    },
  });
}

export function useDeclineVendorCatering(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => declineVendorCatering(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.catering });
      void queryClient.invalidateQueries({ queryKey: vendorKeys.cateringDetail(id) });
    },
  });
}

export function useVendorEarnings() {
  return useQuery({
    queryKey: vendorKeys.earnings,
    queryFn: getVendorEarnings,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useVendorAnalytics() {
  return useQuery({
    queryKey: vendorKeys.analytics,
    queryFn: getVendorAnalytics,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useVendorProfile() {
  return useQuery({
    queryKey: vendorKeys.profile,
    queryFn: getVendorProfile,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useUpdateVendorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateVendorProfileFull>[0]) => updateVendorProfileFull(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(vendorKeys.profile, profile);
      void queryClient.invalidateQueries({ queryKey: vendorKeys.profile });
    },
  });
}

// ── Rider ───────────────────────────────────────────────────────────────────

export const riderKeys = {
  profile: ["rider-profile"] as const,
  jobs: ["rider-jobs"] as const,
  deliveries: ["rider-deliveries"] as const,
  delivery: (id: string) => ["rider-delivery", id] as const,
  earnings: ["rider-earnings"] as const,
};

export function useRiderProfile() {
  return useQuery({
    queryKey: riderKeys.profile,
    queryFn: getRiderProfile,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useUpdateRiderProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateRiderProfile>[0]) => updateRiderProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(riderKeys.profile, (current: unknown) =>
        current && typeof current === "object" ? { ...current, ...profile } : current,
      );
      void queryClient.invalidateQueries({ queryKey: riderKeys.profile });
    },
  });
}

export function useUploadRiderDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: string; url: string }) => uploadRiderDocument(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderKeys.profile });
    },
  });
}

export function useRiderJobs() {
  return useQuery({
    queryKey: riderKeys.jobs,
    queryFn: listRiderJobs,
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useAcceptRiderJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => acceptRiderJob(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: riderKeys.deliveries });
    },
  });
}

export function useDeclineRiderJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => declineRiderJob(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderKeys.jobs });
    },
  });
}

export function useRiderDeliveries(params: { status?: string; active?: boolean } = {}) {
  return useQuery({
    queryKey: [...riderKeys.deliveries, params] as const,
    queryFn: () => listRiderDeliveries(params),
    retry: false,
    staleTime: 15_000,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useRiderDelivery(id: string) {
  return useQuery({
    queryKey: riderKeys.delivery(id),
    queryFn: () => getRiderDelivery(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (data) => livePoll(data),
  });
}

export function useRiderDeliveryAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, note, otp }: { action: "going" | "arrived" | "pickup" | "in_transit" | "deliver" | "fail"; note?: string | null; otp?: string | null }) =>
      riderDeliveryAction(id, action, note, otp),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: riderKeys.deliveries });
      void queryClient.invalidateQueries({ queryKey: riderKeys.delivery(id) });
      void queryClient.invalidateQueries({ queryKey: riderKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: riderKeys.earnings });
    },
  });
}

export function useRiderEarnings() {
  return useQuery({
    queryKey: riderKeys.earnings,
    queryFn: getRiderEarnings,
    retry: false,
    staleTime: 60_000,
    refetchInterval: (data) => livePoll(data),
  });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export const adminKeys = {
  overview: ["admin-overview"] as const,
  vendors: ["admin-vendors"] as const,
  vendor: (id: string) => ["admin-vendor", id] as const,
  riders: ["admin-riders"] as const,
  rider: (id: string) => ["admin-rider", id] as const,
  customers: ["admin-customers"] as const,
  customer: (id: string) => ["admin-customer", id] as const,
  orders: ["admin-orders"] as const,
  order: (id: string) => ["admin-order", id] as const,
  products: ["admin-products"] as const,
  payouts: ["admin-payouts"] as const,
  coupons: ["admin-coupons"] as const,
  categories: ["admin-categories"] as const,
};

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: getAdminOverview,
    retry: false,
    staleTime: 60_000,
  });
}

export function useAdminVendors(params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...adminKeys.vendors, params] as const,
    queryFn: () => listAdminVendors(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useAdminVendor(id: string) {
  return useQuery({
    queryKey: adminKeys.vendor(id),
    queryFn: () => getAdminVendor(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useUpdateAdminVendor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateAdminVendor>[1]) => updateAdminVendor(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.vendors });
      void queryClient.invalidateQueries({ queryKey: adminKeys.vendor(id) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
    },
  });
}

export function useAdminRiders(
  params: { verification?: string; search?: string; page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: [...adminKeys.riders, params] as const,
    queryFn: () => listAdminRiders(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useAdminRider(id: string) {
  return useQuery({
    queryKey: adminKeys.rider(id),
    queryFn: () => getAdminRider(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useUpdateAdminRider(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateAdminRider>[1]) => updateAdminRider(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.riders });
      void queryClient.invalidateQueries({ queryKey: adminKeys.rider(id) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.overview });
    },
  });
}

export function useAdminCustomers(params: { search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...adminKeys.customers, params] as const,
    queryFn: () => listAdminCustomers(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: adminKeys.customer(id),
    queryFn: () => getAdminCustomer(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useUpdateAdminCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: "ACTIVE" | "SUSPENDED" }) => updateAdminCustomer(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.customers });
      void queryClient.invalidateQueries({ queryKey: adminKeys.customer(id) });
    },
  });
}

export function useAdminOrders(params: { status?: string; search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...adminKeys.orders, params] as const,
    queryFn: () => listAdminOrders(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: adminKeys.order(id),
    queryFn: () => getAdminOrder(id),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useAdminProducts(params: { search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...adminKeys.products, params] as const,
    queryFn: () => listAdminProducts(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpdateAdminProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { isFeatured?: boolean; isActive?: boolean }) => updateAdminProduct(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.products });
    },
  });
}

export function useAdminPayouts(params: { status?: string } = {}) {
  return useQuery({
    queryKey: [...adminKeys.payouts, params] as const,
    queryFn: () => listAdminPayouts(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateAdminPayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAdminPayout>[0]) => createAdminPayout(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.payouts });
    },
  });
}

export function useUpdateAdminPayout(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: "PENDING" | "PROCESSING" | "PAID" | "FAILED" }) => updateAdminPayout(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.payouts });
    },
  });
}

export function useAdminCoupons() {
  return useQuery({
    queryKey: adminKeys.coupons,
    queryFn: listAdminCoupons,
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateAdminCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAdminCoupon>[0]) => createAdminCoupon(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.coupons });
    },
  });
}

export function useUpdateAdminCoupon(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateAdminCoupon>[1]) => updateAdminCoupon(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.coupons });
    },
  });
}

export function useDeleteAdminCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (couponId: string) => deleteAdminCoupon(couponId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.coupons });
    },
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: listAdminCategories,
    retry: false,
    staleTime: 60_000,
  });
}

export function useCreateAdminCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createAdminCategory>[0]) => createAdminCategory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.categories });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
    },
  });
}

export function useUpdateAdminCategory(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateAdminCategory>[1]) => updateAdminCategory(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.categories });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories });
    },
  });
}

// ── Super admin ─────────────────────────────────────────────────────────────

export const superAdminKeys = {
  admins: ["super-admins"] as const,
  settings: ["platform-settings"] as const,
  audit: ["audit-log"] as const,
  analytics: ["super-analytics"] as const,
};

export function useSuperAdmins(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...superAdminKeys.admins, params] as const,
    queryFn: () => listSuperAdmins(params),
    retry: false,
    staleTime: 30_000,
  });
}

export function useCreateSuperAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createSuperAdmin>[0]) => createSuperAdmin(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: superAdminKeys.admins });
    },
  });
}

export function useUpdateSuperAdmin(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateSuperAdmin>[1]) => updateSuperAdmin(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: superAdminKeys.admins });
    },
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: superAdminKeys.settings,
    queryFn: listPlatformSettings,
    retry: false,
    staleTime: 60_000,
  });
}

export function useUpdatePlatformSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: Record<string, unknown> }) =>
      updatePlatformSetting(key, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: superAdminKeys.settings });
    },
  });
}

export function useAuditLog(params: { action?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [...superAdminKeys.audit, params] as const,
    queryFn: () => listAuditLog(params),
    retry: false,
    staleTime: 15_000,
  });
}

export function useSuperAnalytics() {
  return useQuery({
    queryKey: superAdminKeys.analytics,
    queryFn: getSuperAnalytics,
    retry: false,
    staleTime: 60_000,
  });
}