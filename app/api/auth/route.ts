import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    name: "savora-auth",
    endpoints: ["register", "login", "logout", "me", "refresh", "forgot-password", "reset-password"],
  });
}