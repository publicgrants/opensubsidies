// Server-only D1 access. Reached from route handlers via the Cloudflare
// binding exposed by @opennextjs/cloudflare. Returns raw rows; the client
// data layer (mock-data/catalog-loader) shapes them into Funder/Grant.

import { getCloudflareContext } from "@opennextjs/cloudflare";

function getDb() {
  return getCloudflareContext().env.DB;
}

export type FunderRow = {
  id: string;
  name: string;
  short_name: string;
  type: string;
  country: string;
  country_name: string;
  region: string;
  hq_city: string | null;
  website: string | null;
  favicon_url: string | null;
};

export type GrantRow = {
  id: string;
  funder_id: string;
  name: string;
  url: string | null;
  application_url: string | null;
  description: string | null;
  closes_at: string | null;
  opens_at: string | null;
  application_mode: string | null;
  currency: string | null;
  min_amount: number | null;
  max_amount: number | null;
  funding_rate_pct: number | null;
  total_budget: number | null;
  instrument_type: string | null;
  scheme_code: string | null;
  program: string | null;
  documents: string | null;
  source_updated_at: string | null;
  state: string | null;
};

export type GrantDetailRow = GrantRow & { prose: string | null };

const FUNDER_COLS =
  "id,name,short_name,type,country,country_name,region,hq_city,website,favicon_url";
const GRANT_LEAN_COLS =
  "id,funder_id,name,url,application_url,description,closes_at,opens_at,application_mode,currency,min_amount,max_amount,funding_rate_pct,total_budget,instrument_type,scheme_code,program,documents,source_updated_at,state";

// Whole-catalog bootstrap: every funder + every grant WITHOUT prose (the heavy
// field). Prose is fetched per-grant on demand via queryGrantById.
export async function queryCatalog(): Promise<{
  funders: FunderRow[];
  grants: GrantRow[];
}> {
  const db = getDb();
  const [funders, grants] = await Promise.all([
    db.prepare(`SELECT ${FUNDER_COLS} FROM funders`).all<FunderRow>(),
    db.prepare(`SELECT ${GRANT_LEAN_COLS} FROM grants`).all<GrantRow>(),
  ]);
  return { funders: funders.results, grants: grants.results };
}

export async function queryGrantById(
  id: string,
): Promise<GrantDetailRow | null> {
  const db = getDb();
  const row = await db
    .prepare(`SELECT ${GRANT_LEAN_COLS},prose FROM grants WHERE id = ?`)
    .bind(id)
    .first<GrantDetailRow>();
  return row ?? null;
}

// ── Server-side aggregate + paginated query (the 50k-scale path) ─────────────

export type AggregateFunderRow = FunderRow & {
  lat: number;
  lng: number;
  schemes: number;
};

export type Stats = {
  totalGrants: number;
  openNow: number;
  closingSoon: number;
  upcomingCount: number;
  countriesCovered: number;
  fundersIndexed: number;
};

