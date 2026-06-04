// Client data layer. Server-side model: the globe + sidebar use a small
// aggregate (every funder with coords + scheme count, fetched once); the list /
// pins use server-filtered, paginated pages from /api/grants; grant prose is
// fetched per-grant on demand. Status is computed server-side in SQL.

import { coordsForCityOrCountry, type LatLng } from "./geo";
import type {
  ApplicationMode,
  FunderType,
  GrantDocument,
  InstrumentType,
} from "./catalog-types";

export type { FunderType, InstrumentType, ApplicationMode, GrantDocument };

export type GrantStatus = "open" | "upcoming" | "closing-soon" | "closed";

// Funder now carries server-resolved coordinates and a scheme count so the
// globe tiers/clustering and sidebar counts work from the aggregate alone.
export type Funder = {
  id: string;
  name: string;
  shortName: string;
  type: FunderType;
  country: string;
  countryName: string;
  region: string;
  hq: string | null;
  website: string;
  faviconUrl: string;
  lat: number;
  lng: number;
  schemes: number;
};

export type Grant = {
  id: string;
  name: string;
  funderId: string;
  url: string;
  applicationUrl: string | null;
  description: string;
  prose: string; // "" until lazily hydrated via fetchGrantProse
  coordinates: LatLng;
  address: string | null;
  status: GrantStatus;

  closesAt: string | null;
  opensAt: string | null;
  applicationMode: ApplicationMode;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  fundingRatePct: number | null;
  totalBudget: number | null;
  instrumentType: InstrumentType;
  schemeCode: string | null;
  program: string | null;
  documents: GrantDocument[];
  sourceUpdatedAt: string | null;

  isSaved: boolean;
  viewCount: number;
  lastViewed?: string;
};

export type GlobalStats = {
  totalGrants: number;
  openNow: number;
  closingSoon: number;
  upcomingCount: number;
  countriesCovered: number;
  fundersIndexed: number;
};

export type GrantQuery = {
  country?: string; // ISO code or "all"
  instrumentTypes?: InstrumentType[];
  statuses?: GrantStatus[];
  funderTypes?: FunderType[];
  applicationMode?: ApplicationMode | "all";
  fundingSize?: string;
  q?: string;
  sortBy?: string;
  page?: number;
  pageSize?: number;
};

type AggFunderRow = {
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
  lat: number;
  lng: number;
  schemes: number;
};

type GrantListRow = {
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
  status: string;
  f_hq_city: string | null;
  f_lat: number;
  f_lng: number;
};

function parseDocuments(raw: string | null): GrantDocument[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as GrantDocument[]) : [];
  } catch {
    return [];
  }
}

const FUNDER_TYPES = new Set<FunderType>([
  "government",
  "supranational",
  "foundation",
  "unknown",
]);
const INSTRUMENT_TYPES = new Set<InstrumentType>([
  "grant",
  "loan",
  "guarantee",
  "voucher",
  "equity",
  "mixed",
  "unknown",
]);
const APPLICATION_MODES = new Set<ApplicationMode>([
  "rolling",
  "deadline",
  "call_window",
  "unknown",
]);
const GRANT_STATUSES = new Set<GrantStatus>([
  "open",
  "upcoming",
  "closing-soon",
  "closed",
]);

function asFunderType(v: string): FunderType {
  return FUNDER_TYPES.has(v as FunderType) ? (v as FunderType) : "unknown";
}
function asInstrumentType(v: string | null): InstrumentType {
  return v && INSTRUMENT_TYPES.has(v as InstrumentType)
    ? (v as InstrumentType)
    : "unknown";
}
function asApplicationMode(v: string | null): ApplicationMode {
  return v && APPLICATION_MODES.has(v as ApplicationMode)
    ? (v as ApplicationMode)
    : "unknown";
}
function asStatus(v: string): GrantStatus {
  return GRANT_STATUSES.has(v as GrantStatus) ? (v as GrantStatus) : "open";
}

function mapFunder(r: AggFunderRow): Funder {
  return {
    id: r.id,
    name: r.name,
    shortName: r.short_name,
    type: asFunderType(r.type),
    country: r.country,
    countryName: r.country_name,
    region: r.region,
    hq: r.hq_city,
    website: r.website ?? "",
    faviconUrl: r.favicon_url ?? "",
    lat: r.lat,
    lng: r.lng,
    schemes: r.schemes ?? 0,
  };
}

function mapGrant(r: GrantListRow): Grant {
  const lat = typeof r.f_lat === "number" ? r.f_lat : 0;
  const lng = typeof r.f_lng === "number" ? r.f_lng : 0;
  const coordinates =
    lat || lng ? { lat, lng } : coordsForCityOrCountry(r.f_hq_city, "INTL");
  return {
    id: r.id,
    name: r.name,
    funderId: r.funder_id,
    url: r.url ?? "",
    applicationUrl: r.application_url,
    description: r.description ?? "",
    prose: "",
    coordinates,
    address: r.f_hq_city,
    status: asStatus(r.status),
    closesAt: r.closes_at,
    opensAt: r.opens_at,
    applicationMode: asApplicationMode(r.application_mode),
    currency: r.currency,
    minAmount: r.min_amount,
    maxAmount: r.max_amount,
    fundingRatePct: r.funding_rate_pct,
    totalBudget: r.total_budget,
    instrumentType: asInstrumentType(r.instrument_type),
    schemeCode: r.scheme_code,
    program: r.program,
    documents: parseDocuments(r.documents),
    sourceUpdatedAt: r.source_updated_at,
    isSaved: false,
    viewCount: 0,
  };
}

