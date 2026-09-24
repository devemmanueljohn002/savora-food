import { NextResponse } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { listLocations } from "@/server/queries/catalog";

export async function GET() {
  try {
    const locations = await listLocations();
    return NextResponse.json(ok(locations, { count: locations.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}