import { NextResponse } from "next/server";
import {
  queryFundingAggregate,
  queryFundingLeaderboard,
  type FundingView,
} from "@/lib/server/db";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=300, stale-while-revalidate=86400";

function coerceView(v: string | null): FundingView {
  return v === "awarded" ? "awarded" : "received";
}

// GET /api/funding?view=awarded            → { countries, coverage } (bubbles + hero)
// GET /api/funding?view=awarded&scope=NO   → { entities }            (leaderboard)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = coerceView(searchParams.get("view"));
  const scope = searchParams.get("scope");

  if (scope) {
    const entities = await queryFundingLeaderboard(view, scope);
    return NextResponse.json(
      { entities },
      { headers: { "cache-control": CACHE } },
    );
  }

  const data = await queryFundingAggregate(view);
  return NextResponse.json(data, { headers: { "cache-control": CACHE } });
}