// SQL status expression — mirrors catalog-loader.deriveStatus (closed first).
// ?1 = today (YYYY-MM-DD), ?2 = today+30d. ISO dates compare lexicographically.
const STATUS_CASE = `CASE
  WHEN closes_at IS NOT NULL AND closes_at < ?1 THEN 'closed'
  WHEN opens_at IS NOT NULL AND opens_at > ?1 THEN 'upcoming'
  WHEN closes_at IS NOT NULL AND closes_at <= ?2 THEN 'closing-soon'
  ELSE 'open'
END`;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function queryAggregate(
  now: number,
): Promise<{ funders: AggregateFunderRow[]; stats: Stats }> {
  const db = getDb();
  const today = isoDay(now);
  const soon = isoDay(now + 30 * 24 * 60 * 60 * 1000);

  const [funders, stats] = await Promise.all([
    // No ?1/?2 binds here — STATUS_CASE is intentionally not used in this query.
    db
      .prepare(
        `SELECT ${FUNDER_COLS}, f.lat, f.lng,
                (SELECT COUNT(*) FROM grants g WHERE g.funder_id = f.id) AS schemes
         FROM funders f`,
      )
      .all<AggregateFunderRow>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS totalGrants,
           SUM(CASE WHEN ${STATUS_CASE} IN ('open','closing-soon') THEN 1 ELSE 0 END) AS openNow,
           SUM(CASE WHEN ${STATUS_CASE} = 'closing-soon' THEN 1 ELSE 0 END) AS closingSoon,
           SUM(CASE WHEN ${STATUS_CASE} = 'upcoming' THEN 1 ELSE 0 END) AS upcomingCount,
           (SELECT COUNT(DISTINCT country) FROM funders) AS countriesCovered,
           (SELECT COUNT(*) FROM funders) AS fundersIndexed
         FROM grants`,
      )
      .bind(today, soon)
      .first<Stats>(),
  ]);

  return {
    funders: funders.results,
    stats: stats ?? {
      totalGrants: 0,
      openNow: 0,
      closingSoon: 0,
      upcomingCount: 0,
      countriesCovered: 0,
      fundersIndexed: 0,
    },
  };
}

export type GrantQuery = {
  country?: string; // ISO code or "all"
  instrumentTypes?: string[];
  statuses?: string[]; // open | closing-soon | upcoming | closed
  funderTypes?: string[];
  applicationMode?: string; // or "all"
  fundingSize?: string; // any | micro | small | mid | large | mega
  q?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
};

export type GrantListRow = GrantRow & {
  status: string;
  // funder display fields (denormalized via join) for pins/list without a
  // separate funder lookup
  f_short_name: string;
  f_name: string;
  f_type: string;
  f_country: string;
  f_country_name: string;
  f_hq_city: string | null;
  f_favicon_url: string | null;
  f_lat: number;
  f_lng: number;
};

const FUNDING_RANGES: Record<string, [number, number | null]> = {
  micro: [0, 100_000],
  small: [100_000, 500_000],
  mid: [500_000, 2_000_000],
  large: [2_000_000, 10_000_000],
  mega: [10_000_000, null],
};

// These run in the OUTER query (SELECT * FROM (base)), so columns are
// unqualified (no g./f. alias) and reference the base's output names.
const SORT_SQL: Record<string, string> = {
  "deadline-soonest":
    "(status_val = 'closed') ASC, COALESCE(closes_at,'9999-12-31') ASC",
  "funding-largest": "COALESCE(max_amount,0) DESC",
  newest: "(source_updated_at IS NULL) ASC, source_updated_at DESC",
  oldest: "(source_updated_at IS NULL) ASC, source_updated_at ASC",
  "alpha-az": "name COLLATE NOCASE ASC",
  "alpha-za": "name COLLATE NOCASE DESC",
};

export async function queryGrants(
  query: GrantQuery,
  now: number,
): Promise<{ grants: GrantListRow[]; total: number }> {
  const db = getDb();
  const today = isoDay(now);
  const soon = isoDay(now + 30 * 24 * 60 * 60 * 1000);

  // Build WHERE incrementally with positional binds. ?1/?2 are reserved for the
  // status CASE; subsequent filters use named-by-position binds appended after.
  const binds: unknown[] = [today, soon];
  const where: string[] = [];

  if (query.country && query.country !== "all") {
    binds.push(query.country);
    where.push(`f.country = ?${binds.length}`);
  }
  if (query.instrumentTypes?.length) {
    const ph = query.instrumentTypes.map((t) => {
      binds.push(t);
      return `?${binds.length}`;
    });
    where.push(`g.instrument_type IN (${ph.join(",")})`);
  }
  if (query.funderTypes?.length) {
    const ph = query.funderTypes.map((t) => {
      binds.push(t);
      return `?${binds.length}`;
    });
    where.push(`f.type IN (${ph.join(",")})`);
  }
  if (query.applicationMode && query.applicationMode !== "all") {
    binds.push(query.applicationMode);
    where.push(`g.application_mode = ?${binds.length}`);
  }
  if (query.fundingSize && query.fundingSize !== "any") {
    const range = FUNDING_RANGES[query.fundingSize];
    if (range) {
      // Unknown max_amount is excluded from specific buckets (matches client).
      binds.push(range[0]);
      where.push(`g.max_amount IS NOT NULL AND g.max_amount >= ?${binds.length}`);
      if (range[1] !== null) {
        binds.push(range[1]);
        where.push(`g.max_amount < ?${binds.length}`);
      }
    }
  }
  if (query.q && query.q.trim()) {
    // Hybrid keyword arm: FTS5 over name/description/scheme_code/program.
    binds.push(ftsQuery(query.q));
    where.push(
      `g.id IN (SELECT grant_id FROM grants_fts WHERE grants_fts MATCH ?${binds.length})`,
    );
  }

  // statuses filter references the computed status — wrap the base select.
  let statusFilter = "";
  if (query.statuses?.length) {
    const ph = query.statuses.map((s) => {
      binds.push(s);
      return `?${binds.length}`;
    });
    statusFilter = ` WHERE status_val IN (${ph.join(",")})`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const base = `
    SELECT ${GRANT_LEAN_COLS.split(",")
      .map((c) => `g.${c}`)
      .join(",")},
      ${STATUS_CASE} AS status_val,
      f.short_name AS f_short_name, f.name AS f_name, f.type AS f_type,
      f.country AS f_country, f.country_name AS f_country_name,
      f.hq_city AS f_hq_city, f.favicon_url AS f_favicon_url,
      f.lat AS f_lat, f.lng AS f_lng
    FROM grants g JOIN funders f ON f.id = g.funder_id
    ${whereSql}`;

  const sort = SORT_SQL[query.sortBy ?? "deadline-soonest"] ?? SORT_SQL["deadline-soonest"];
  const pageSize = Math.min(Math.max(query.pageSize ?? 200, 1), 1000);
  const page = Math.max(query.page ?? 0, 0);

  const listSql = `SELECT * FROM (${base})${statusFilter} ORDER BY ${sort} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
  const countSql = `SELECT COUNT(*) AS n FROM (${base})${statusFilter}`;

  const [list, count] = await Promise.all([
    db.prepare(listSql).bind(...binds).all<GrantListRow & { status_val: string }>(),
    db.prepare(countSql).bind(...binds).first<{ n: number }>(),
  ]);

  const grants = list.results.map((r) => {
    const { status_val, ...rest } = r;
    return { ...rest, status: status_val } as GrantListRow;
  });
  return { grants, total: count?.n ?? 0 };
}

// Escape an FTS5 MATCH query: wrap each whitespace-separated term in quotes and
// append * for prefix matching; doubles internal quotes.
function ftsQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" ");
}

