import { redirect } from "next/navigation";

/**
 * Admin area entry point. Post-login, an ADMIN is sent to /admin; the admin
 * layout already enforces the server-side role check, so reaching this page
 * means the visitor is an admin. Send them to the dashboard.
 */
export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