export async function fetchAggregate(): Promise<{
  funders: Funder[];
  stats: GlobalStats;
}> {
  const res = await fetch("/api/aggregate");
  if (!res.ok) throw new Error(`Failed to load aggregate (${res.status})`);
  const data = (await res.json()) as {
    funders: AggFunderRow[];
    stats: GlobalStats;
  };
  return { funders: data.funders.map(mapFunder), stats: data.stats };
}

export async function fetchGrantsPage(
  query: GrantQuery,
): Promise<{ grants: Grant[]; total: number }> {
  const sp = new URLSearchParams();
  if (query.country && query.country !== "all") sp.set("country", query.country);
  if (query.instrumentTypes?.length)
    sp.set("instrument", query.instrumentTypes.join(","));
  if (query.statuses?.length) sp.set("status", query.statuses.join(","));
  if (query.funderTypes?.length)
    sp.set("funderType", query.funderTypes.join(","));
  if (query.applicationMode && query.applicationMode !== "all")
    sp.set("mode", query.applicationMode);
  if (query.fundingSize && query.fundingSize !== "any")
    sp.set("funding", query.fundingSize);
  if (query.q && query.q.trim()) sp.set("q", query.q.trim());
  if (query.sortBy) sp.set("sort", query.sortBy);
  if (query.page != null) sp.set("page", String(query.page));
  if (query.pageSize != null) sp.set("pageSize", String(query.pageSize));

  const res = await fetch(`/api/grants?${sp.toString()}`);
  if (!res.ok) throw new Error(`Failed to load grants (${res.status})`);
  const data = (await res.json()) as { grants: GrantListRow[]; total: number };
  return { grants: data.grants.map(mapGrant), total: data.total };
}

// Lazily fetch a single grant's prose for the detail card. Grant ids contain
// slashes; keep them as path segments for the catch-all /api/grant/[...id].
export async function fetchGrantProse(id: string): Promise<string> {
  const path = id.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`/api/grant/${path}`);
  if (!res.ok) return "";
  const row = (await res.json()) as { prose?: string | null };
  return row.prose ?? "";
}

// ── Funding rollups (money actually paid out) ───────────────────────────────
// Pre-aggregated in D1 (funding_country / funding_entity / funding_coverage).
// Amounts are EUR (canonical, comparable) + native where single-currency; the
// UI re-expresses EUR in the chosen display currency via lib/fx-rates.

export type FundingView = "received" | "awarded";

export type FundingCountry = {
  view: FundingView;
  country: string; // ISO/EU code, or "ALL" for the global hero
  sumEur: number;
  awardCount: number;
  medianEur: number | null;
  nativeCurrency: string | null;
  sumNative: number | null;
};

export type FundingEntity = {
  view: FundingView;
  scope: string;
  entityType: "recipient" | "funder";
  entityId: string;
  entityName: string;
  entityCountry: string | null;
  sumEur: number;
  awardCount: number;
  medianEur: number | null;
  nativeCurrency: string | null;
  sumNative: number | null;
  rank: number;
};

export type FundingCoverage = {
  country: string;
  completeness: string; // full | partial | threshold_capped | sample
  asOf: string | null;
};

export type FundingAggregate = {
  countries: FundingCountry[];
  coverage: FundingCoverage[];
};

type FundingCountryRow = {
  view: string;
  country: string;
  sum_eur: number;
  award_count: number;
  median_eur: number | null;
  native_currency: string | null;
  sum_native: number | null;
};
type FundingEntityRow = {
  view: string;
  scope: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  entity_country: string | null;
  sum_eur: number;
  award_count: number;
  median_eur: number | null;
  native_currency: string | null;
  sum_native: number | null;
  rank: number;
};
type FundingCoverageRow = {
  country: string;
  completeness: string;
  as_of: string | null;
};

function mapFundingCountry(r: FundingCountryRow): FundingCountry {
  return {
    view: r.view === "awarded" ? "awarded" : "received",
    country: r.country,
    sumEur: r.sum_eur,
    awardCount: r.award_count,
    medianEur: r.median_eur,
    nativeCurrency: r.native_currency,
    sumNative: r.sum_native,
  };
}
function mapFundingEntity(r: FundingEntityRow): FundingEntity {
  return {
    view: r.view === "awarded" ? "awarded" : "received",
    scope: r.scope,
    entityType: r.entity_type === "funder" ? "funder" : "recipient",
    entityId: r.entity_id,
    entityName: r.entity_name,
    entityCountry: r.entity_country,
    sumEur: r.sum_eur,
    awardCount: r.award_count,
    medianEur: r.median_eur,
    nativeCurrency: r.native_currency,
    sumNative: r.sum_native,
    rank: r.rank,
  };
}
function mapFundingCoverage(r: FundingCoverageRow): FundingCoverage {
  return { country: r.country, completeness: r.completeness, asOf: r.as_of };
}

export async function fetchFundingAggregate(
  view: FundingView,
): Promise<FundingAggregate> {
  const res = await fetch(`/api/funding?view=${view}`);
  if (!res.ok) throw new Error(`Failed to load funding aggregate (${res.status})`);
  const data = (await res.json()) as {
    countries: FundingCountryRow[];
    coverage: FundingCoverageRow[];
  };
  return {
    countries: data.countries.map(mapFundingCountry),
    coverage: data.coverage.map(mapFundingCoverage),
  };
}

export async function fetchFundingLeaderboard(
  view: FundingView,
  scope: string,
): Promise<FundingEntity[]> {
  const res = await fetch(
    `/api/funding?view=${view}&scope=${encodeURIComponent(scope)}`,
  );
  if (!res.ok)
    throw new Error(`Failed to load funding leaderboard (${res.status})`);
  const data = (await res.json()) as { entities: FundingEntityRow[] };
  return data.entities.map(mapFundingEntity);
}
