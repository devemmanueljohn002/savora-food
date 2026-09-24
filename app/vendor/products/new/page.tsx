"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageShell from "@/components/PageShell";
import VendorNav from "@/components/VendorNav";
import ProductForm, { EMPTY_PRODUCT_FORM, productFormToInput, type ProductFormState } from "@/components/ProductForm";
import { VendorSignIn } from "@/components/VendorShell";
import { useCreateVendorProduct, useVendorProfile } from "@/lib/api/hooks";

export default function NewVendorProductPage() {
  const router = useRouter();
  const profile = useVendorProfile();
  const create = useCreateVendorProduct();
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [error, setError] = useState("");

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const product = await create.mutateAsync(productFormToInput(form));
      router.push(`/vendor/products/${product.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the product.");
    }
  }

  return (
    <PageShell>
      <section className="section container" style={{ maxWidth: 760 }}>
        <p>
          <Link href="/vendor/products">← All products</Link>
        </p>
        <h1 style={{ marginTop: 0 }}>Add product</h1>
        <p className="section-sub">It appears in the marketplace immediately while visible and active.</p>
        <VendorNav />
        <ProductForm
          form={form}
          setForm={setForm}
          onSubmit={submit}
          busy={create.isPending}
          error={error}
          submitLabel="Create product"
        />
      </section>
    </PageShell>
  );
}
