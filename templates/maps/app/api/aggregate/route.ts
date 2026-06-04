import { NextResponse } from "next/server";
import { queryAggregate } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await queryAggregate(Date.now());
  return NextResponse.json(data, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
