"use client";

import * as React from "react";
import {
  Bookmark,
  Clock,
  Search,
  X,
  Loader2,
  ArrowUpDown,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  Check,
  Globe2,
  Sparkles,
  ExternalLink,
  CalendarClock,
  Banknote,
  Target,
  Layers,
  Building2,
  ScrollText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGrantsStore, type GrantSortBy, type FundingSizeBucket } from "@/store/maps-store";
import { fetchGrantProse } from "@/mock-data/locations";
import type {
  Grant,
  GrantStatus,
  InstrumentType,
} from "@/mock-data/locations";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "usehooks-ts";
import { FundingCard } from "@/components/dashboard/funding-card";
import { ModeSwitchInline } from "@/components/dashboard/mode-tabs";

type PanelMode = "all" | "favorites" | "recents";

interface GrantsPanelProps {
  mode?: PanelMode;
}

const panelConfig = {
  all: {
    title: "Discover Grants",
    subtitleSingular: "grant scheme indexed",
    subtitlePlural: "grant schemes indexed",
    emptyIcon: Globe2,
    emptyTitle: "No grants match your filters",
    emptyDescription:
      "Try clearing the sector, region, or instrument filters to widen the search.",
  },
  favorites: {
    title: "Watchlist",
    subtitleSingular: "saved grant",
    subtitlePlural: "saved grants",
    emptyIcon: Bookmark,
    emptyTitle: "Your watchlist is empty",
    emptyDescription:
      "Use the bookmark icon on a grant to keep an eye on its deadline and updates.",
  },
  recents: {
    title: "Recently Viewed",
    subtitleSingular: "grant in history",
    subtitlePlural: "grants in history",
    emptyIcon: Clock,
    emptyTitle: "No recently viewed grants",
    emptyDescription:
      "Open any grant to start building your reviewing history.",
  },
};

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

function symbolFor(currency: string): string {
  switch (currency) {
    case "EUR":
      return "€";
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "JPY":
    case "CNY":
      return "¥";
    default:
      return "";
  }
}

function fmtAmount(amount: number, currency: string | null): string {
  const sym = currency ? symbolFor(currency) : "";
  const prefix = sym || (currency ? `${currency} ` : "");
  if (amount >= 1_000_000_000) return `${prefix}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${prefix}${(amount / 1_000).toFixed(0)}K`;
  return `${prefix}${amount}`;
}

