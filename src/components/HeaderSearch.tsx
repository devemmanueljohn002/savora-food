"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

type Suggestion = {
  products: { id: string; name: string; slug: string }[];
  vendors: { id: string; name: string; slug: string }[];
};

const RECENT_KEY = "savora.recentSearches";
const DEBOUNCE_MS = 250;

function readRecent(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberRecent(term: string) {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const current = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([term, ...current.filter((item) => item !== term)].slice(0, 5)));
  } catch {
    // Private mode etc. — recent searches are a nicety, never an error.
  }
}

async function fetchSuggestions(term: string, signal: AbortSignal): Promise<Suggestion> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(term.slice(0, 120))}&limit=5`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return { products: [], vendors: [] };
  const payload = (await res.json()) as {
    data?: { products?: Suggestion["products"]; vendors?: Suggestion["vendors"] };
  };
  return { products: payload.data?.products ?? [], vendors: payload.data?.vendors ?? [] };
}

export default function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion>({ products: [], vendors: [] });
  const [recent] = useState<string[]>(() => readRecent());
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  function scheduleLookup(term: string) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setSuggestions({ products: [], vendors: [] });
      setOpen(false);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        setSuggestions(await fetchSuggestions(trimmed, controller.signal));
        setOpen(true);
      } catch (error) {
        if ((error as { name?: string })?.name !== "AbortError") setOpen(false);
      }
    }, DEBOUNCE_MS);
  }

  function go(term: string) {
    const trimmed = term.trim().slice(0, 120);
    if (trimmed) rememberRecent(trimmed);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    abortRef.current?.abort();
    setOpen(false);
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(query);
  }

  const showRecent = query.trim().length < 2 && recent.length > 0;
  const showSuggestions = suggestions.products.length > 0 || suggestions.vendors.length > 0;

  return (
    <form className="hdr-search-form" onSubmit={submit} role="search">
      <Search className="hdr-search-icon" aria-hidden="true" />
      <input
        className="hdr-search-input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          scheduleLookup(event.target.value);
        }}
        onFocus={() => {
          if (showRecent || showSuggestions) setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Search meals, cakes, vendors…"
        aria-label="Search Savora Food"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="header-search-suggestions"
        autoComplete="off"
      />
      {open && (showRecent || showSuggestions) ? (
        <div id="header-search-suggestions" role="listbox" aria-label="Search suggestions" className="hdr-suggest">
          {showRecent && !showSuggestions
            ? recent.map((term) => (
                <button key={term} type="button" role="option" aria-selected="false" onClick={() => go(term)}>
                  {term}
                </button>
              ))
            : null}
          {suggestions.products.map((item) => (
            <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => go(item.name)}>
              {item.name}
            </button>
          ))}
          {suggestions.vendors.map((item) => (
            <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => go(item.name)}>
              {item.name} · vendor
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
