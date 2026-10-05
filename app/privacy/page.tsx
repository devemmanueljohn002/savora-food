import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: false, follow: true },
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function Page() {
  return <main className="page-shell"><h1>privacy</h1><p>Production route scaffold. Connect this page to the relevant service and UI components.</p></main>
}
