"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductForm, { EMPTY_PRODUCT_FORM, productFormToInput, type ProductFormState } from "@/components/ProductForm";
import { VendorShell, VendorSignIn } from "@/components/VendorShell";
import { useCreateVendorProduct, useVendorProfile } from "@/lib/api/hooks";

export default function NewVendorProductPage() {
  const router = useRouter();
  const profile = useVendorProfile();
  const create = useCreateVendorProduct();
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [error, setError] = useState("");

  if (profile.isLoading) {
    return (
      <div className="vendor-shell">
        <div className="vendor-body">
          <main className="vendor-main">
            <p className="muted">Loading…</p>
          </main>
        </div>
      </div>
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
    <VendorShell
      profile={profile.data}
      title="Add product"
      sub="It appears in the marketplace immediately while visible and active."
    >
      <div style={{ maxWidth: 760 }}>
        <p>
          <Link href="/vendor/products">← All products</Link>
        </p>
        <ProductForm
          form={form}
          setForm={setForm}
          onSubmit={submit}
          busy={create.isPending}
          error={error}
          submitLabel="Create product"
        />
      </div>
    </VendorShell>
  );
}
