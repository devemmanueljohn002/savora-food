import { describe, expect, it } from "vitest";

import {
  getAccountRouteForRole,
  getDashboardRouteForRole,
  getHomeRouteForRole,
  getOrdersRouteForRole,
  usesConsumerTabs,
} from "@/lib/role-routes";

describe("role route helpers (single source of truth)", () => {
  it("maps every role to its own home (never another role's page)", () => {
    expect(getHomeRouteForRole("CUSTOMER")).toBe("/");
    expect(getHomeRouteForRole("VENDOR")).toBe("/vendor/dashboard");
    expect(getHomeRouteForRole("DELIVERY_PARTNER")).toBe("/rider/dashboard");
    expect(getHomeRouteForRole("ADMIN")).toBe("/admin/dashboard");
    expect(getHomeRouteForRole("SUPER_ADMIN")).toBe("/super-admin/dashboard");
    expect(getHomeRouteForRole(undefined)).toBe("/");
    expect(getHomeRouteForRole("SOMETHING_ELSE")).toBe("/");
  });

  it("sends Account taps to the dashboard overview for customers, dashboards for staff", () => {
    expect(getAccountRouteForRole(undefined)).toBe("/auth");
    expect(getAccountRouteForRole("CUSTOMER")).toBe("/dashboard");
    expect(getAccountRouteForRole("VENDOR")).toBe("/vendor/dashboard");
    expect(getAccountRouteForRole("DELIVERY_PARTNER")).toBe("/rider/dashboard");
    expect(getAccountRouteForRole("ADMIN")).toBe("/admin/dashboard");
  });

  it("resolves the working dashboard per role", () => {
    expect(getDashboardRouteForRole("CUSTOMER")).toBe("/dashboard");
    expect(getDashboardRouteForRole("VENDOR")).toBe("/vendor/dashboard");
    expect(getDashboardRouteForRole("DELIVERY_PARTNER")).toBe("/rider/dashboard");
  });

  it("shows consumer tabs to shoppers/admins, hides cart/saved for vendors/riders", () => {
    expect(usesConsumerTabs(undefined)).toBe(true);
    expect(usesConsumerTabs("CUSTOMER")).toBe(true);
    expect(usesConsumerTabs("ADMIN")).toBe(true);
    expect(usesConsumerTabs("VENDOR")).toBe(false);
    expect(usesConsumerTabs("DELIVERY_PARTNER")).toBe(false);
  });

  it("routes order shortcuts per role", () => {
    expect(getOrdersRouteForRole("CUSTOMER")).toBe("/dashboard?tab=orders");
    expect(getOrdersRouteForRole("VENDOR")).toBe("/vendor/orders");
    expect(getOrdersRouteForRole("DELIVERY_PARTNER")).toBe("/rider/dashboard");
    expect(getOrdersRouteForRole(undefined)).toBe("/dashboard?tab=orders");
  });
});
