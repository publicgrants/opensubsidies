// =============================================================================
// OpenSubsidies — Global Grant Intelligence Store
// =============================================================================
// Filename is preserved (`store/maps-store.ts`) for compatibility, but this
// store is the central state container for the OpenSubsidies dashboard:
// grants, country / funder-type / instrument-type / application-mode
// filters, search, sort modes, the user's watchlist (favorites) and recently
// viewed grants, plus the map view-state (center, zoom, style) and the
// user's geolocation.
// =============================================================================

import { create } from "zustand";
import {
  grants as initialGrants,
  funders as allFunders,
  type Grant,
  type GrantStatus,
  type FunderType,
  type Funder,
  type InstrumentType,
  type ApplicationMode,
} from "@/mock-data/locations";

type ViewMode = "map" | "list" | "split";
type MapStyle = "default" | "streets" | "outdoors" | "satellite";

// Which metric every count in the UI reflects — chosen via the sidebar toggle.
// "funding" is wired through the whole stack but renders "—" until the catalog
// gains a disbursement field (the catalog tracks programme metadata, not
// amounts actually awarded to companies).
export type MetricMode = "providers" | "schemes" | "funding";

export type GrantSortBy =
  | "deadline-soonest"
  | "funding-largest"
  | "newest"
  | "oldest"
  | "alpha-az"
  | "alpha-za";

export type FundingSizeBucket =
  | "any"
  | "micro" // <100K
  | "small" // 100K–500K
  | "mid" // 500K–2M
  | "large" // 2M–10M
  | "mega"; // >10M

export type CountryFilter = "all" | string;

interface GrantsState {
  grants: Grant[];

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

  // ── Actions ──────────────────────────────────────────────────────────────
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

  // ── Selectors ────────────────────────────────────────────────────────────
  getFilteredGrants: () => Grant[];
  getSavedGrants: () => Grant[];
  getRecentGrants: () => Grant[];
  getGlobalStats: () => {
    totalGrants: number;
    openNow: number;
    closingSoon: number;
    upcomingCount: number;
    countriesCovered: number;
    fundersIndexed: number;
  };
}

function inFundingBucket(grant: Grant, bucket: FundingSizeBucket): boolean {
  if (bucket === "any") return true;
  const max = grant.maxAmount;
  if (max === null) return false; // unknown amounts excluded from specific buckets
  switch (bucket) {
    case "micro":
      return max < 100_000;
    case "small":
      return max >= 100_000 && max < 500_000;
    case "mid":
      return max >= 500_000 && max < 2_000_000;
    case "large":
      return max >= 2_000_000 && max < 10_000_000;
    case "mega":
      return max >= 10_000_000;
  }
}

function funderById(funders: Funder[], id: string): Funder | undefined {
  return funders.find((f) => f.id === id);
}

