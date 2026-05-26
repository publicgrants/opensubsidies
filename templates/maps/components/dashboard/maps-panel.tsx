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
  TrendingUp,
  Check,
  Globe2,
  Sparkles,
  ExternalLink,
  CalendarClock,
  Banknote,
  Target,
  Layers,
  Users2,
  Award,
  Building2,
  ScrollText,
  History,
  ChevronRight,
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
import {
  categories,
  funders,
  tags as allTags,
  type Grant,
  type GrantStatus,
} from "@/mock-data/locations";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "usehooks-ts";

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

function fmtCurrency(n: number) {
  if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function fmtBudget(n: number) {
  if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function fmtDeadline(iso: string, status: GrantStatus): { label: string; tone: "danger" | "warn" | "ok" | "muted" } {
  const days = daysUntil(iso);
  if (status === "closed") return { label: "Closed", tone: "muted" };
  if (status === "upcoming") return { label: `Opens in ${Math.max(0, days)}d`, tone: "ok" };
  if (days < 0) return { label: "Closed", tone: "muted" };
  if (days === 0) return { label: "Closes today", tone: "danger" };
  if (days === 1) return { label: "1 day left", tone: "danger" };
  if (days <= 14) return { label: `${days} days left`, tone: "danger" };
  if (days <= 60) return { label: `${days} days left`, tone: "warn" };
  return {
    label: new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    tone: "ok",
  };
}

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

  const getTagName = (id: string) => allTags.find((t) => t.id === id)?.name || id;

  if (!isPanelVisible) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="absolute left-4 top-4 z-20 sm:hidden size-11 bg-background! dash-floating"
        onClick={() => setPanelVisible(true)}
        aria-label="Open Grant.com panel"
      >
        <Globe2 className="size-5" />
      </Button>
    );
  }

  const subtitle =
    mode === "all"
      ? `${grants.length.toLocaleString()} ${grants.length === 1 ? config.subtitleSingular : config.subtitlePlural}`
      : `${grants.length} ${grants.length === 1 ? config.subtitleSingular : config.subtitlePlural}`;

  return (
    <div className="absolute left-4 top-4 bottom-4 z-20 flex flex-col bg-background rounded-2xl dash-panel border overflow-hidden w-80 sm:w-[420px]">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              {mode === "recents" && <Clock className="size-4" />}
              {mode === "favorites" && <Bookmark className="size-4" />}
              {mode === "all" && <Globe2 className="size-4" />}
              {config.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-1">
            <SidebarTrigger className="size-7" />
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
              label="Annual pool"
              value={fmtBudget(stats.totalAnnualBudgetEUR)}
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
              placeholder="Search grants, funders, sectors…"
              aria-label="Search grants, funders, sectors"
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
              <SortItem id="match-score" current={sortBy} setSortBy={setSortBy} icon={Sparkles}>
                Best match for me
              </SortItem>
              <SortItem id="funding-largest" current={sortBy} setSortBy={setSortBy} icon={Banknote}>
                Largest funding ceiling
              </SortItem>
              <SortItem id="most-allocated" current={sortBy} setSortBy={setSortBy} icon={TrendingUp}>
                Largest annual pool
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

      {/* List / detail */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
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
              const sector = categories.find((c) => c.id === grant.sectorId);
              const funder = funders.find((f) => f.id === grant.funderId);
              const isSelected = selectedGrantId === grant.id;

              if (isSelected) {
                return (
                  <GrantDetail
                    key={grant.id}
                    grant={grant}
                    sectorName={sector?.name ?? "Sector"}
                    sectorColor={sector?.color ?? "#6b7280"}
                    funderName={funder?.name ?? ""}
                    funderShort={funder?.shortName ?? ""}
                    funderFaviconUrl={funder?.faviconUrl ?? ""}
                    funderHQ={funder?.hq ?? ""}
                    funderType={funder?.type ?? "agency"}
                    onClose={handleClose}
                    onToggleSaved={() => toggleSaved(grant.id)}
                    getTagName={getTagName}
                  />
                );
              }

              return (
                <GrantCard
                  key={grant.id}
                  grant={grant}
                  mode={mode}
                  sectorName={sector?.name ?? "Sector"}
                  sectorColor={sector?.color ?? "#6b7280"}
                  funderName={funder?.name ?? ""}
                  funderShort={funder?.shortName ?? ""}
                  funderFaviconUrl={funder?.faviconUrl ?? ""}
                  onClick={() => handleGrantClick(grant)}
                  onToggleSaved={(e) => {
                    e.stopPropagation();
                    toggleSaved(grant.id);
                  }}
                  getTagName={getTagName}
                />
              );
            })
          )}
        </div>
      </div>
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
  mode,
  sectorName,
  sectorColor,
  funderName,
  funderShort,
  funderFaviconUrl,
  onClick,
  onToggleSaved,
  getTagName,
}: {
  grant: Grant;
  mode: PanelMode;
  sectorName: string;
  sectorColor: string;
  funderName: string;
  funderShort: string;
  funderFaviconUrl: string;
  onClick: () => void;
  onToggleSaved: (e: React.MouseEvent) => void;
  getTagName: (id: string) => string;
}) {
  const dl = fmtDeadline(grant.deadline, grant.status);
  const status = STATUS_META[grant.status];

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
          <p className="text-[11px] text-muted-foreground truncate mt-0.5" style={{ color: sectorColor }}>
            {sectorName}
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
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Banknote className="size-3" />
          <span className="tabular-nums">
            {fmtCurrency(grant.fundingMinEUR)}–{fmtCurrency(grant.fundingMaxEUR)}
          </span>
        </span>
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
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Sparkles className="size-3" />
          <span className="tabular-nums">{grant.matchScore}% match</span>
        </span>
      </div>

      {grant.tags.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-1">
          {grant.tags.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px] h-5">
              {getTagName(t)}
            </Badge>
          ))}
          {grant.tags.length > 3 && (
            <Badge variant="outline" className="text-[10px] h-5">
              +{grant.tags.length - 3}
            </Badge>
          )}
        </div>
      )}
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
  sectorName,
  sectorColor,
  funderName,
  funderShort,
  funderFaviconUrl,
  funderHQ,
  funderType,
  onClose,
  onToggleSaved,
  getTagName,
}: {
  grant: Grant;
  sectorName: string;
  sectorColor: string;
  funderName: string;
  funderShort: string;
  funderFaviconUrl: string;
  funderHQ: string;
  funderType: string;
  onClose: (e: React.MouseEvent) => void;
  onToggleSaved: () => void;
  getTagName: (id: string) => string;
}) {
  const [isOpening, setIsOpening] = React.useState(false);
  const dl = fmtDeadline(grant.deadline, grant.status);
  const status = STATUS_META[grant.status];

  const handleOpenPortal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpening(true);
    // External tab open
    setTimeout(() => {
      window.open(grant.applicationUrl, "_blank", "noopener,noreferrer");
      setIsOpening(false);
    }, 350);
  };

  // Allocation history mini-bars
  const maxAlloc = Math.max(...grant.allocations.map((a) => a.totalAwardedEUR), 1);

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
              <p className="text-xs mt-1" style={{ color: sectorColor }}>
                {sectorName}
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
            <span className="mx-1.5">·</span>
            <span>{funderHQ}</span>
            <span className="mx-1.5">·</span>
            <span className="capitalize">{funderType}</span>
          </span>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed mb-4">{grant.description}</p>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <MetricBox
            icon={CalendarClock}
            label="Deadline"
            value={dl.label}
            tone={dl.tone}
            sub={`Opened ${new Date(grant.openingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
          />
          <MetricBox
            icon={Banknote}
            label="Grant size"
            value={`${fmtCurrency(grant.fundingMinEUR)} – ${fmtCurrency(grant.fundingMaxEUR)}`}
            sub={`${grant.cofinancingRate}% co-financing`}
          />
          <MetricBox
            icon={Sparkles}
            label="Fit score"
            value={`${grant.matchScore}%`}
            sub="Match for my company"
          />
          <MetricBox
            icon={Award}
            label="Last cycle"
            value={`${grant.awardCountLastCycle} awards`}
            sub={`${grant.successRate.toFixed(1)}% success rate`}
          />
        </div>

        {/* Tags */}
        {grant.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {grant.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[11px]">
                {getTagName(t)}
              </Badge>
            ))}
          </div>
        )}

        {/* Eligibility */}
        <Section icon={Users2} title="Eligible applicants">
          <div className="flex flex-wrap gap-1">
            {grant.eligibleEntities.map((e) => (
              <span
                key={e}
                className="inline-flex items-center rounded-md border bg-background px-2 py-0.5 text-[11px] capitalize"
              >
                {e}
              </span>
            ))}
          </div>
        </Section>

        <Section icon={Globe2} title="Geographic scope">
          <p className="text-xs text-muted-foreground">{grant.geographicScopeLabel}</p>
        </Section>

        {/* Requirements */}
        {grant.requirements.length > 0 && (
          <Section icon={ScrollText} title="Key requirements">
            <ul className="space-y-1.5">
              {grant.requirements.map((r, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed">
                  <ChevronRight className="size-3.5 shrink-0 mt-0.5 text-foreground" />
                  <span className="text-muted-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Allocation history */}
        {grant.allocations.length > 0 && (
          <Section icon={History} title="Allocation history">
            <div className="space-y-1.5">
              {grant.allocations.slice(0, 4).map((a) => {
                const w = (a.totalAwardedEUR / maxAlloc) * 100;
                return (
                  <div key={a.year} className="flex items-center gap-2 text-[11px]">
                    <span className="w-9 tabular-nums text-muted-foreground">{a.year}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground rounded-full"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <span className="tabular-nums font-medium w-14 text-right">
                      {fmtBudget(a.totalAwardedEUR)}
                    </span>
                    <span className="tabular-nums text-muted-foreground w-12 text-right">
                      {a.awardCount}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                <span className="w-9" />
                <span className="flex-1" />
                <span className="w-14 text-right">awarded</span>
                <span className="w-12 text-right">awards</span>
              </div>
            </div>
          </Section>
        )}

        {/* Notable awardees */}
        {grant.notableAwardees.length > 0 && (
          <Section icon={Target} title="Notable awardees">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {grant.notableAwardees.join(" · ")}
            </p>
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
              <span className="font-medium text-foreground">Grant.com connector</span>{" "}
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

