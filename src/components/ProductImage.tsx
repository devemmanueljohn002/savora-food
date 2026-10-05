"use client";

import { useState } from "react";
import Image from "next/image";

export const PRODUCT_IMAGE_FALLBACK =
  "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80";

/** Same-origin Savora placeholder shown when a product image fails to load. */
export const PRODUCT_PLACEHOLDER = "/product-placeholder.svg";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
};

export function resolveProductImageSrc(src: string | null | undefined, failed: boolean): string {
  if (failed) return PRODUCT_PLACEHOLDER;
  return src?.trim() ? src : PRODUCT_IMAGE_FALLBACK;
}

/**
 * Product image with graceful degradation: null/empty URLs render the
 * shared fallback, and any URL that 404s (e.g. a stale local `/uploads/…`
 * path) swaps to the Savora placeholder instead of a broken-image icon.
 */
export default function ProductImage({ src, alt, className, width, height, priority, sizes }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      src={resolveProductImageSrc(src, failed)}
      alt={failed && src?.trim() ? `${alt} (image unavailable)` : alt}
      className={className}
      width={width}
      height={height}
      priority={priority}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
