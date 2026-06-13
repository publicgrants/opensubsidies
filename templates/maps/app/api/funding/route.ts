import { NextResponse } from "next/server";
import {
  queryFundingAggregate,
  queryFundingLeaderboard,
  queryFundingSubdivisions,
  type FundingView,
} from "@/lib/server/db";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=300, stale-while-revalidate=86400";

function coerceView(v: string | null): FundingView {
  return v === "awarded" ? "awarded" : "received";
}

const LEVELS = new Set(["fylke", "kommune", "city"]);

// GET /api/funding?view=awarded                       → { countries, coverage }   (bubbles + hero)
// GET /api/funding?view=received&scope=NO&level=fylke → { subdivisions }           (Fylke choropleth)
// GET /api/funding?view=received&scope=NO/Innovasjon&level=fylke → per-provider choropleth
// GET /api/funding?view=awarded&scope=NO              → { entities }               (leaderboard)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = coerceView(searchParams.get("view"));
  const scope = searchParams.get("scope");
  const levelParam = searchParams.get("level");

  if (scope && levelParam) {
    const level = LEVELS.has(levelParam) ? levelParam : "fylke";
    const subdivisions = await queryFundingSubdivisions(view, scope, level);
    return NextResponse.json(
      { subdivisions },
      { headers: { "cache-control": CACHE } },
    );
  }

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