export const useGrantsStore = create<GrantsState>((set, get) => ({
  grants: initialGrants,

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

  setSelectedCountry: (country) => {
    const state = get();
    const next: Partial<GrantsState> = { selectedCountry: country };
    if (state.selectedGrantId && country !== "all") {
      const g = state.grants.find((x) => x.id === state.selectedGrantId);
      if (g) {
        const f = funderById(allFunders, g.funderId);
        if (!f || f.country !== country) next.selectedGrantId = null;
      }
    }
    set(next);
  },

  toggleInstrumentType: (t) =>
    set((s) => ({
      selectedInstrumentTypes: s.selectedInstrumentTypes.includes(t)
        ? s.selectedInstrumentTypes.filter((x) => x !== t)
        : [...s.selectedInstrumentTypes, t],
    })),

  clearInstrumentTypes: () => set({ selectedInstrumentTypes: [] }),

  toggleStatus: (status) =>
    set((s) => ({
      selectedStatuses: s.selectedStatuses.includes(status)
        ? s.selectedStatuses.filter((x) => x !== status)
        : [...s.selectedStatuses, status],
    })),

  toggleFunderType: (t) =>
    set((s) => ({
      selectedFunderTypes: s.selectedFunderTypes.includes(t)
        ? s.selectedFunderTypes.filter((x) => x !== t)
        : [...s.selectedFunderTypes, t],
    })),

  setSelectedApplicationMode: (m) => set({ selectedApplicationMode: m }),
  setFundingSize: (b) => set({ fundingSize: b }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (s) => set({ sortBy: s }),

  toggleSaved: (grantId) =>
    set((s) => ({
      grants: s.grants.map((g) =>
        g.id === grantId ? { ...g, isSaved: !g.isSaved } : g,
      ),
    })),

  selectGrant: (grantId) =>
    set((s) => {
      if (grantId && grantId !== s.selectedGrantId) {
        const today = new Date().toISOString().slice(0, 10);
        return {
          selectedGrantId: grantId,
          grants: s.grants.map((g) =>
            g.id === grantId
              ? { ...g, viewCount: g.viewCount + 1, lastViewed: today }
              : g,
          ),
        };
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

  // ── Selectors ────────────────────────────────────────────────────────────
  getFilteredGrants: () => {
    const s = get();
    let out = [...s.grants];

    if (s.selectedCountry !== "all") {
      out = out.filter((g) => {
        const f = funderById(allFunders, g.funderId);
        return f?.country === s.selectedCountry;
      });
    }
    if (s.selectedInstrumentTypes.length > 0) {
      out = out.filter((g) => s.selectedInstrumentTypes.includes(g.instrumentType));
    }
    if (s.selectedStatuses.length > 0) {
      out = out.filter((g) => s.selectedStatuses.includes(g.status));
    }
    if (s.selectedFunderTypes.length > 0) {
      out = out.filter((g) => {
        const f = funderById(allFunders, g.funderId);
        return f ? s.selectedFunderTypes.includes(f.type) : false;
      });
    }
    if (s.selectedApplicationMode !== "all") {
      out = out.filter((g) => g.applicationMode === s.selectedApplicationMode);
    }
    if (s.fundingSize !== "any") {
      out = out.filter((g) => inFundingBucket(g, s.fundingSize));
    }
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter((g) => {
        const f = funderById(allFunders, g.funderId);
        return (
          g.name.toLowerCase().includes(q) ||
          g.prose.toLowerCase().includes(q) ||
          (f && f.name.toLowerCase().includes(q)) ||
          (f && f.shortName.toLowerCase().includes(q))
        );
      });
    }

    out.sort((a, b) => sortCompare(a, b, s.sortBy));
    return out;
  },

  getSavedGrants: () => {
    const s = get();
    let out = s.grants.filter((g) => g.isSaved);
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.prose.toLowerCase().includes(q),
      );
    }
    if (s.selectedCountry !== "all") {
      out = out.filter((g) => {
        const f = funderById(allFunders, g.funderId);
        return f?.country === s.selectedCountry;
      });
    }
    out.sort((a, b) => sortCompare(a, b, s.sortBy));
    return out;
  },

  getRecentGrants: () => {
    const s = get();
    let out = [...s.grants];
    if (s.selectedCountry !== "all") {
      out = out.filter((g) => {
        const f = funderById(allFunders, g.funderId);
        return f?.country === s.selectedCountry;
      });
    }
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.prose.toLowerCase().includes(q),
      );
    }
    // Sort by lastViewed (recent first); fall back to scheme name.
    out = out.filter((g) => g.lastViewed);
    out.sort((a, b) => {
      const at = a.lastViewed ? new Date(a.lastViewed).getTime() : 0;
      const bt = b.lastViewed ? new Date(b.lastViewed).getTime() : 0;
      return bt - at;
    });
    return out.slice(0, 25);
  },

  getGlobalStats: () => {
    const s = get();
    const total = s.grants.length;
    const openNow = s.grants.filter(
      (g) => g.status === "open" || g.status === "closing-soon",
    ).length;
    const closingSoon = s.grants.filter((g) => g.status === "closing-soon").length;
    const upcoming = s.grants.filter((g) => g.status === "upcoming").length;
    const countrySet = new Set<string>();
    allFunders.forEach((f) => countrySet.add(f.country));
    return {
      totalGrants: total,
      openNow,
      closingSoon,
      upcomingCount: upcoming,
      countriesCovered: countrySet.size,
      fundersIndexed: allFunders.length,
    };
  },
}));

// Backward-compatible alias for legacy imports `useMapsStore`
export const useMapsStore = useGrantsStore;

// ── Sort comparator ─────────────────────────────────────────────────────────
const FAR_FUTURE = "9999-12-31";

function sortCompare(a: Grant, b: Grant, sortBy: GrantSortBy): number {
  switch (sortBy) {
    case "deadline-soonest": {
      // closed last; otherwise nearest deadline first. Schemes without a
      // closesAt sort to the end of the "non-closed" group.
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
      return (Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER) -
        (Number.isFinite(bt) ? bt : Number.MAX_SAFE_INTEGER);
    }
    case "alpha-az":
      return a.name.localeCompare(b.name);
    case "alpha-za":
      return b.name.localeCompare(a.name);
    default:
      return 0;
  }
}
