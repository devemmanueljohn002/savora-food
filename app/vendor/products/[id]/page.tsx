"use client";

import { FormEvent, use, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import ProductForm, { productFormToInput, type ProductFormState } from "@/components/ProductForm";
import { VendorSignIn, naira } from "@/components/VendorShell";
import {
  useCreateProductVariant,
  useDeleteProductVariant,
  useDeleteVendorProduct,
  useUpdateProductVariant,
  useUpdateVendorProduct,
  useVendorProduct,
  useVendorProfile,
} from "@/lib/api/hooks";
import { useRouter } from "next/navigation";

function VariantManager({ productId }: { productId: string }) {
  const product = useVendorProduct(productId);
  const create = useCreateProductVariant(productId);
  const update = useUpdateProductVariant(productId);
  const remove = useDeleteProductVariant(productId);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await create.mutateAsync({
        name: name.trim(),
        ...(price.trim() ? { price: Number(price) } : {}),
        stockQuantity: Number.parseInt(stock, 10) || 0,
      });
      setName("");
      setPrice("");
      setStock("0");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add the variant.");
    }
  }

  return (
    <div className="card card-body" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Variants ({product.data?.variants.length ?? 0})</h3>
      <p className="muted">Sizes and options with their own price or stock, e.g. Regular / Large.</p>
      {(product.data?.variants ?? []).map((variant) => (
        <div className="row" key={variant.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <div>
            <strong>{variant.name}</strong>
            <p className="muted" style={{ margin: "2px 0 0" }}>
              {variant.price === null ? "Same as product price" : naira(variant.price)} · Stock: {variant.stockQuantity}
            </p>
          </div>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              min={0}
              className="input"
              style={{ width: 90 }}
              aria-label={`${variant.name} stock`}
              defaultValue={variant.stockQuantity}
              onBlur={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(next) && next !== variant.stockQuantity) {
                  update.mutate({ variantId: variant.id, input: { stockQuantity: next } });
                }
              }}
            />
            <button
              className="btn secondary btn-sm"
              type="button"
              onClick={() => update.mutate({ variantId: variant.id, input: { isActive: !variant.isActive } })}
            >
              {variant.isActive ? "Hide" : "Show"}
            </button>
            <button className="btn danger btn-sm" type="button" onClick={() => remove.mutate(variant.id)}>
              Delete
            </button>
          </span>
        </div>
      ))}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="row">
          <input
            className="input"
            required
            placeholder="Variant name (e.g. Large)"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            placeholder="Price override (optional)"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            placeholder="Stock"
            value={stock}
            onChange={(event) => setStock(event.target.value)}
          />
          <button className="btn btn-sm" disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add variant"}
          </button>
        </div>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

function Editor({ productId }: { productId: string }) {
  const router = useRouter();
  const product = useVendorProduct(productId);
  const update = useUpdateVendorProduct(productId);
  const remove = useDeleteVendorProduct();
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const data = product.data;
  const activeForm: ProductFormState | null =
    form ??
    (data
      ? {
          name: data.name,
          price: String(data.price),
          compareAtPrice: data.compareAtPrice === null ? "" : String(data.compareAtPrice),
          costPrice: data.costPrice === null ? "" : String(data.costPrice),
          shortDescription: data.shortDescription ?? "",
          description: data.description ?? "",
          ingredients: data.ingredients.join(", "),
          prepInfo: data.prepInfo ?? "",
          preparationMinutes: data.preparationMinutes === null ? "" : String(data.preparationMinutes),
          stockQuantity: String(data.stockQuantity),
          imageUrl: data.imageUrl ?? "",
          productType: data.productType ?? "",
          categoryId: data.categoryId ?? "",
          availability: data.availability,
          isActive: data.isActive,
        }
      : null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeForm) return;
    setError("");
    setSaved(false);
    try {
      await update.mutateAsync(productFormToInput(activeForm));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the product.");
    }
  }

  async function onDelete() {
    if (!data || !window.confirm(`Delete “${data.name}”? Products with order history are deactivated instead.`)) return;
    try {
      await remove.mutateAsync(productId);
      router.push("/vendor/products");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the product.");
    }
  }

  if (product.isLoading) return <p className="muted">Loading product…</p>;
  if (product.isError || !data || !activeForm) {
    return (
      <>
        <p className="auth-error">Product not found.</p>
        <Link className="btn secondary" href="/vendor/products">Back to products</Link>
      </>
    );
  }

  return (
    <>
      <div className="row">
        <p className="muted" style={{ margin: 0 }}>
          ★ {data.ratingAverage.toFixed(1)} ({data.ratingCount} reviews)
        </p>
        <button className="btn danger btn-sm" type="button" onClick={onDelete}>
          Delete product
        </button>
      </div>
      {saved && (
        <p className="auth-success" role="status">
          Product saved.
        </p>
      )}
      <ProductForm
        form={activeForm}
        setForm={setForm}
        onSubmit={submit}
        busy={update.isPending}
        error={error}
        submitLabel="Save changes"
      />
      <VariantManager productId={productId} />
    </>
  );
}

export default function EditVendorProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const profile = useVendorProfile();

  if (profile.isLoading) {
    return (
      <PageShell>
        <section className="section container">
          <p className="muted">Loading…</p>
        </section>
      </PageShell>
    );
  }
  if (profile.isError || !profile.data) return <VendorSignIn />;

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 760 }}>
        <p>
          <Link href="/vendor/products">← All products</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Edit product</h1>
        <VendorNav />
        <Editor productId={id} />
      </section>
    </PageShell>
  );
}
