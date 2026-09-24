"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Send, Users } from "lucide-react";
import type { CateringPackage } from "@/lib/catalog-types";
import { createCateringRequest } from "@/lib/savora-api";

const EVENT_TYPES = [
  "Wedding",
  "Birthday",
  "Corporate Event",
  "Conference",
  "Religious Event",
  "Party",
  "Funeral",
  "Private Event",
];

type QuoteForm = {
  name: string;
  phone: string;
  email: string;
  eventType: string;
  eventDate: string;
  location: string;
  guests: string;
  requirements: string;
};

export default function CateringMarketplace({ packages }: { packages: CateringPackage[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CateringPackage | null>(packages[0] ?? null);
  const [form, setForm] = useState<QuoteForm>({
    name: "",
    phone: "",
    email: "",
    eventType: EVENT_TYPES[0],
    eventDate: "",
    location: "",
    guests: "50",
    requirements: "",
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const guestCount = Math.max(0, Number.parseInt(form.guests, 10) || 0);
  const estimate = selected ? guestCount * selected.pricePerGuest : 0;

  function setValue(key: keyof QuoteForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPackage(pack: CateringPackage) {
    setSelected(pack);
    setSubmitted(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const required: [keyof QuoteForm, string][] = [
      ["name", "Full name is required."],
      ["phone", "Phone number is required."],
      ["email", "Email is required."],
      ["eventDate", "Event date is required."],
      ["location", "Event location is required."],
    ];
    for (const [key, message] of required) {
      if (!form[key].trim()) {
        setError(message);
        return;
      }
    }
    if (guestCount < 1) {
      setError("Number of guests must be at least 1.");
      return;
    }
    if (!selected) {
      setError("Choose a catering package first.");
      return;
    }
    setBusy(true);
    try {
      await createCateringRequest({
        packageId: selected.id,
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        eventType: form.eventType,
        eventDate: form.eventDate,
        eventLocation: form.location.trim(),
        guestCount,
        ...(form.requirements.trim() ? { specialRequirements: form.requirements.trim() } : {}),
      });
      setSubmitted(true);
    } catch (reason) {
      const status =
        typeof reason === "object" && reason !== null && "status" in reason
          ? (reason as { status?: number }).status
          : undefined;
      if (status === 401) {
        router.push("/login?next=/catering");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cat-layout">
      <div>
        <div className="cat-packages">
          <h2>Catering packages</h2>
          <div className="cat-grid">
            {packages.map((pack) => (
              <button
                type="button"
                className={`cat-card${selected?.id === pack.id ? " selected" : ""}`}
                key={pack.id}
                onClick={() => selectPackage(pack)}
              >
                <h3>{pack.title}</h3>
                <p className="cat-vendor">{pack.vendorName}</p>
                {pack.description ? <p className="cat-desc">{pack.description}</p> : null}
                <p className="cat-price">
                  <b>₦{pack.pricePerGuest.toLocaleString()}</b> per guest · min {pack.minimumGuests}
                </p>
                {pack.includedServices.length > 0 ? (
                  <ul className="cat-services">
                    {pack.includedServices.map((service) => (
                      <li key={service}>
                        <CircleCheck aria-hidden="true" /> {service}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {pack.eventTypes.length > 0 ? (
                  <div className="cat-tags">
                    {pack.eventTypes.map((eventType) => (
                      <span className="cat-tag" key={eventType}>
                        {eventType}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="cat-events">
          <h2>Events we cater</h2>
          <div className="cat-events-list">
            {EVENT_TYPES.map((eventType) => (
              <span className="cat-event-tag" key={eventType}>
                {eventType}
              </span>
            ))}
          </div>
        </div>
      </div>

      <aside className="cat-quote">
        <h2>Request a quote</h2>
        <p className="cat-quote-sub">
          {selected?.title}
          {selected ? " · " : ""}
          {selected?.vendorName}
        </p>

        {submitted ? (
          <div className="cat-done">
            <CircleCheck className="cat-done-ico" aria-hidden="true" />
            <h3>Booking request received</h3>
            <p>
              Thanks {form.name.trim().split(" ")[0] || "there"}! {selected?.vendorName} will review your event and
              confirm the final quote before any payment.
            </p>
            <p>
              <Link href="/dashboard?tab=catering">Track your request</Link>
            </p>
            <button type="button" onClick={() => setSubmitted(false)}>
              Submit another request
            </button>
          </div>
        ) : (
          <form className="cat-fields" onSubmit={submit}>
            <div className="cat-field">
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(event) => setValue("name", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                type="text"
                placeholder="0803 000 0000"
                value={form.phone}
                onChange={(event) => setValue("phone", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setValue("email", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="eventType">Event type</label>
              <select
                id="eventType"
                value={form.eventType}
                onChange={(event) => setValue("eventType", event.target.value)}
              >
                {EVENT_TYPES.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </select>
            </div>
            <div className="cat-field">
              <label htmlFor="eventDate">Event date</label>
              <input
                id="eventDate"
                type="date"
                value={form.eventDate}
                onChange={(event) => setValue("eventDate", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="location">Event location</label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(event) => setValue("location", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="guests">Number of guests</label>
              <input
                id="guests"
                type="number"
                min={1}
                value={form.guests}
                onChange={(event) => setValue("guests", event.target.value)}
              />
            </div>
            <div className="cat-field">
              <label htmlFor="requirements">Special requirements</label>
              <textarea
                id="requirements"
                maxLength={500}
                placeholder="Dietary needs, serving style, setup time."
                value={form.requirements}
                onChange={(event) => setValue("requirements", event.target.value)}
              />
            </div>

            {error && (
              <p className="cat-error" role="alert">
                {error}
              </p>
            )}

            <div className="cat-est">
              <div className="cat-est-row">
                <span className="cat-est-guests">
                  <Users aria-hidden="true" /> {guestCount} {guestCount === 1 ? "guest" : "guests"}
                </span>
                <b>₦{estimate.toLocaleString()}</b>
              </div>
              <p className="cat-est-note">Indicative estimate. The caterer confirms the final quote before payment.</p>
            </div>

            <button className="cat-submit" type="submit" disabled={busy}>
              <Send aria-hidden="true" /> {busy ? "Submitting…" : "Submit booking request"}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}