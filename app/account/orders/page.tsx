import { redirect } from "next/navigation";

export default function AccountOrdersPage() {
  redirect("/dashboard?tab=orders");
}
