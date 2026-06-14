"use client";

import * as React from "react";
import {
  Search,
  X,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  CalendarClock,
  Banknote,
  Layers,
  Landmark,
  Globe,
  Sparkles,
  HelpCircle,
  HandCoins,
  Coins,
  ShieldCheck,
  Ticket,
  TrendingUp,
  Shuffle,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  useGrantsStore,
  type GrantSortBy,
  type FundingSizeBucket,
} from "@/store/maps-store";
import type {
  GrantStatus,
  FunderType,
  InstrumentType,
} from "@/mock-data/locations";
import { cn } from "@/lib/utils";
import { ModeSwitchInline } from "@/components/dashboard/mode-tabs";

// Status chip metadata (chip-local; the grant cards keep their own copy).
const STATUS_META: Record<GrantStatus, { label: string; cls: string; dot: string }> = {
  open: {
    label: "Open",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  "closing-soon": {
    label: "Closing soon",
    cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    dot: "bg-orange-500 animate-pulse",
  },
  upcoming: {
    label: "Upcoming",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    dot: "bg-blue-500",
  },
  closed: {
    label: "Closed",
    cls: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};

const FUNDING_BUCKETS: { id: FundingSizeBucket; label: string }[] = [
  { id: "any", label: "Any size" },
  { id: "micro", label: "< €100K — Micro" },
  { id: "small", label: "€100K – €500K" },
  { id: "mid", label: "€500K – €2M" },
  { id: "large", label: "€2M – €10M" },
  { id: "mega", label: "> €10M — Mega" },
];

const FUNDER_TYPE_META: Record<FunderType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  government: { label: "Government", icon: Landmark },
  supranational: { label: "Supranational", icon: Globe },
  foundation: { label: "Foundation", icon: Sparkles },
  unknown: { label: "Other", icon: HelpCircle },
};

const INSTRUMENT_META: Record<InstrumentType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  grant: { label: "Grant", icon: HandCoins },
  loan: { label: "Loan", icon: Coins },
  guarantee: { label: "Guarantee", icon: ShieldCheck },
  voucher: { label: "Voucher", icon: Ticket },
  equity: { label: "Equity", icon: TrendingUp },
  mixed: { label: "Mixed", icon: Shuffle },
  unknown: { label: "Unspecified", icon: Receipt },
};

