"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";

type Tab = "vendor" | "rider";

type VendorForm = {
  name: string;
  business: string;
  phone: string;
  email: string;
  city: string;
  food: string;
};

type RiderForm = {
  name: string;
  phone: string;
  email: string;
  city: string;
  vehicle: string;
};

const EMPTY_VENDOR: VendorForm = { name: "", business: "", phone: "", email: "", city: "", food: "" };
const EMPTY_RIDER: RiderForm = { name: "", phone: "", email: "", city: "", vehicle: "" };

export default function PartnerApply() {
  const [tab, setTab] = useState<Tab>("vendor");
  const [vendor, setVendor] = useState<VendorForm>(EMPTY_VENDOR);
  const [rider, setRider] = useState<RiderForm>(EMPTY_RIDER);
  const [done, setDone] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(tab === "vendor" ? "vendor" : "rider");
  }

  return (
    <div className="part-apply">
      <div className="part-tabs" role="tablist" aria-orientation="horizontal">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "vendor"}
          className={tab === "vendor" ? "selected" : undefined}
          onClick={() => {
            setTab("vendor");
            setDone(null);
          }}
        >
          Vendor
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "rider"}
          className={tab === "rider" ? "selected" : undefined}
          onClick={() => {
            setTab("rider");
            setDone(null);
          }}
        >
          Rider
        </button>
      </div>

      {done ? (
        <div className="part-done">
          <CheckCircle2 className="part-done-ico" aria-hidden="true" />
          <h3>Application received</h3>
          <p>
            Thanks, {tab === "vendor" ? vendor.name.split(" ")[0] || "there" : rider.name.split(" ")[0] || "there"}!
            Our team will review your {tab} application and reach out by email within 2&ndash;3 business days.
          </p>
          <button onClick={() => setDone(null)}>Submit another application</button>
        </div>
      ) : tab === "vendor" ? (
        <form className="part-form" onSubmit={submit}>
          <div className="part-grid">
            <div className="part-field">
              <label htmlFor="vendor-name">Full name</label>
              <input id="vendor-name" name="name" required value={vendor.name} onChange={(event) => setVendor({ ...vendor, name: event.target.value })} />
            </div>
            <div className="part-field">
              <label htmlFor="vendor-business">Business name</label>
              <input id="vendor-business" name="business" required value={vendor.business} onChange={(event) => setVendor({ ...vendor, business: event.target.value })} />
            </div>
          </div>
          <div className="part-grid">
            <div className="part-field">
              <label htmlFor="vendor-phone">Phone number</label>
              <input id="vendor-phone" name="phone" type="tel" placeholder="0803 000 0000" required value={vendor.phone} onChange={(event) => setVendor({ ...vendor, phone: event.target.value })} />
            </div>
            <div className="part-field">
              <label htmlFor="vendor-email">Email</label>
              <input id="vendor-email" name="email" type="email" required value={vendor.email} onChange={(event) => setVendor({ ...vendor, email: event.target.value })} />
            </div>
          </div>
          <div className="part-field">
            <label htmlFor="vendor-city">City</label>
            <input id="vendor-city" name="city" required value={vendor.city} onChange={(event) => setVendor({ ...vendor, city: event.target.value })} />
          </div>
          <div className="part-field">
            <label htmlFor="vendor-food">What do you cook or bake?</label>
            <textarea id="vendor-food" name="food" rows={3} required value={vendor.food} onChange={(event) => setVendor({ ...vendor, food: event.target.value })} />
          </div>
          <button className="btn part-submit" type="submit">
            Submit application
          </button>
        </form>
      ) : (
        <form className="part-form" onSubmit={submit}>
          <div className="part-field">
            <label htmlFor="rider-name">Full name</label>
            <input id="rider-name" name="name" required value={rider.name} onChange={(event) => setRider({ ...rider, name: event.target.value })} />
          </div>
          <div className="part-grid">
            <div className="part-field">
              <label htmlFor="rider-phone">Phone number</label>
              <input id="rider-phone" name="phone" type="tel" placeholder="0803 000 0000" required value={rider.phone} onChange={(event) => setRider({ ...rider, phone: event.target.value })} />
            </div>
            <div className="part-field">
              <label htmlFor="rider-email">Email</label>
              <input id="rider-email" name="email" type="email" required value={rider.email} onChange={(event) => setRider({ ...rider, email: event.target.value })} />
            </div>
          </div>
          <div className="part-field">
            <label htmlFor="rider-city">City</label>
            <input id="rider-city" name="city" required value={rider.city} onChange={(event) => setRider({ ...rider, city: event.target.value })} />
          </div>
          <div className="part-field">
            <label htmlFor="rider-vehicle">Do you have a motorbike or bicycle?</label>
            <select id="rider-vehicle" name="vehicle" required value={rider.vehicle} onChange={(event) => setRider({ ...rider, vehicle: event.target.value })}>
              <option value="" disabled>
                Select one
              </option>
              <option value="Motorbike">Motorbike</option>
              <option value="Bicycle">Bicycle</option>
              <option value="Both">Both</option>
            </select>
          </div>
          <button className="btn part-submit" type="submit">
            Submit application
          </button>
        </form>
      )}
    </div>
  );
}