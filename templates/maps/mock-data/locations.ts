// =============================================================================
// OpenSubsidies — Catalog re-export shim
// =============================================================================
// Data is fetched at runtime from the D1-backed API: a one-time aggregate
// (funders + stats) plus server-filtered, paginated grant pages, and grant
// prose on demand. Type names are preserved for imports across the dashboard.
// =============================================================================

export {
  fetchAggregate,
  fetchGrantsPage,
  fetchGrantProse,
  fetchFundingAggregate,
  fetchFundingLeaderboard,
  fetchFundingSubdivisions,
} from "./catalog-loader";

export type {
  Grant,
  Funder,
  GrantStatus,
  GlobalStats,
  GrantQuery,
  FunderType,
  InstrumentType,
  ApplicationMode,
  GrantDocument,
  FundingView,
  FundingCountry,
  FundingEntity,
  FundingCoverage,
  FundingAggregate,
  FundingSubdivision,
  SubdivisionLevel,
} from "./catalog-loader";
