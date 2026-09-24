"use client";

import { useCart } from "@/lib/api/hooks";

export default function CartCount() {
  const { data } = useCart();
  if (!data || data.itemCount === 0) return null;
  return <span className="hdr-badge">{data.itemCount}</span>;
}