// The search-first hero: a floating, centered command bar. It owns the natural-
// language search, the lens switch (Find grants / Money received / Money awarded)
// and the active-filter chips. Filters themselves live in the offcanvas sidebar;
// the chips here are the quick-access subset. Mounted on the home route only.
//
// `showModes` renders the desktop lens switch (home only). Search always means
// "find grants", so typing in a money lens flips back to discover.
export function GlobeSearch({ showModes = true }: { showModes?: boolean }) {
  const searchQuery = useGrantsStore((s) => s.searchQuery);
  const setSearchQuery = useGrantsStore((s) => s.setSearchQuery);
  const sortBy = useGrantsStore((s) => s.sortBy);
  const setSortBy = useGrantsStore((s) => s.setSortBy);
  const fundingSize = useGrantsStore((s) => s.fundingSize);
  const setFundingSize = useGrantsStore((s) => s.setFundingSize);
  const selectedStatuses = useGrantsStore((s) => s.selectedStatuses);
  const toggleStatus = useGrantsStore((s) => s.toggleStatus);
  const selectedCountry = useGrantsStore((s) => s.selectedCountry);
  const setSelectedCountry = useGrantsStore((s) => s.setSelectedCountry);
  const selectedFunderTypes = useGrantsStore((s) => s.selectedFunderTypes);
  const toggleFunderType = useGrantsStore((s) => s.toggleFunderType);
  const selectedInstrumentTypes = useGrantsStore((s) => s.selectedInstrumentTypes);
  const toggleInstrumentType = useGrantsStore((s) => s.toggleInstrumentType);
  const funders = useGrantsStore((s) => s.funders);
  const panelView = useGrantsStore((s) => s.panelView);
  const setPanelView = useGrantsStore((s) => s.setPanelView);
  const resultsOpen = useGrantsStore((s) => s.resultsOpen);

  const countryName = React.useMemo(() => {
    if (selectedCountry === "all") return null;
    return funders.find((f) => f.country === selectedCountry)?.countryName ?? selectedCountry;
  }, [funders, selectedCountry]);

  const onSearchChange = (v: string) => {
    // Search always means "find grants" — flip back to the discover lens.
    if (v && panelView !== "discover") setPanelView("discover");
    setSearchQuery(v);
  };

  // Grant facets only apply to the discover lens.
  const showFacets = panelView === "discover";
  const hasActiveFacets =
    showFacets &&
    (selectedCountry !== "all" ||
      fundingSize !== "any" ||
      selectedFunderTypes.length > 0 ||
      selectedInstrumentTypes.length > 0 ||
      selectedStatuses.length > 0);

  return (
    <div
      className={cn(
        // Centered over the map; shift right by ~half the drawer width when the
        // drawer is open (desktop) so the bar stays centered in the visible map.
        "pointer-events-none absolute top-4 z-30 flex w-[min(92vw,560px)] -translate-x-1/2 flex-col items-center gap-2 transition-[left] duration-300",
        resultsOpen ? "left-1/2 sm:left-[calc(50%+198px)]" : "left-1/2",
      )}
    >
      {/* Command bar */}
      <div className="pointer-events-auto flex w-full items-center gap-2 rounded-full border bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <SidebarTrigger className="size-8 shrink-0 rounded-full" />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search grants — e.g. “renewable energy R&D for SMEs”"
            aria-label="Search grants and funders"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(
              "h-9 rounded-full border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0",
              searchQuery && "pr-8",
            )}
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 size-7 -translate-y-1/2 rounded-full"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {showFacets && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" title="Sort grants" aria-label="Sort grants">
                  <ArrowUpDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  Sort grants by
                </DropdownMenuLabel>
                <SortItem id="deadline-soonest" current={sortBy} setSortBy={setSortBy} icon={CalendarClock}>
                  Deadline (soonest)
                </SortItem>
                <SortItem id="funding-largest" current={sortBy} setSortBy={setSortBy} icon={Banknote}>
                  Largest funding ceiling
                </SortItem>
                <DropdownMenuSeparator />
                <SortItem id="newest" current={sortBy} setSortBy={setSortBy} icon={CalendarArrowDown}>
                  Newest first
                </SortItem>
                <SortItem id="oldest" current={sortBy} setSortBy={setSortBy} icon={CalendarArrowUp}>
                  Oldest first
                </SortItem>
                <SortItem id="alpha-az" current={sortBy} setSortBy={setSortBy} icon={ArrowDownAZ}>
                  A → Z
                </SortItem>
                <SortItem id="alpha-za" current={sortBy} setSortBy={setSortBy} icon={ArrowUpAZ}>
                  Z → A
                </SortItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" title="Filters" aria-label="Filter grants by status and size">
                  <Layers className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  Status
                </DropdownMenuLabel>
                {(["open", "closing-soon", "upcoming", "closed"] as GrantStatus[]).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleStatus(s);
                    }}
                    className="gap-2"
                  >
                    <span className={cn("inline-block size-2 rounded-full", STATUS_META[s].dot)} />
                    <span className="flex-1">{STATUS_META[s].label}</span>
                    {selectedStatuses.includes(s) && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  Grant size
                </DropdownMenuLabel>
                {FUNDING_BUCKETS.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={(e) => {
                      e.preventDefault();
                      setFundingSize(b.id);
                    }}
                    className="gap-2"
                  >
                    <Banknote className="size-3.5" />
                    <span className="flex-1">{b.label}</span>
                    {fundingSize === b.id && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Lens switch (desktop; mobile uses the bottom ModeTabs) */}
      {showModes && <ModeSwitchInline className="pointer-events-auto w-full" />}

      {/* Active-facet chips (discover lens only) */}
      {hasActiveFacets && (
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1">
          {selectedStatuses.map((s) => (
            <Chip key={`st-${s}`} onClear={() => toggleStatus(s)} className={STATUS_META[s].cls}>
              <span className={cn("inline-block size-1.5 rounded-full", STATUS_META[s].dot)} />
              {STATUS_META[s].label}
            </Chip>
          ))}
          {selectedCountry !== "all" && countryName && (
            <Chip onClear={() => setSelectedCountry("all")}>
              <Globe className="size-3" />
              {countryName}
            </Chip>
          )}
          {selectedFunderTypes.map((t) => {
            const M = FUNDER_TYPE_META[t];
            const Icon = M.icon;
            return (
              <Chip key={`ft-${t}`} onClear={() => toggleFunderType(t)}>
                <Icon className="size-3" />
                {M.label}
              </Chip>
            );
          })}
          {selectedInstrumentTypes.map((t) => {
            const M = INSTRUMENT_META[t];
            const Icon = M.icon;
            return (
              <Chip key={`it-${t}`} onClear={() => toggleInstrumentType(t)}>
                <Icon className="size-3" />
                {M.label}
              </Chip>
            );
          })}
          {fundingSize !== "any" && (
            <Chip onClear={() => setFundingSize("any")}>
              <Banknote className="size-3" />
              {FUNDING_BUCKETS.find((b) => b.id === fundingSize)?.label}
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  onClear,
  className,
}: {
  children: React.ReactNode;
  onClear: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent",
        className,
      )}
    >
      {children}
      <X className="size-3 opacity-70" />
    </button>
  );
}

function SortItem({
  id,
  current,
  setSortBy,
  icon: Icon,
  children,
}: {
  id: GrantSortBy;
  current: GrantSortBy;
  setSortBy: (s: GrantSortBy) => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem onClick={() => setSortBy(id)} className="gap-2">
      <Icon className="size-4" />
      <span className="flex-1">{children}</span>
      {current === id && <Check className="size-4" />}
    </DropdownMenuItem>
  );
}
