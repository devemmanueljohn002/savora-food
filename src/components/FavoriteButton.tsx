"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

export default function FavoriteButton({ label = "Add to favorites" }: { label?: string }) {
  const [saved, setSaved] = useState(false);

  return (
    <button
      type="button"
      className={`fav-btn${saved ? " saved" : ""}`}
      aria-label={saved ? "Remove from favorites" : label}
      aria-pressed={saved}
      onClick={() => setSaved((value) => !value)}
    >
      <Heart className="fav-ico" aria-hidden="true" />
    </button>
  );
}