function fmtAmountRange(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min !== null && max !== null) {
    if (min === max) return fmtAmount(max, currency);
    return `${fmtAmount(min, currency)}–${fmtAmount(max, currency)}`;
  }
  if (max !== null) return `up to ${fmtAmount(max, currency)}`;
  if (min !== null) return `from ${fmtAmount(min, currency)}`;
  return null;
}

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function fmtDeadline(
  closesAt: string | null,
  status: GrantStatus,
  applicationMode: Grant["applicationMode"],
): { label: string; tone: "danger" | "warn" | "ok" | "muted" } {
  if (status === "closed") return { label: "Closed", tone: "muted" };
  if (!closesAt) {
    return applicationMode === "rolling"
      ? { label: "Rolling intake", tone: "ok" }
      : { label: "No published deadline", tone: "muted" };
  }
  const days = daysUntil(closesAt);
  if (status === "upcoming") return { label: `Opens in ${Math.max(0, days)}d`, tone: "ok" };
  if (days < 0) return { label: "Closed", tone: "muted" };
  if (days === 0) return { label: "Closes today", tone: "danger" };
  if (days === 1) return { label: "1 day left", tone: "danger" };
  if (days <= 14) return { label: `${days} days left`, tone: "danger" };
  if (days <= 60) return { label: `${days} days left`, tone: "warn" };
  return {
    label: new Date(closesAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    tone: "ok",
  };
}

const INSTRUMENT_LABEL: Record<InstrumentType, string> = {
  grant: "Grant",
  loan: "Loan",
  guarantee: "Guarantee",
  voucher: "Voucher",
  equity: "Equity",
  mixed: "Mixed / blended",
  unknown: "Unspecified instrument",
};

export function MapsPanel({ mode = "all" }: GrantsPanelProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const {
    selectedGrantId,
    searchQuery,
    sortBy,
    fundingSize,
    selectedStatuses,
    toggleSaved,
    setSearchQuery,
    setSortBy,
    setFundingSize,
    toggleStatus,
    selectGrant,
    getFilteredGrants,
    getSavedGrants,
    getRecentGrants,
    isPanelVisible,
    setPanelVisible,
    getGlobalStats,
    metricMode,
    isGrantsListExpanded,
    setGrantsListExpanded,
    funders,
    panelView,
  } = useGrantsStore();

  const isDesktop = useMediaQuery("(min-width: 640px)");

  React.useEffect(() => {
    if (isDesktop && !isPanelVisible) setPanelVisible(true);
  }, [isDesktop, isPanelVisible, setPanelVisible]);

  const stats = getGlobalStats();

  const getGrants = () => {
    switch (mode) {
      case "favorites":
        return getSavedGrants();
      case "recents":
        return getRecentGrants();
      default:
        return getFilteredGrants();
    }
  };

  const rawGrants = getGrants();
  const grants = React.useMemo(() => {
    if (!selectedGrantId) return rawGrants;
    const sel = rawGrants.find((g) => g.id === selectedGrantId);
    if (!sel) return rawGrants;
    return [sel, ...rawGrants.filter((g) => g.id !== selectedGrantId)];
  }, [rawGrants, selectedGrantId]);

  const config = panelConfig[mode];
  const EmptyIcon = config.emptyIcon;

  React.useEffect(() => {
    if (selectedGrantId && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [selectedGrantId]);

  React.useEffect(() => {
    if (selectedGrantId) {
      const stillThere = rawGrants.some((g) => g.id === selectedGrantId);
      if (!stillThere) selectGrant(null);
    }
  }, [rawGrants, selectedGrantId, selectGrant]);

  const handleGrantClick = (g: Grant) => {
    if (selectedGrantId === g.id) selectGrant(null);
    else selectGrant(g.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectGrant(null);
  };

  if (!isPanelVisible) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="absolute left-4 top-4 z-20 sm:hidden size-11 bg-background! dash-floating"
        onClick={() => setPanelVisible(true)}
        aria-label="Open OpenSubsidies panel"
      >
        <Globe2 className="size-5" />
      </Button>
    );
  }

  // Funding views morph the whole card into the funding experience (home route
  // only — Watchlist/Recents keep the discover card).
  if (mode === "all" && (panelView === "received" || panelView === "awarded")) {
    return <FundingCard view={panelView} />;
  }

  let subtitle: string;
  if (mode === "all") {
    if (metricMode === "providers") {
      subtitle = `${funders.length.toLocaleString()} grant providers`;
    } else if (metricMode === "funding") {
      subtitle = "No funding data yet — disbursements not tracked";
    } else {
      subtitle = `${grants.length.toLocaleString()} ${grants.length === 1 ? config.subtitleSingular : config.subtitlePlural}`;
    }
  } else {
    subtitle = `${grants.length} ${grants.length === 1 ? config.subtitleSingular : config.subtitlePlural}`;
  }

  // When the grants list is collapsed, release the bottom anchor so the panel
  // shrinks to its header + filters and the map below becomes interactive.
  const listExpanded = isGrantsListExpanded;

  return (
    <div
      className={cn(
        "absolute left-4 top-4 z-20 flex flex-col bg-background rounded-2xl dash-panel border overflow-hidden w-80 sm:w-[420px]",
        listExpanded ? "bottom-4" : "max-h-[calc(100%-2rem)]",
      )}
    >
      {/* Mode switch (home only) — sits with the card it controls */}
      {mode === "all" && <ModeSwitchInline className="m-2 mb-0" />}

      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-start gap-1.5 min-w-0">
            <SidebarTrigger className="size-7 -ml-1 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-base flex items-center gap-2">
                {mode === "recents" && <Clock className="size-4" />}
                {mode === "favorites" && <Bookmark className="size-4" />}
                {mode === "all" && <Globe2 className="size-4" />}
                {config.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setGrantsListExpanded(!listExpanded)}
              aria-label={listExpanded ? "Collapse list" : "Expand list"}
              title={listExpanded ? "Collapse list" : "Expand list"}
            >
              {listExpanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 sm:hidden"
              onClick={() => setPanelVisible(false)}
              aria-label="Close panel"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Global stats — only on Discover */}
        {mode === "all" && (
          <div className="grid grid-cols-3 gap-1 mt-2">
            <StatPill
              label="Open now"
              value={stats.openNow.toString()}
              accent="emerald"
            />
            <StatPill
              label="Countries"
              value={stats.countriesCovered.toString()}
              accent="brand"
            />
            <StatPill
              label="Funders"
              value={stats.fundersIndexed.toString()}
              accent="muted"
            />
          </div>
        )}
      </div>

      {/* Search + filters */}
      <div className="p-2 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search grants, funders…"
              aria-label="Search grants and funders"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn("pl-8 h-9", searchQuery && "pr-8")}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-9 shrink-0" title="Sort grants" aria-label="Sort grants">
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
              <Button variant="outline" size="icon" className="size-9 shrink-0" title="Filters" aria-label="Filter grants by status and size">
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
        </div>

        {/* Active status chips for quick toggling */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-thin">
          {(["open", "closing-soon", "upcoming"] as GrantStatus[]).map((s) => {
            const active = selectedStatuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? STATUS_META[s].cls
                    : "bg-background text-muted-foreground hover:bg-accent border-border"
                )}
              >
                <span className={cn("inline-block size-1.5 rounded-full", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
              </button>
            );
          })}
          {fundingSize !== "any" && (
            <button
              type="button"
              onClick={() => setFundingSize("any")}
              aria-label={`Clear grant size filter (${FUNDING_BUCKETS.find((b) => b.id === fundingSize)?.label})`}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted text-foreground border-border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-150"
            >
              <Banknote className="size-3" />
              {FUNDING_BUCKETS.find((b) => b.id === fundingSize)?.label}
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible list / detail — collapse to free the map underneath */}
      <Collapsible
        open={listExpanded}
        onOpenChange={setGrantsListExpanded}
        className={cn("flex flex-col min-h-0", listExpanded && "flex-1")}
      >
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 border-b text-xs font-medium hover:bg-accent/50 transition-colors">
          {listExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span>{mode === "all" ? "Discovered grants" : config.title}</span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {grants.length}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {listExpanded ? "Hide" : "Show"}
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex-1 min-h-0 overflow-hidden data-[state=closed]:hidden">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto">
            <div className="p-2 space-y-2">
              {grants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-4">
              <EmptyIcon className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{config.emptyTitle}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                {config.emptyDescription}
              </p>
            </div>
          ) : (
            grants.map((grant) => {
              const funder = funders.find((f) => f.id === grant.funderId);
              const isSelected = selectedGrantId === grant.id;

              if (isSelected) {
                return (
                  <GrantDetail
                    key={grant.id}
                    grant={grant}
                    funderName={funder?.name ?? ""}
                    funderShort={funder?.shortName ?? ""}
                    funderFaviconUrl={funder?.faviconUrl ?? ""}
                    funderHQ={funder?.hq ?? ""}
                    funderType={funder?.type ?? "unknown"}
                    funderCountryName={funder?.countryName ?? ""}
                    onClose={handleClose}
                    onToggleSaved={() => toggleSaved(grant.id)}
                  />
                );
              }

              return (
                <GrantCard
                  key={grant.id}
                  grant={grant}
                  funderName={funder?.name ?? ""}
                  funderShort={funder?.shortName ?? ""}
                  funderFaviconUrl={funder?.faviconUrl ?? ""}
                  onClick={() => handleGrantClick(grant)}
                  onToggleSaved={(e) => {
                    e.stopPropagation();
                    toggleSaved(grant.id);
                  }}
                />
              );
            })
          )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "brand" | "muted";
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    brand: "bg-foreground/5 text-foreground border-border",
    muted: "bg-muted text-foreground border-border",
  } as const;
  return (
    <div className={cn("rounded-md border px-2 py-1.5", tones[accent])}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 leading-none">{label}</div>
      <div className="text-sm font-semibold mt-1 tabular-nums leading-none">{value}</div>
    </div>
  );
}

function GrantCard({
  grant,
  funderName,
  funderShort,
  funderFaviconUrl,
  onClick,
  onToggleSaved,
}: {
  grant: Grant;
  funderName: string;
  funderShort: string;
  funderFaviconUrl: string;
  onClick: () => void;
  onToggleSaved: (e: React.MouseEvent) => void;
}) {
  const dl = fmtDeadline(grant.closesAt, grant.status, grant.applicationMode);
  const status = STATUS_META[grant.status];
  const amountText = fmtAmountRange(grant.minAmount, grant.maxAmount, grant.currency);
  const instrumentLabel = INSTRUMENT_LABEL[grant.instrumentType];

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border p-3 cursor-pointer transition-colors duration-150 hover:bg-accent/50 card-inner-stroke overflow-hidden",
        grant.status === "closing-soon" && "border-orange-500/40"
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${grant.name} — ${grant.status === "closed" ? "closed" : "view details"}`}
    >
      {/* Favicon backdrop watermark — ported 1:1 from dirstarter's <CardIcon>.
          Renders the funder's OFFICIAL favicon giant, rotated 12°, masked
          diagonally. Sits behind all content at 10% opacity, decorative. */}
      <CardFaviconBackdrop faviconUrl={funderFaviconUrl} alt={funderName} />

      <div className="relative z-10 flex items-start gap-3">
        {/* Inline tile — funder's official favicon, contained, matches
            dirstarter's <Favicon contained /> in the CardHeader. */}
        <FunderFavicon
          src={funderFaviconUrl}
          alt={funderName}
          className="size-9 shrink-0 rounded-lg border bg-background"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground">{funderShort}</span>
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium",
              status.cls
            )}>
              <span className={cn("inline-block size-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
          </div>
          <h3 className="font-medium text-sm leading-snug mt-0.5 line-clamp-2">
            {grant.name}
          </h3>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {funderName}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 -mr-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 relative before:absolute before:inset-[-6px] before:content-[''] transition-transform duration-150 active:scale-[0.96]"
            onClick={onToggleSaved}
            title={grant.isSaved ? "Remove from watchlist" : "Save to watchlist"}
            aria-label={grant.isSaved ? `Remove ${grant.name} from watchlist` : `Save ${grant.name} to watchlist`}
            aria-pressed={grant.isSaved}
          >
            <Bookmark
              className={cn(
                "size-3.5 transition-colors duration-150",
                grant.isSaved && "fill-foreground text-foreground"
              )}
            />
          </Button>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-3 flex-wrap text-xs">
        {amountText && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Banknote className="size-3" />
            <span className="tabular-nums">{amountText}</span>
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium tabular-nums",
            dl.tone === "danger" && "text-orange-600 dark:text-orange-400",
            dl.tone === "warn" && "text-amber-600 dark:text-amber-400",
            dl.tone === "ok" && "text-foreground/80",
            dl.tone === "muted" && "text-muted-foreground"
          )}
        >
          <CalendarClock className="size-3" />
          {dl.label}
        </span>
      </div>

      <div className="relative z-10 flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px] h-5">
          {instrumentLabel}
        </Badge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CardFaviconBackdrop — port of dirstarter's <CardIcon> watermark.
//
// dirstarter source (components/common/card.tsx + grant-scheme-card.tsx):
//   <CardIcon>
//     <Favicon src={faviconUrl} title={...} />   // mix-blend-multiply / dark:mix-blend-normal
//   </CardIcon>
// where CardIcon = absolute inset-px overflow-clip rounded-sm opacity-10
//                  pointer-events-none, with child = -top-20 -right-20 -z-10
//                  size-60 rotate-12 mask-b-from-25 mask-l-from-25.
//
// We render the funder's OFFICIAL favicon (auto-derived from each funder's
// `website` via Google's S2 favicon service in mock-data/locations.ts).
// The <img> tag is used directly (rather than next/image) because the asset
// is purely decorative and we want zero LCP / config friction with the
// remotePatterns allowlist.
// ─────────────────────────────────────────────────────────────────────────────
function CardFaviconBackdrop({
  faviconUrl,
  alt,
  size = "card",
}: {
  faviconUrl: string;
  alt: string;
  size?: "card" | "detail";
}) {
  if (!faviconUrl) return null;
  return (
    <div
      aria-hidden="true"
      className={cn("gc-favicon-bg", size === "detail" && "gc-favicon-bg-detail")}
    >
      <div className="gc-favicon-bg-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="gc-favicon-bg-img"
          // If the favicon ever 404s we just hide the watermark — no
          // emoji fallback per product requirement.
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
          data-funder={alt}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FunderFavicon — port of dirstarter's `<Favicon contained />` (used in the
// CardHeader inline tile next to the title). Renders the funder's official
// favicon in a contained tile that matches the existing card aesthetics.
// On image error, falls back to a neutral landmark glyph (NOT a country flag,
// per product requirement).
// ─────────────────────────────────────────────────────────────────────────────
function FunderFavicon({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [errored, setErrored] = React.useState(false);
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden",
        className
      )}
    >
      {src && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ? `${alt} logo` : "Funder logo"}
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="size-[60%] object-contain rounded-[3px] mix-blend-multiply dark:mix-blend-normal"
        />
      ) : (
        // Neutral landmark — never a country flag.
        <Building2 className="size-1/2 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

function GrantDetail({
  grant,
  funderName,
  funderShort,
  funderFaviconUrl,
  funderHQ,
  funderType,
  funderCountryName,
  onClose,
  onToggleSaved,
}: {
  grant: Grant;
  funderName: string;
  funderShort: string;
  funderFaviconUrl: string;
  funderHQ: string;
  funderType: string;
  funderCountryName: string;
  onClose: (e: React.MouseEvent) => void;
  onToggleSaved: () => void;
}) {
  const [isOpening, setIsOpening] = React.useState(false);
  // Bridge into the funding view, scoped to this grant's funder.
  const setPanelView = useGrantsStore((s) => s.setPanelView);
  const setFundingScope = useGrantsStore((s) => s.setFundingScope);
  const selectFundingEntity = useGrantsStore((s) => s.selectFundingEntity);
  // Prose is not in the lean catalog; fetch it on demand for the detail card.
  const [prose, setProse] = React.useState(grant.prose);
  React.useEffect(() => {
    setProse(grant.prose);
    if (grant.prose) return;
    let cancelled = false;
    fetchGrantProse(grant.id).then((p) => {
      if (!cancelled) setProse(p);
    });
    return () => {
      cancelled = true;
    };
  }, [grant.id, grant.prose]);
  const dl = fmtDeadline(grant.closesAt, grant.status, grant.applicationMode);
  const status = STATUS_META[grant.status];
  const amountText = fmtAmountRange(grant.minAmount, grant.maxAmount, grant.currency);
  const instrumentLabel = INSTRUMENT_LABEL[grant.instrumentType];
  const applyHref = grant.applicationUrl ?? grant.url;
  const openSub = grant.opensAt
    ? `Opens ${new Date(grant.opensAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : grant.applicationMode === "rolling"
      ? "Rolling intake"
      : undefined;
  const amountSub = grant.fundingRatePct !== null
    ? `${grant.fundingRatePct}% of project costs`
    : undefined;

  const handleOpenPortal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpening(true);
    setTimeout(() => {
      window.open(applyHref, "_blank", "noopener,noreferrer");
      setIsOpening(false);
    }, 350);
  };

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border-2 overflow-hidden card-inner-stroke",
        "border-foreground bg-accent"
      )}
    >
      {/* Favicon watermark — same backdrop as the list cards, scaled for the
          larger detail surface. Decorative; does not interfere with content. */}
      <CardFaviconBackdrop
        faviconUrl={funderFaviconUrl}
        alt={funderName}
        size="detail"
      />

      <div className="relative z-10 p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <FunderFavicon
              src={funderFaviconUrl}
              alt={funderName}
              className="size-11 shrink-0 rounded-lg border bg-background"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {funderShort}
                </span>
                <span className="text-muted-foreground">·</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium",
                    status.cls
                  )}
                >
                  <span className={cn("inline-block size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </span>
              </div>
              <h3 className="font-semibold text-base leading-tight mt-1">
                {grant.name}
              </h3>
              <p className="text-xs mt-1 text-muted-foreground">
                {instrumentLabel}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 -mr-1 -mt-1"
            onClick={onClose}
            aria-label="Close grant detail"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Funder row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-3 border-b">
          <Building2 className="size-3.5 shrink-0" />
          <span className="truncate">
            <span className="text-foreground font-medium">{funderName}</span>
            {funderHQ && (
              <>
                <span className="mx-1.5">·</span>
                <span>{funderHQ}</span>
              </>
            )}
            {funderCountryName && (
              <>
                <span className="mx-1.5">·</span>
                <span>{funderCountryName}</span>
              </>
            )}
            <span className="mx-1.5">·</span>
            <span className="capitalize">{funderType}</span>
          </span>
        </div>

        {/* Bridge: jump to this funder's payouts in the funding view */}
        <button
          type="button"
          onClick={() => {
            const cc = grant.funderId.split("/")[0];
            setPanelView("awarded");
            setFundingScope(cc);
            selectFundingEntity(grant.funderId);
          }}
          className="mb-4 flex w-full items-center justify-between gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs transition-colors hover:bg-accent"
        >
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="size-3.5" />
            See what{" "}
            <span className="font-medium text-foreground">
              {funderShort || funderName}
            </span>{" "}
            has paid out
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        </button>

        {/* Short description */}
        {grant.description && (
          <p className="text-sm leading-relaxed mb-4">{grant.description}</p>
        )}

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <MetricBox
            icon={CalendarClock}
            label="Deadline"
            value={dl.label}
            tone={dl.tone}
            sub={openSub}
          />
          {amountText ? (
            <MetricBox
              icon={Banknote}
              label="Funding amount"
              value={amountText}
              sub={amountSub}
            />
          ) : (
            <MetricBox
              icon={Banknote}
              label="Funding amount"
              value="Not stated"
              tone="muted"
            />
          )}
        </div>

        {/* About this scheme — full prose (lazy-loaded) */}
        {prose && prose !== grant.description && (
          <Section icon={ScrollText} title="About this scheme">
            <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-line">
              {prose}
            </div>
          </Section>
        )}

        {/* Documents (only when present in source) */}
        {grant.documents.length > 0 && (
          <Section icon={ScrollText} title="Documents">
            <ul className="space-y-1.5">
              {grant.documents.map((d, i) => (
                <li key={`${d.url}-${i}`} className="flex items-start gap-2 text-xs leading-relaxed">
                  <ChevronRight className="size-3.5 shrink-0 mt-0.5 text-foreground" />
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:underline break-all"
                  >
                    {d.title || d.url}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Identifiers (only when present in source) */}
        {(grant.schemeCode || grant.program) && (
          <Section icon={Target} title="Identifiers">
            <div className="space-y-1 text-xs text-muted-foreground">
              {grant.program && (
                <div>
                  <span className="text-foreground/80 font-medium">Program:</span>{" "}
                  {grant.program}
                </div>
              )}
              {grant.schemeCode && (
                <div>
                  <span className="text-foreground/80 font-medium">Scheme code:</span>{" "}
                  <span className="tabular-nums">{grant.schemeCode}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* CTAs */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 transition-transform duration-150 active:scale-[0.96]"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved();
            }}
            aria-pressed={grant.isSaved}
          >
            <Bookmark
              className={cn(
                "size-4 mr-2 transition-colors duration-150",
                grant.isSaved && "fill-foreground text-foreground"
              )}
            />
            {grant.isSaved ? "Saved" : "Watchlist"}
          </Button>
          <Button
            size="sm"
            className="flex-1 transition-transform duration-150 active:scale-[0.96]"
            onClick={handleOpenPortal}
            disabled={isOpening}
          >
            {isOpening ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="size-4 mr-2" />
            )}
            {grant.status === "upcoming" ? "Funder portal" : "Apply"}
          </Button>
        </div>

        {/* AI connector hint */}
        <div className="mt-3 p-2.5 rounded-md border border-dashed border-border bg-muted/40">
          <div className="flex items-start gap-2">
            <Sparkles className="size-3.5 mt-0.5 text-foreground shrink-0" />
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              Open this scheme in your AI assistant via the{" "}
              <span className="font-medium text-foreground">OpenSubsidies connector</span>{" "}
              to auto-match your company and draft a tailored application.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        <Icon className="size-3" />
        {title}
      </h4>
      {children}
    </div>
  );
}

function MetricBox({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warn" | "ok" | "muted";
}) {
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div
        className={cn(
          "font-semibold text-sm leading-tight mt-1.5 tabular-nums",
          tone === "danger" && "text-orange-600 dark:text-orange-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  );
}

