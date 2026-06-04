import { NextResponse } from "next/server";
import { queryCatalog } from "@/lib/server/db";

// Reads the D1 binding at request time — must be dynamic (no SSG).
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await queryCatalog();
  return NextResponse.json(data, {
    headers: {
      // Data refreshes via the rebuild pipeline; short edge cache is plenty.
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
