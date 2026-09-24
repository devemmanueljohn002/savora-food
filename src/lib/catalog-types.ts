export type ProductType = "FOOD" | "CAKE" | "SNACK" | "DRINK" | "CATERING";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  image: string | null;
  productType: ProductType | null;
  rating: number;
  ratingCount: number;
  isFeatured: boolean;
  availability: boolean;
  stockQuantity: number;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorCity: string | null;
  vendorState: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

export type ProductDetail = CatalogProduct & {
  ingredients: string[];
  prepInfo: string | null;
  images: string[];
  createdAt: string;
  reviews?: ProductReview[];
};

export type CatalogVendor = {
  id: string;
  slug: string;
  name: string;
  ownerName: string;
  description: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  logoUrl: string | null;
  bannerImageUrl: string | null;
  rating: number;
  ratingCount: number;
  isFeatured: boolean;
  categories: string[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
};

export type CatalogLocation = {
  id: string;
  name: string;
  state: string;
  city: string | null;
  deliveryFee: number;
  deliveryTimeMinutes: number;
};

export type CateringPackage = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  pricePerGuest: number;
  minimumGuests: number;
  includedServices: string[];
  eventTypes: string[];
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  vendorCity: string | null;
};

export type ProductReview = {
  id: string;
  rating: number;
  comment: string | null;
  images: string[];
  createdAt: string;
  userId: string;
  userName: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ProductSort = "newest" | "rating" | "popular" | "price_asc" | "price_desc";
export type VendorSort = "rating" | "popular" | "name";

export type ListProductsInput = {
  type?: ProductType;
  category?: string;
  vendorId?: string;
  city?: string;
  search?: string;
  sort?: ProductSort;
  page?: number;
  limit?: number;
  featured?: boolean;
  maxPrice?: number;
  minRating?: number;
};

export type ProductTypeFacets = {
  vendors: CatalogVendor[];
  categories: CatalogCategory[];
  maxPrice: number;
};

export type ListVendorsInput = {
  city?: string;
  category?: string;
  search?: string;
  sort?: VendorSort;
  featured?: boolean;
  page?: number;
  limit?: number;
};