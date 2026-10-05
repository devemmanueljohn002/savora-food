import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: false, follow: true },
  alternates: { canonical: absoluteUrl("/terms") },
};

export default function Page() {
  return <main className="page-shell"><h1>terms</h1><p>Production route scaffold. Connect this page to the relevant service and UI components.</p></main>
}
