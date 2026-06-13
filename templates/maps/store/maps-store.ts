// =============================================================================
// OpenSubsidies — Global Grant Intelligence Store
// =============================================================================
// Server-side data model: a one-time aggregate (every funder + global stats)
// drives the globe tiers and sidebar counts; the grant list/pins come from
// server-filtered, paginated pages (/api/grants); saved + recently-viewed are
// backed by a client-side cache of grants the user has loaded/opened.
// =============================================================================

import { create } from "zustand";
import {
  fetchAggregate,
  fetchGrantsPage,
  fetchFundingAggregate,
  fetchFundingLeaderboard,
  fetchFundingSubdivisions,
} from "@/mock-data/locations";
import type {
  Grant,
  GrantStatus,
  FunderType,
  Funder,
  InstrumentType,
  ApplicationMode,
  GlobalStats,
  FundingView,
  FundingAggregate,
  FundingEntity,
  FundingSubdivision,
  SubdivisionLevel,
} from "@/mock-data/locations";
import type { DisplayCurrency } from "@/lib/fx-rates";

// Countries we render a within-country subdivision (Fylke) choropleth for. POC:
// Norway only (the only country with a recipient-location enrichment so far).
export const SUBDIVISION_COUNTRIES = new Set(["NO"]);
// Which metric the Fylke choropleth + rankings express.
export type SubdivisionMetric = "sum" | "count";

type ViewMode = "map" | "list" | "split";
type MapStyle = "default" | "streets" | "outdoors" | "satellite";

export type MetricMode = "providers" | "schemes" | "funding";

// Which face of the morphing landing-page card is showing. 'discover' is the
// existing grant-finder; the two funding views are retrospective ("who got paid"
// / "who paid"). Lives in client state (home route only), not a URL route.
export type PanelView = "discover" | "received" | "awarded";

// 'discover' has no funding view; the two funding faces map 1:1 to FundingView.
function fundingViewOf(v: PanelView): FundingView | null {
  return v === "received" || v === "awarded" ? v : null;
}

export type GrantSortBy =
  | "deadline-soonest"
  | "funding-largest"
  | "newest"
  | "oldest"
  | "alpha-az"
  | "alpha-za";

export type FundingSizeBucket =
  | "any"
  | "micro"
  | "small"
  | "mid"
  | "large"
  | "mega";

export type CountryFilter = "all" | string;

const PAGE_SIZE = 300;
const EMPTY_STATS: GlobalStats = {
  totalGrants: 0,
  openNow: 0,
  closingSoon: 0,
  upcomingCount: 0,
  countriesCovered: 0,
  fundersIndexed: 0,
};

interface GrantsState {
  // Data
  funders: Funder[]; // aggregate — every funder, with coords + scheme count
  stats: GlobalStats;
  grants: Grant[]; // current server-filtered page
  total: number; // total matching the current filters
  grantCache: Map<string, Grant>; // every grant loaded this session
  savedIds: Set<string>;
  recentIds: string[]; // most-recent-first
  loaded: boolean; // aggregate loaded
  loading: boolean;
  grantsLoading: boolean; // a page fetch is in flight
  loadError: string | null;

  // Filters
  selectedCountry: CountryFilter;
  selectedInstrumentTypes: InstrumentType[];
  selectedStatuses: GrantStatus[];
  selectedFunderTypes: FunderType[];
  selectedApplicationMode: ApplicationMode | "all";
  fundingSize: FundingSizeBucket;
  searchQuery: string;
  sortBy: GrantSortBy;

  // Selection / map
  selectedGrantId: string | null;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  mapStyle: MapStyle;
  userLocation: { lat: number; lng: number } | null;
  isPanelVisible: boolean;
  viewMode: ViewMode;
  metricMode: MetricMode;
  isGrantsListExpanded: boolean;

