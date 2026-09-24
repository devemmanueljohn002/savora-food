"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

export default function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <form className="hdr-search-form" onSubmit={submit} role="search">
      <Search className="hdr-search-icon" aria-hidden="true" />
      <input
        className="hdr-search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search meals, cakes, vendors…"
        aria-label="Search Savora Food"
      />
    </form>
  );
}