// Documented grants only (real written content) — the set we embed for search.
export type EmbedRow = {
  id: string;
  name: string;
  description: string | null;
  prose: string | null;
  country: string;
  instrument_type: string | null;
};

export async function queryEmbedBatch(
  offset: number,
  limit: number,
): Promise<EmbedRow[]> {
  const db = getDb();
  const res = await db
    .prepare(
      `SELECT g.id, g.name, g.description, g.prose, f.country AS country, g.instrument_type
       FROM grants g JOIN funders f ON f.id = g.funder_id
       WHERE g.state IN ('ready_for_verification','complete')
       ORDER BY g.id LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<EmbedRow>();
  return res.results;
}

// Hybrid search: semantic (Vectorize/bge-m3) ⊕ keyword (FTS5) fused via RRF,
// then hydrated from D1 with the active structured filters applied.
const RRF_K = 60;

export async function queryGrantsHybrid(
  query: GrantQuery,
  now: number,
): Promise<{ grants: GrantListRow[]; total: number }> {
  const q = (query.q ?? "").trim();
  if (!q) return queryGrants(query, now);

  const { env } = getCloudflareContext();
  const db = getDb();
  const today = isoDay(now);
  const soon = isoDay(now + 30 * 24 * 60 * 60 * 1000);

  // 1. Semantic candidates (best-effort: fall back to keyword-only on failure).
  let vIds: string[] = [];
  try {
    const emb = (await env.AI.run("@cf/baai/bge-m3", { text: [q] })) as {
      data?: number[][];
    };
    const vector = emb.data?.[0];
    if (vector) {
      // Vector ids are hashes; the real grantId lives in metadata.
      // topK is capped at 50 when returnMetadata is "all".
      const vres = await env.VECTORIZE.query(vector, {
        topK: 50,
        returnMetadata: "all",
      });
      vIds = vres.matches
        .map((m) => m.metadata?.grantId as string | undefined)
        .filter((x): x is string => Boolean(x));
    }
  } catch (e) {
    console.error("vectorize query failed", e);
  }

  // 2. Keyword candidates (FTS5).
  const ftsRes = await db
    .prepare("SELECT grant_id FROM grants_fts WHERE grants_fts MATCH ? LIMIT 100")
    .bind(ftsQuery(q))
    .all<{ grant_id: string }>();
  const fIds = ftsRes.results.map((r) => r.grant_id);

  // 3. Reciprocal Rank Fusion.
  const score = new Map<string, number>();
  vIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i + 1)));
  fIds.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i + 1)));
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  if (ranked.length === 0) return { grants: [], total: 0 };
  const candidateIds = ranked.slice(0, 300);
  const rankOf = new Map(candidateIds.map((id, i) => [id, i] as const));

  // 4. Hydrate the candidates, applying the other active filters in SQL.
  const binds: unknown[] = [today, soon];
  const where: string[] = [];
  // Pass candidate ids as one JSON param (D1 caps bound params at 100, and
  // there can be up to ~150 candidates) and expand via json_each.
  binds.push(JSON.stringify(candidateIds));
  where.push(`g.id IN (SELECT value FROM json_each(?${binds.length}))`);
  if (query.country && query.country !== "all") {
    binds.push(query.country);
    where.push(`f.country = ?${binds.length}`);
  }
  if (query.instrumentTypes?.length) {
    const ph = query.instrumentTypes.map((t) => {
      binds.push(t);
      return `?${binds.length}`;
    });
    where.push(`g.instrument_type IN (${ph.join(",")})`);
  }
  if (query.funderTypes?.length) {
    const ph = query.funderTypes.map((t) => {
      binds.push(t);
      return `?${binds.length}`;
    });
    where.push(`f.type IN (${ph.join(",")})`);
  }
  if (query.applicationMode && query.applicationMode !== "all") {
    binds.push(query.applicationMode);
    where.push(`g.application_mode = ?${binds.length}`);
  }
  if (query.fundingSize && query.fundingSize !== "any") {
    const range = FUNDING_RANGES[query.fundingSize];
    if (range) {
      binds.push(range[0]);
      where.push(`g.max_amount IS NOT NULL AND g.max_amount >= ?${binds.length}`);
      if (range[1] !== null) {
        binds.push(range[1]);
        where.push(`g.max_amount < ?${binds.length}`);
      }
    }
  }

  let statusFilter = "";
  if (query.statuses?.length) {
    const ph = query.statuses.map((s) => {
      binds.push(s);
      return `?${binds.length}`;
    });
    statusFilter = ` WHERE status_val IN (${ph.join(",")})`;
  }

  const base = `
    SELECT ${GRANT_LEAN_COLS.split(",")
      .map((c) => `g.${c}`)
      .join(",")},
      ${STATUS_CASE} AS status_val,
      f.short_name AS f_short_name, f.name AS f_name, f.type AS f_type,
      f.country AS f_country, f.country_name AS f_country_name,
      f.hq_city AS f_hq_city, f.favicon_url AS f_favicon_url,
      f.lat AS f_lat, f.lng AS f_lng
    FROM grants g JOIN funders f ON f.id = g.funder_id
    WHERE ${where.join(" AND ")}`;

  const rows = await db
    .prepare(`SELECT * FROM (${base})${statusFilter}`)
    .bind(...binds)
    .all<GrantListRow & { status_val: string }>();

  const ordered = rows.results
    .map((r) => {
      const { status_val, ...rest } = r;
      return { ...rest, status: status_val } as GrantListRow;
    })
    .sort((a, b) => (rankOf.get(a.id) ?? 1e9) - (rankOf.get(b.id) ?? 1e9));

  const total = ordered.length;
  const pageSize = Math.min(Math.max(query.pageSize ?? 200, 1), 1000);
  const page = Math.max(query.page ?? 0, 0);
  return { grants: ordered.slice(page * pageSize, page * pageSize + pageSize), total };
}