  // Funding layer (lazy-loaded; populated on first switch to a funding view)
  panelView: PanelView;
  displayCurrency: DisplayCurrency;
  fundingScope: string | null; // country code, OR a subdivision code (NO-42); null = global ("ALL")
  selectedFundingEntityId: string | null;
  fundingAggregates: Partial<Record<FundingView, FundingAggregate>>;
  fundingLeaderboards: Record<string, FundingEntity[]>; // key `${view}|${scope}`
  fundingLoading: boolean;

  // Subdivision (Fylke) layer — the within-country money-flow choropleth.
  subdivisionMetric: SubdivisionMetric; // colour/rank by total € or award count
  subdivisionLevel: SubdivisionLevel; // fylke | kommune | city (POC: fylke)
  fundingSubdivisions: Record<string, FundingSubdivision[]>; // key `${view}|${scope}|${level}`
  // Provider drill-down: the funder whose money-flow (received-by-Fylke) is shown.
  // Set on selecting a provider; drives the per-provider choropleth + top receivers.
  fundingProviderId: string | null;

  // ── Actions ──
  initialize: () => Promise<void>;
  refetchGrants: () => Promise<void>;
  setSelectedCountry: (country: CountryFilter) => void;
  toggleInstrumentType: (t: InstrumentType) => void;
  clearInstrumentTypes: () => void;
  toggleStatus: (status: GrantStatus) => void;
  toggleFunderType: (t: FunderType) => void;
  setSelectedApplicationMode: (m: ApplicationMode | "all") => void;
  setFundingSize: (b: FundingSizeBucket) => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (s: GrantSortBy) => void;
  toggleSaved: (grantId: string) => void;
  selectGrant: (grantId: string | null) => void;
  setMapCenter: (c: { lat: number; lng: number }) => void;
  setMapZoom: (z: number) => void;
  setMapStyle: (s: MapStyle) => void;
  setUserLocation: (l: { lat: number; lng: number } | null) => void;
  setPanelVisible: (v: boolean) => void;
  setViewMode: (m: ViewMode) => void;
  setMetricMode: (m: MetricMode) => void;
  setGrantsListExpanded: (v: boolean) => void;

  // Funding actions
  setPanelView: (v: PanelView) => void;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  setFundingScope: (country: string | null) => void;
  selectFundingEntity: (id: string | null) => void;
  loadFundingAggregate: (view: FundingView) => Promise<void>;
  loadFundingLeaderboard: (view: FundingView, scope: string) => Promise<void>;
  loadFundingSubdivisions: (
    view: FundingView,
    scope: string,
    level: SubdivisionLevel,
  ) => Promise<void>;
  setSubdivisionMetric: (m: SubdivisionMetric) => void;
  setSubdivisionLevel: (l: SubdivisionLevel) => void;
  setFundingProvider: (funderId: string | null) => void;

  // ── Selectors ──
  getFilteredGrants: () => Grant[];
  getSavedGrants: () => Grant[];
  getRecentGrants: () => Grant[];
  getGlobalStats: () => GlobalStats;
}

function funderById(funders: Funder[], id: string): Funder | undefined {
  return funders.find((f) => f.id === id);
}

