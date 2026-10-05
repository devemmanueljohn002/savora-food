import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

const DISALLOWED = [
  "/dashboard",
  "/cart",
  "/auth",
  "/track",
  "/api",
  "/account",
  "/checkout",
  "/orders",
  "/vendor/dashboard",
  "/vendor/orders",
  "/vendor/products",
  "/vendor/catering",
  "/vendor/payouts",
  "/vendor/profile",
  "/vendor/onboarding",
  "/rider",
  "/admin",
  "/super-admin",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/search",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
