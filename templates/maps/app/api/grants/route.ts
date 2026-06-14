import { NextResponse } from "next/server";
import { queryGrants, queryGrantsHybrid, type GrantQuery } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const list = (k: string): string[] | undefined => {
    const v = sp.get(k);
    return v ? v.split(",").filter(Boolean) : undefined;
  };
  const num = (k: string): number | undefined => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined; // reject NaN → avoids LIMIT NaN
  };

  const query: GrantQuery = {
    country: sp.get("country") ?? undefined,
    instrumentTypes: list("instrument"),
    statuses: list("status"),
    funderTypes: list("funderType"),
    applicationMode: sp.get("mode") ?? undefined,
    fundingSize: sp.get("funding") ?? undefined,
    q: sp.get("q") ?? undefined,
    sortBy: sp.get("sort") ?? undefined,
    page: num("page"),
    pageSize: num("pageSize"),
  };

  try {
    // With a search term, run hybrid (semantic ⊕ keyword); otherwise plain
    // server-side filter/sort/paginate.
    const t0 = Date.now();
    const hybrid = Boolean(query.q && query.q.trim());
    const data = hybrid
      ? await queryGrantsHybrid(query, Date.now())
      : await queryGrants(query, Date.now());
    // Filtered results vary by query; don't edge-cache. Server-Timing tags the
    // path (hybrid search vs plain filter) and its DB+embedding cost.
    return NextResponse.json(data, {
      headers: {
        "cache-control": "no-store",
        "server-timing": `${hybrid ? "hybrid" : "query"};dur=${Date.now() - t0}`,
      },
    });
  } catch (e) {
    console.error("/api/grants failed", e);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