export const useGrantsStore = create<GrantsState>((set, get) => {
  // Race guard for paginated fetches (latest request wins) + search debounce.
  // Closure-scoped (not module-level) so they live with the store instance.
  let reqSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  return {
  funders: [],
  stats: EMPTY_STATS,
  grants: [],
  total: 0,
  grantCache: new Map(),
  savedIds: new Set(),
  recentIds: [],
  loaded: false,
  loading: false,
  grantsLoading: false,
  loadError: null,

  selectedCountry: "all",
  selectedInstrumentTypes: [],
  selectedStatuses: [],
  selectedFunderTypes: [],
  selectedApplicationMode: "all",
  fundingSize: "any",
  searchQuery: "",
  sortBy: "deadline-soonest",

  selectedGrantId: null,
  mapCenter: { lat: 30, lng: 10 },
  mapZoom: 2,
  mapStyle: "default",
  userLocation: null,
  isPanelVisible: true,
  viewMode: "split",
  metricMode: "schemes",
  isGrantsListExpanded: true,

  panelView: "discover",
  displayCurrency: "EUR",
  fundingScope: null,
  selectedFundingEntityId: null,
  fundingAggregates: {},
  fundingLeaderboards: {},
  fundingLoading: false,

  subdivisionMetric: "sum",
  subdivisionLevel: "fylke",
  fundingSubdivisions: {},
  fundingProviderId: null,

  initialize: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, loadError: null });
    try {
      const { funders, stats } = await fetchAggregate();
      set({ funders, stats, loaded: true, loading: false });
      await get().refetchGrants();
    } catch (e) {
      set({
        loading: false,
        loadError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  refetchGrants: async () => {
    const s = get();
    if (!s.loaded) return;
    const seq = ++reqSeq;
    set({ grantsLoading: true });
    try {
      const { grants, total } = await fetchGrantsPage({
        country: s.selectedCountry,
        instrumentTypes: s.selectedInstrumentTypes,
        statuses: s.selectedStatuses,
        funderTypes: s.selectedFunderTypes,
        applicationMode: s.selectedApplicationMode,
        fundingSize: s.fundingSize,
        q: s.searchQuery,
        sortBy: s.sortBy,
        page: 0,
        pageSize: PAGE_SIZE,
      });
      if (seq !== reqSeq) return; // a newer request superseded this one
      const saved = get().savedIds;
      const cache = new Map(get().grantCache);
      const withSaved = grants.map((g) => {
        const merged = { ...g, isSaved: saved.has(g.id) };
        cache.set(g.id, merged);
        return merged;
      });
      set({ grants: withSaved, total, grantsLoading: false, grantCache: cache });
    } catch {
      if (seq === reqSeq) set({ grantsLoading: false });
    }
  },

  setSelectedCountry: (country) => {
    const state = get();
    const next: Partial<GrantsState> = { selectedCountry: country };
    if (state.selectedGrantId && country !== "all") {
      const g = state.grantCache.get(state.selectedGrantId);
      if (g) {
        const f = funderById(state.funders, g.funderId);
        if (!f || f.country !== country) next.selectedGrantId = null;
      }
    }
    set(next);
    void get().refetchGrants();
  },

  toggleInstrumentType: (t) => {
    set((s) => ({
      selectedInstrumentTypes: s.selectedInstrumentTypes.includes(t)
        ? s.selectedInstrumentTypes.filter((x) => x !== t)
        : [...s.selectedInstrumentTypes, t],
    }));
    void get().refetchGrants();
  },

  clearInstrumentTypes: () => {
    set({ selectedInstrumentTypes: [] });
    void get().refetchGrants();
  },

  toggleStatus: (status) => {
    set((s) => ({
      selectedStatuses: s.selectedStatuses.includes(status)
        ? s.selectedStatuses.filter((x) => x !== status)
        : [...s.selectedStatuses, status],
    }));
    void get().refetchGrants();
  },

  toggleFunderType: (t) => {
    set((s) => ({
      selectedFunderTypes: s.selectedFunderTypes.includes(t)
        ? s.selectedFunderTypes.filter((x) => x !== t)
        : [...s.selectedFunderTypes, t],
    }));
    void get().refetchGrants();
  },

  setSelectedApplicationMode: (m) => {
    set({ selectedApplicationMode: m });
    void get().refetchGrants();
  },

  setFundingSize: (b) => {
    set({ fundingSize: b });
    void get().refetchGrants();
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void get().refetchGrants(), 300);
  },

  setSortBy: (s) => {
    set({ sortBy: s });
    void get().refetchGrants();
  },

  toggleSaved: (grantId) =>
    set((s) => {
      const savedIds = new Set(s.savedIds);
      if (savedIds.has(grantId)) savedIds.delete(grantId);
      else savedIds.add(grantId);
      const isSaved = savedIds.has(grantId);
      const grantCache = new Map(s.grantCache);
      const cached = grantCache.get(grantId);
      if (cached) grantCache.set(grantId, { ...cached, isSaved });
      const grants = s.grants.map((g) =>
        g.id === grantId ? { ...g, isSaved } : g,
      );
      return { savedIds, grantCache, grants };
    }),

  selectGrant: (grantId) =>
    set((s) => {
      if (grantId && grantId !== s.selectedGrantId) {
        const today = new Date().toISOString().slice(0, 10);
        const grantCache = new Map(s.grantCache);
        const cached = grantCache.get(grantId);
        if (cached) {
          grantCache.set(grantId, {
            ...cached,
            viewCount: cached.viewCount + 1,
            lastViewed: today,
          });
        }
        const recentIds = [
          grantId,
          ...s.recentIds.filter((id) => id !== grantId),
        ].slice(0, 50);
        const grants = s.grants.map((g) =>
          g.id === grantId
            ? { ...g, viewCount: g.viewCount + 1, lastViewed: today }
            : g,
        );
        return { selectedGrantId: grantId, grantCache, recentIds, grants };
      }
      return { selectedGrantId: grantId };
    }),

  setMapCenter: (c) => set({ mapCenter: c }),
  setMapZoom: (z) => set({ mapZoom: z }),
  setMapStyle: (s) => set({ mapStyle: s }),
  setUserLocation: (l) => set({ userLocation: l }),
  setPanelVisible: (v) => set({ isPanelVisible: v }),
  setViewMode: (m) => set({ viewMode: m }),
  setMetricMode: (m) => set({ metricMode: m }),
  setGrantsListExpanded: (v) => set({ isGrantsListExpanded: v }),

  // ── Funding actions (lazy-load; never block initialize) ──
  setPanelView: (v) => {
    const fv = fundingViewOf(v);
    // Money-flow is now the default: entering a funding view auto-focuses the
    // POC country (Norway) so the Fylke choropleth shows immediately — no click,
    // no bubbles. Preserves an existing scope if the user already drilled in.
    const scope = fv ? (get().fundingScope ?? "NO") : get().fundingScope;
    set({
      panelView: v,
      selectedFundingEntityId: null,
      fundingProviderId: null,
      fundingScope: scope,
    });
    if (fv) {
      void get().loadFundingAggregate(fv);
      void get().loadFundingLeaderboard(fv, scope ?? "ALL");
      void get().loadFundingSubdivisions(fv, "NO", get().subdivisionLevel);
    }
  },

  setDisplayCurrency: (c) => set({ displayCurrency: c }),

  setFundingScope: (country) => {
    // Changing scope leaves any provider drill-down (scope wins).
    set({ fundingScope: country, selectedFundingEntityId: null, fundingProviderId: null });
    const fv = fundingViewOf(get().panelView);
    if (!fv) return;
    void get().loadFundingLeaderboard(fv, country ?? "ALL");
    // Scoping to a subdivision country (NO) → ensure its choropleth data is loaded.
    if (country && SUBDIVISION_COUNTRIES.has(country)) {
      void get().loadFundingSubdivisions(fv, country, get().subdivisionLevel);
    }
  },

  selectFundingEntity: (id) => set({ selectedFundingEntityId: id }),

  // Drill into one provider: show where ITS money flows (received-by-Fylke) +
  // its top receivers. Works for national funders (Innovasjon Norge) and
  // regional funders alike — provider flow is always a received-side question.
  setFundingProvider: (funderId) => {
    set({ fundingProviderId: funderId, selectedFundingEntityId: null });
    if (!funderId) return;
    void get().loadFundingSubdivisions("received", funderId, get().subdivisionLevel);
    void get().loadFundingLeaderboard("received", funderId);
  },

  setSubdivisionMetric: (m) => set({ subdivisionMetric: m }),

  setSubdivisionLevel: (l) => {
    set({ subdivisionLevel: l });
    const fv = fundingViewOf(get().panelView);
    const provider = get().fundingProviderId;
    if (provider) void get().loadFundingSubdivisions("received", provider, l);
    if (fv) void get().loadFundingSubdivisions(fv, "NO", l);
  },

  loadFundingAggregate: async (view) => {
    if (get().fundingAggregates[view]) return; // cached
    set({ fundingLoading: true });
    try {
      const agg = await fetchFundingAggregate(view);
      set((s) => ({
        fundingAggregates: { ...s.fundingAggregates, [view]: agg },
        fundingLoading: false,
      }));
    } catch {
      set({ fundingLoading: false });
    }
  },

  loadFundingLeaderboard: async (view, scope) => {
    const key = `${view}|${scope}`;
    if (get().fundingLeaderboards[key]) return; // cached
    try {
      const entities = await fetchFundingLeaderboard(view, scope);
      set((s) => ({
        fundingLeaderboards: { ...s.fundingLeaderboards, [key]: entities },
      }));
    } catch {
      /* leaderboard stays empty on error */
    }
  },

  loadFundingSubdivisions: async (view, scope, level) => {
    const key = `${view}|${scope}|${level}`;
    if (get().fundingSubdivisions[key]) return; // cached
    try {
      const subdivisions = await fetchFundingSubdivisions(view, scope, level);
      set((s) => ({
        fundingSubdivisions: { ...s.fundingSubdivisions, [key]: subdivisions },
      }));
    } catch {
      /* subdivision layer stays empty on error */
    }
  },

  // ── Selectors ──
  // The current page is already filtered + sorted server-side.
  getFilteredGrants: () => get().grants,

  getSavedGrants: () => {
    const s = get();
    let out = [...s.grantCache.values()].filter((g) => s.savedIds.has(g.id));
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.description?.toLowerCase().includes(q) ?? false),
      );
    }
    if (s.selectedCountry !== "all") {
      out = out.filter((g) => {
        const f = funderById(s.funders, g.funderId);
        return f?.country === s.selectedCountry;
      });
    }
    out.sort((a, b) => sortCompare(a, b, s.sortBy));
    return out.map((g) => ({ ...g, isSaved: true }));
  },

  getRecentGrants: () => {
    const s = get();
    return s.recentIds
      .map((id) => s.grantCache.get(id))
      .filter((g): g is Grant => Boolean(g))
      .slice(0, 25);
  },

  getGlobalStats: () => get().stats,
  };
});

