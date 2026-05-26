// =============================================================================
// Grant.com — Global Grant Intelligence Store
// =============================================================================
// Filename is preserved (`store/maps-store.ts`) for compatibility, but this
// store is now the central state container for the Grant.com dashboard:
// grants, sector filters, instrument-tag filters, search, sort modes, the
// user's watchlist (favorites) and recently viewed grants, plus the map
// view-state (center, zoom, style) and the user's geolocation.
// =============================================================================

import { create } from "zustand";
import {
  grants as initialGrants,
  funders as allFunders,
  type Grant,
  type GrantStatus,
  type FunderType,
  type Funder,
} from "@/mock-data/locations";

type ViewMode = "map" | "list" | "split";
type MapStyle = "default" | "streets" | "outdoors" | "satellite";

export type GrantSortBy =
  | "deadline-soonest"
  | "funding-largest"
  | "match-score"
  | "newest"
  | "oldest"
  | "alpha-az"
  | "alpha-za"
  | "most-allocated";

export type FundingSizeBucket =
  | "any"
  | "micro" // <100K
  | "small" // 100K–500K
  | "mid" // 500K–2M
  | "large" // 2M–10M
  | "mega"; // >10M

interface GrantsState {
  grants: Grant[];

  // Filters
  selectedSector: string; // "all" or sector id
  selectedTags: string[];
  selectedStatuses: GrantStatus[];
  selectedFunderTypes: FunderType[];
  selectedRegion: string; // "all", "EU", "NO", "US", "Nordics", "GLOBAL"
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

  // ── Actions ──────────────────────────────────────────────────────────────
  setSelectedSector: (sectorId: string) => void;
  toggleTag: (tagId: string) => void;
  clearTags: () => void;
  toggleStatus: (status: GrantStatus) => void;
  toggleFunderType: (t: FunderType) => void;
  setSelectedRegion: (r: string) => void;
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
    totalAnnualBudgetEUR: number;
  };
}

// ── Filter helpers ──────────────────────────────────────────────────────────
const REGION_GROUPS: Record<string, string[]> = {
  Nordics: ["NO", "SE", "FI", "DK", "IS"],
  EU: [
    "EU", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
    "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO",
    "SK", "SI", "ES", "SE",
  ],
  "North America": ["US", "CA"],
  "Asia & APAC": ["JP", "KR", "AU", "IN", "IL"],
  "Latin America": ["BR", "MX", "AR", "CL", "CO"],
  Global: ["GLOBAL"],
};

function inRegion(grant: Grant, region: string, fundersList: Funder[]) {
  if (region === "all") return true;
  const funder = fundersList.find((f) => f.id === grant.funderId);
  if (!funder) return false;
  if (region === funder.country) return true;
  const group = REGION_GROUPS[region];
  if (!group) return false;
  return group.includes(funder.country);
}

