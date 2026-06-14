import { NextResponse } from "next/server";
import { queryAggregate } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  const data = await queryAggregate(Date.now());
  // Server-Timing surfaces the D1 cost in devtools (observability is on in
  // wrangler.jsonc) so the aggregate latency is measurable warm vs cold.
  return NextResponse.json(data, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
      "server-timing": `db;dur=${Date.now() - t0}`,
    },
  });
}