// Backward-compatible alias
export const useMapsStore = useGrantsStore;

// ── Sort comparator (saved/recent are sorted client-side) ────────────────────
const FAR_FUTURE = "9999-12-31";

function sortCompare(a: Grant, b: Grant, sortBy: GrantSortBy): number {
  switch (sortBy) {
    case "deadline-soonest": {
      const aClosed = a.status === "closed" ? 1 : 0;
      const bClosed = b.status === "closed" ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      const ad = Date.parse(a.closesAt ?? FAR_FUTURE);
      const bd = Date.parse(b.closesAt ?? FAR_FUTURE);
      return ad - bd;
    }
    case "funding-largest":
      return (b.maxAmount ?? 0) - (a.maxAmount ?? 0);
    case "newest": {
      const at = Date.parse(a.sourceUpdatedAt ?? "");
      const bt = Date.parse(b.sourceUpdatedAt ?? "");
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    }
    case "oldest": {
      const at = Date.parse(a.sourceUpdatedAt ?? "");
      const bt = Date.parse(b.sourceUpdatedAt ?? "");
      return (
        (Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(bt) ? bt : Number.MAX_SAFE_INTEGER)
      );
    }
    case "alpha-az":
      return a.name.localeCompare(b.name);
    case "alpha-za":
      return b.name.localeCompare(a.name);
    default:
      return 0;
  }
}
