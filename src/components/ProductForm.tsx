"use client";

import { FormEvent } from "react";
import ImageUploader from "@/components/ImageUploader";
import { useCategories } from "@/lib/api/hooks";
import type { VendorProductInput } from "@/lib/savora-api";

export type ProductFormState = {
  name: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  shortDescription: string;
  description: string;
  ingredients: string;
  prepInfo: string;
  preparationMinutes: string;
  stockQuantity: string;
  imageUrl: string;
  productType: string;
  categoryId: string;
  availability: boolean;
  isActive: boolean;
};

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: "",
  price: "",
  compareAtPrice: "",
  costPrice: "",
  shortDescription: "",
  description: "",
  ingredients: "",
  prepInfo: "",
  preparationMinutes: "",
  stockQuantity: "0",
  imageUrl: "",
  productType: "",
  categoryId: "",
  availability: true,
  isActive: true,
};

const TYPES = ["FOOD", "CAKE", "SNACK", "DRINK", "CATERING"];

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function productFormToInput(form: ProductFormState): VendorProductInput {
  const price = toNumber(form.price) ?? 0;
  return {
    name: form.name.trim(),
    price,
    ...(toNumber(form.compareAtPrice) !== undefined ? { compareAtPrice: toNumber(form.compareAtPrice) ?? null } : {}),
    ...(toNumber(form.costPrice) !== undefined ? { costPrice: toNumber(form.costPrice) ?? null } : {}),
    ...(form.shortDescription.trim() ? { shortDescription: form.shortDescription.trim() } : {}),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(form.ingredients.trim()
      ? { ingredients: form.ingredients.split(",").map((part) => part.trim()).filter(Boolean) }
      : {}),
    ...(form.prepInfo.trim() ? { prepInfo: form.prepInfo.trim() } : {}),
    ...(toInt(form.preparationMinutes) !== undefined ? { preparationMinutes: toInt(form.preparationMinutes) ?? null } : {}),
    ...(toInt(form.stockQuantity) !== undefined ? { stockQuantity: toInt(form.stockQuantity) } : {}),
    ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    ...(form.productType ? { productType: form.productType as VendorProductInput["productType"] } : {}),
    ...(form.categoryId ? { categoryId: form.categoryId } : {}),
    availability: form.availability,
    isActive: form.isActive,
  };
}

export default function ProductForm({ form, setForm, onSubmit, busy, error, submitLabel }: {
  form: ProductFormState;
  setForm: (form: ProductFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
  submitLabel: string;
}) {
  const categories = useCategories();
  const set = (patch: Partial<ProductFormState>) => setForm({ ...form, ...patch });

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <label>
        Product name
        <input required value={form.name} onChange={(event) => set({ name: event.target.value })} />
      </label>
      <div className="two-col">
        <label>
          Price (₦)
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(event) => set({ price: event.target.value })}
          />
        </label>
        <label>
          Compare-at price (₦) <span className="field-optional">(optional)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.compareAtPrice}
            onChange={(event) => set({ compareAtPrice: event.target.value })}
          />
        </label>
      </div>
      <div className="two-col">
        <label>
          Cost price (₦) <span className="field-optional">(optional, private)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.costPrice}
            onChange={(event) => set({ costPrice: event.target.value })}
          />
        </label>
        <label>
          Stock quantity
          <input
            type="number"
            min={0}
            step={1}
            value={form.stockQuantity}
            onChange={(event) => set({ stockQuantity: event.target.value })}
          />
        </label>
      </div>
      <div className="two-col">
        <label>
          Type
          <select value={form.productType} onChange={(event) => set({ productType: event.target.value })}>
            <option value="">Unspecified</option>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={form.categoryId} onChange={(event) => set({ categoryId: event.target.value })}>
            <option value="">Unspecified</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Short description
        <input value={form.shortDescription} onChange={(event) => set({ shortDescription: event.target.value })} />
      </label>
      <label>
        Description
        <textarea value={form.description} onChange={(event) => set({ description: event.target.value })} />
      </label>
      <label>
        Ingredients <span className="field-optional">(comma separated)</span>
        <input value={form.ingredients} onChange={(event) => set({ ingredients: event.target.value })} />
      </label>
      <div className="two-col">
        <label>
          Preparation info
          <input value={form.prepInfo} onChange={(event) => set({ prepInfo: event.target.value })} />
        </label>
        <label>
          Preparation minutes
          <input
            type="number"
            min={0}
            step={1}
            value={form.preparationMinutes}
            onChange={(event) => set({ preparationMinutes: event.target.value })}
          />
        </label>
      </div>
      <ImageUploader
        label="Product image"
        value={form.imageUrl || null}
        onChange={(url) => set({ imageUrl: url ?? "" })}
      />
      <span style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={form.availability}
            onChange={(event) => set({ availability: event.target.checked })}
          />
          Available for order
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
          Visible in marketplace
        </label>
      </span>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy} style={{ marginTop: 12 }}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
