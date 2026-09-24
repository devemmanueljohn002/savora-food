import { NextResponse } from "next/server";
import { ok, toEnvelope } from "@/server/errors";
import { listCategories } from "@/server/queries/catalog";

export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json(ok(categories, { count: categories.length }));
  } catch (error) {
    const { envelope, status } = toEnvelope(error);
    return NextResponse.json(envelope, { status });
  }
}