function inFundingBucket(grant: Grant, bucket: FundingSizeBucket): boolean {
  if (bucket === "any") return true;
  const max = grant.fundingMaxEUR;
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

// Funders list is referenced for region & funder-type filtering; imported
// directly above. There is no circular dependency.
function getFunders(): Funder[] {
  return allFunders;
}

export const useGrantsStore = create<GrantsState>((set, get) => ({
  grants: initialGrants,

  selectedSector: "all",
  selectedTags: [],
  selectedStatuses: [],
  selectedFunderTypes: [],
  selectedRegion: "all",
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

  setSelectedSector: (sectorId) => {
    const state = get();
    const next: Partial<GrantsState> = { selectedSector: sectorId };
    if (state.selectedGrantId) {
      const g = state.grants.find((x) => x.id === state.selectedGrantId);
      if (g && sectorId !== "all" && g.sectorId !== sectorId) {
        next.selectedGrantId = null;
      }
    }
    set(next);
  },

  toggleTag: (tagId) =>
    set((s) => ({
      selectedTags: s.selectedTags.includes(tagId)
        ? s.selectedTags.filter((t) => t !== tagId)
        : [...s.selectedTags, tagId],
    })),

  clearTags: () => set({ selectedTags: [] }),

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

  setSelectedRegion: (r) => set({ selectedRegion: r }),
  setFundingSize: (b) => set({ fundingSize: b }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSortBy: (s) => set({ sortBy: s }),

  toggleSaved: (grantId) =>
    set((s) => ({
      grants: s.grants.map((g) =>
        g.id === grantId ? { ...g, isSaved: !g.isSaved } : g
      ),
    })),

  selectGrant: (grantId) =>
    set((s) => {
      // Increment view count + lastViewed when a grant becomes selected
      if (grantId && grantId !== s.selectedGrantId) {
        const today = new Date().toISOString().slice(0, 10);
        return {
          selectedGrantId: grantId,
          grants: s.grants.map((g) =>
            g.id === grantId
              ? { ...g, viewCount: g.viewCount + 1, lastViewed: today }
              : g
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

  // ── Selectors ────────────────────────────────────────────────────────────
  getFilteredGrants: () => {
    const s = get();
    const funders = getFunders();
    let out = [...s.grants];

    if (s.selectedSector !== "all") {
      out = out.filter((g) => g.sectorId === s.selectedSector);
    }
    if (s.selectedTags.length > 0) {
      out = out.filter((g) => s.selectedTags.some((t) => g.tags.includes(t)));
    }
    if (s.selectedStatuses.length > 0) {
      out = out.filter((g) => s.selectedStatuses.includes(g.status));
    }
    if (s.selectedFunderTypes.length > 0) {
      out = out.filter((g) => {
        const f = funders.find((x) => x.id === g.funderId);
        return f ? s.selectedFunderTypes.includes(f.type) : false;
      });
    }
    if (s.selectedRegion !== "all") {
      out = out.filter((g) => inRegion(g, s.selectedRegion, funders));
    }
    if (s.fundingSize !== "any") {
      out = out.filter((g) => inFundingBucket(g, s.fundingSize));
    }
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter((g) => {
        const f = funders.find((x) => x.id === g.funderId);
        return (
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q) ||
          (f && f.name.toLowerCase().includes(q)) ||
          (f && f.shortName.toLowerCase().includes(q)) ||
          g.tags.some((t) => t.toLowerCase().includes(q))
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
          g.description.toLowerCase().includes(q)
      );
    }
    if (s.selectedSector !== "all") {
      out = out.filter((g) => g.sectorId === s.selectedSector);
    }
    out.sort((a, b) => sortCompare(a, b, s.sortBy));
    return out;
  },

  getRecentGrants: () => {
    const s = get();
    let out = [...s.grants];
    if (s.selectedSector !== "all") {
      out = out.filter((g) => g.sectorId === s.selectedSector);
    }
    if (s.searchQuery) {
      const q = s.searchQuery.toLowerCase();
      out = out.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q)
      );
    }
    // Sort by lastViewed (recent first), then publishedAt
    out.sort((a, b) => {
      const at = a.lastViewed ? new Date(a.lastViewed).getTime() : 0;
      const bt = b.lastViewed ? new Date(b.lastViewed).getTime() : 0;
      if (bt !== at) return bt - at;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return out.slice(0, 25);
  },

  getGlobalStats: () => {
    const s = get();
    const funders = getFunders();
    const total = s.grants.length;
    const openNow = s.grants.filter((g) => g.status === "open" || g.status === "closing-soon").length;
    const closingSoon = s.grants.filter((g) => g.status === "closing-soon").length;
    const upcoming = s.grants.filter((g) => g.status === "upcoming").length;
    const countrySet = new Set<string>();
    funders.forEach((f) => countrySet.add(f.country));
    const totalAnnual = s.grants.reduce(
      (sum, g) => sum + (g.totalAnnualBudgetEUR || 0),
      0
    );
    return {
      totalGrants: total,
      openNow,
      closingSoon,
      upcomingCount: upcoming,
      countriesCovered: countrySet.size,
      fundersIndexed: funders.length,
      totalAnnualBudgetEUR: totalAnnual,
    };
  },
}));

// Backward-compatible alias for legacy imports `useMapsStore`
export const useMapsStore = useGrantsStore;

// ── Sort comparator ─────────────────────────────────────────────────────────
function sortCompare(a: Grant, b: Grant, sortBy: GrantSortBy): number {
  switch (sortBy) {
    case "deadline-soonest": {
      // closed last; otherwise nearest deadline first
      const aClosed = a.status === "closed" ? 1 : 0;
      const bClosed = b.status === "closed" ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    case "funding-largest":
      return b.fundingMaxEUR - a.fundingMaxEUR;
    case "match-score":
      return b.matchScore - a.matchScore;
    case "most-allocated":
      return b.totalAnnualBudgetEUR - a.totalAnnualBudgetEUR;
    case "newest":
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    case "oldest":
      return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    case "alpha-az":
      return a.name.localeCompare(b.name);
    case "alpha-za":
      return b.name.localeCompare(a.name);
    default:
      return 0;
  }
}
