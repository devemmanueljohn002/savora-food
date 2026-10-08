"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type BankOption = {
  name: string;
  code: string;
  slug?: string;
};

/**
 * Last-resort offline list, used ONLY when the Paystack fetch fails — the live
 * endpoint returns the full sorted list. Real NUBAN/Paystack codes, including
 * fintechs and microfinance banks (same codes Paystack returns).
 */
export const FALLBACK_BANKS: BankOption[] = [
  { name: "9mobile 9Payment Service Bank", code: "120001" },
  { name: "Abbey Mortgage Bank", code: "801" },
  { name: "Access Bank", code: "044" },
  { name: "Airtel Smartcash PSB", code: "120004" },
  { name: "ALAT by WEMA", code: "035A" },
  { name: "Carbon", code: "565" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Coronation Merchant Bank", code: "559" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Eyowo", code: "50126" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "FSDH Merchant Bank", code: "501" },
  { name: "Globus Bank", code: "00103" },
  { name: "GoMoney", code: "100022" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "HopePSB", code: "120002" },
  { name: "Jaiz Bank", code: "301" },
  { name: "Keystone Bank", code: "082" },
  { name: "Kuda Bank", code: "50211" },
  { name: "Lotus Bank", code: "303" },
  { name: "Mint MFB", code: "50304" },
  { name: "Moniepoint MFB", code: "50515" },
  { name: "MTN Momo PSB", code: "120003" },
  { name: "OPay Digital Services", code: "999992" },
  { name: "Paga", code: "100002" },
  { name: "PalmPay", code: "999991" },
  { name: "Parallex Bank", code: "104" },
  { name: "Polaris Bank", code: "076" },
  { name: "PremiumTrust Bank", code: "105" },
  { name: "Providus Bank", code: "101" },
  { name: "Rubies MFB", code: "125" },
  { name: "Sparkle Microfinance Bank", code: "51310" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "SunTrust Bank", code: "100" },
  { name: "TAJ Bank", code: "302" },
  { name: "Titan Bank", code: "102" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "VFD Microfinance Bank", code: "566" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" },
];

export type BankComboboxProps = {
  /** Banks from the server (Paystack). Falls back to FALLBACK_BANKS when empty. */
  banks?: BankOption[] | null;
  loading?: boolean;
  /** Fetch error message, if any — shown with a Retry button above the field. */
  error?: string | null;
  onRetry?: () => void;
  /** Selected bank code. */
  value: string;
  onChange: (code: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** When true the list came from the fallback — shown as a muted note. */
  showFallbackNote?: boolean;
};

/**
 * Searchable bank selector shared by affiliate signup and vendor/rider
 * payout forms. Code is the value, name is the label.
 */
export default function BankCombobox({
  banks,
  loading = false,
  error = null,
  onRetry,
  value,
  onChange,
  id,
  placeholder = "Select bank…",
  disabled = false,
  showFallbackNote = true,
}: BankComboboxProps) {
  const fallbackId = useId();
  const inputId = id ?? `bank-combobox-${fallbackId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const listId = `${inputId}-list`;
  const usingFallback = !banks || banks.length === 0;
  // Server already sorts A–Z; sort again defensively so filtering keeps order.
  const effective = useMemo(() => {
    const list = usingFallback ? FALLBACK_BANKS : (banks ?? []);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [usingFallback, banks]);
  const selected = effective.find((bank) => bank.code === value) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return effective;
    return effective.filter((bank) => bank.name.toLowerCase().includes(needle));
  }, [effective, query]);

  // Close when focus leaves the whole combobox (button + input + list).
  function handleBlur(event: React.FocusEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setQuery("");
    }
  }

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length));
    } else if (event.key === "Enter") {
      if (open && filtered[highlight]) {
        event.preventDefault();
        pick(filtered[highlight].code);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  // Keep the highlighted option visible while navigating with the keyboard.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-option-${highlight}`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, listId]);

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading banks">
        <div className="skeleton" style={{ height: 48, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 14, width: "45%", marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="bank-combo" onBlur={handleBlur}>
      {error ? (
        <div className="bank-combo-error" role="alert">
          <span>Couldn&apos;t load the full bank list{error ? `: ${error}` : "."} Showing major banks instead.</span>
          {onRetry ? (
            <button type="button" className="btn secondary btn-sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {selected && !open ? (
        <div className="bank-combo-selected">
          <span className="bank-combo-selected-name">{selected.name}</span>
          <button
            type="button"
            className="bank-combo-change"
            disabled={disabled}
            onClick={() => {
              setOpen(true);
              setQuery("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label={`Change bank (currently ${selected.name})`}
          >
            Change
          </button>
          <button
            type="button"
            className="bank-combo-clear"
            disabled={disabled}
            onClick={() => pick("")}
            aria-label="Clear selected bank"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="bank-combo-field">
          <input
            ref={inputRef}
            id={inputId}
            className="input"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder={selected ? selected.name : placeholder}
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
              setOpen(true);
              if (value) onChange("");
            }}
            onFocus={() => {
              setHighlight(0);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {open ? (
            <ul id={listId} role="listbox" aria-label="Banks" className="bank-combo-list">
              {filtered.length === 0 ? (
                <li className="bank-combo-empty">No bank found</li>
              ) : (
                filtered.map((bank, index) => (
                  <li key={bank.code} role="presentation">
                    <button
                      id={`${listId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={bank.code === value}
                      className={`bank-combo-option${index === highlight ? " highlighted" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(bank.code)}
                      onMouseEnter={() => setHighlight(index)}
                    >
                      {bank.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}

      {usingFallback && showFallbackNote && !loading ? (
        <p className="muted-small" style={{ margin: "6px 0 0" }}>
          Showing offline bank list — retry for the full live list.
        </p>
      ) : null}
    </div>
  );
}
