"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAddCartItem } from "@/lib/api/hooks";

type Props = {
  productId: string;
  quantity?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
};

export default function AddToCart({ productId, quantity = 1, label = "Add to cart", className = "btn", style, icon }: Props) {
  const router = useRouter();
  const add = useAddCartItem();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setError("");
    try {
      await add.mutateAsync({ productId, quantity });
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1800);
    } catch (reason) {
      const status = typeof reason === "object" && reason !== null && "status" in reason ? (reason as { status?: number }).status : undefined;
      if (status === 401) {
        router.push("/login");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Could not add to cart.");
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        onClick={handleClick}
        disabled={add.isPending}
      >
        {icon}
        {add.isPending ? "Adding…" : added ? "Added ✓" : label}
      </button>
      {error ? (
        <p className="muted" role="alert" style={{ fontSize: 13, margin: "6px 0 0" }}>
          {error}
        </p>
      ) : null}
    </>
  );
}