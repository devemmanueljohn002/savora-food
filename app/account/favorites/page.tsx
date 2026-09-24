import { redirect } from "next/navigation";

export default function AccountFavoritesPage() {
  redirect("/dashboard?tab=favorites");
}
