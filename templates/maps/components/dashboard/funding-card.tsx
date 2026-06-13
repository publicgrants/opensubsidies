"use client";

import * as React from "react";
import {
  X,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  MapPin,
  Coins,
  Hash,
} from "lucide-react";
import { subdivisionLabel } from "@/mock-data/subdivisions";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ModeSwitchInline } from "@/components/dashboard/mode-tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useGrantsStore, type PanelView } from "@/store/maps-store";
import {
  CURRENCY_SYMBOL,
  DISPLAY_CURRENCIES,
  FX_AS_OF,
  fromEur,
  type DisplayCurrency,
} from "@/lib/fx-rates";
import type {
  Funder,
  FundingEntity,
  FundingRecipientYear,
} from "@/mock-data/locations";

type FundingView = "received" | "awarded";

// ── Money formatting ────────────────────────────────────────────────────────
function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return Math.round(n).toString();
}
function fmtEur(eur: number | null, cur: DisplayCurrency): string {
  if (eur == null) return "—";
  const body = compact(fromEur(eur, cur));
  return cur === "NOK" ? `${body} kr` : `${CURRENCY_SYMBOL[cur]}${body}`;
}
function fmtNative(amount: number | null, currency: string | null): string | null {
  if (amount == null || !currency) return null;
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  const body = compact(amount);
  return sym && currency !== "NOK" && currency !== "SEK"
    ? `${sym}${body}`
    : `${body} ${currency}`;
}

const COMPLETENESS_CHIP: Record<string, { label: string; cls: string; hint: string }> = {
  threshold_capped: {
    label: "capped",
    cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    hint: "Awards above a public-disclosure threshold only — totals are a floor.",
  },
  sample: {
    label: "sample",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    hint: "Partial sample — not all awards collected yet.",
  },
  partial: {
    label: "partial",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    hint: "Coverage is partial — not all awards collected yet.",
  },
  full: {
    label: "≈ full",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    hint: "Coverage believed reasonably complete for this source.",
  },
};

function countryNameOf(funders: Funder[], code: string): string {
  if (code === "ALL") return "All countries";
  const f = funders.find((x) => x.country === code);
  return f?.countryName ?? code;
}

// The funding face of the landing-page card. Self-contained: reads funding state
// from the store and renders hero + currency selector + coverage + leaderboard.
// MapsPanel delegates here when panelView is a funding view (home route only).
export function FundingCard({ view }: { view: FundingView }) {
  const funders = useGrantsStore((s) => s.funders);
  const displayCurrency = useGrantsStore((s) => s.displayCurrency);
  const setDisplayCurrency = useGrantsStore((s) => s.setDisplayCurrency);
  const fundingScope = useGrantsStore((s) => s.fundingScope);
  const setFundingScope = useGrantsStore((s) => s.setFundingScope);
  const selectedId = useGrantsStore((s) => s.selectedFundingEntityId);
  const selectFundingEntity = useGrantsStore((s) => s.selectFundingEntity);
  const listExpanded = useGrantsStore((s) => s.isGrantsListExpanded);
  const setGrantsListExpanded = useGrantsStore((s) => s.setGrantsListExpanded);
  const setPanelVisible = useGrantsStore((s) => s.setPanelVisible);
  // Read the funding caches directly (deriving below) so the card re-renders
  // when data lands, without returning fresh arrays from a selector.
  const fundingAggregates = useGrantsStore((s) => s.fundingAggregates);
  const fundingLeaderboards = useGrantsStore((s) => s.fundingLeaderboards);
  // Subdivision (Fylke) layer state.
  const subdivisionMetric = useGrantsStore((s) => s.subdivisionMetric);
  const setSubdivisionMetric = useGrantsStore((s) => s.setSubdivisionMetric);
  const subdivisionLevel = useGrantsStore((s) => s.subdivisionLevel);
  const setSubdivisionLevel = useGrantsStore((s) => s.setSubdivisionLevel);
  const fundingSubdivisions = useGrantsStore((s) => s.fundingSubdivisions);
  const fundingProviderId = useGrantsStore((s) => s.fundingProviderId);
  const setFundingProvider = useGrantsStore((s) => s.setFundingProvider);

  const scope = fundingScope ?? "ALL";
  const isFylkeScope = scope.startsWith("NO-");
  const isKommuneScope = /^\d{4}$/.test(scope); // a clicked kommune number
  const isSubdivScope = isFylkeScope || isKommuneScope;
  const aggregate = fundingAggregates[view] ?? null;
  const leaderboard = fundingLeaderboards[`${view}|${scope}`] ?? [];
  // Hero row: a country row for country scope, or a subdivision row for a Fylke
  // (NO-xx) / Kommune (4-digit) scope, read from the matching-level NO rollup.
  const subsForScope =
    fundingSubdivisions[`${view}|NO|${isKommuneScope ? "kommune" : "fylke"}`] ??
    [];
  const subdivRow = isSubdivScope
    ? (subsForScope.find((d) => d.subdivision === scope) ?? null)
    : null;
  const scopeRow = isSubdivScope
    ? subdivRow
      ? {
          sumEur: subdivRow.sumEur,
          awardCount: subdivRow.awardCount,
          medianEur: subdivRow.medianEur,
          nativeCurrency: subdivRow.nativeCurrency,
          sumNative: subdivRow.sumNative,
        }
      : null
    : (aggregate?.countries.find((c) => c.country === scope) ?? null);
  const coverage =
    scope !== "ALL" && !isSubdivScope
      ? (aggregate?.coverage.find((c) => c.country === scope) ?? null)
      : null;

  // The Fylke choropleth is on screen when focused on Norway or drilled into a
  // provider — surface the metric (€ / count) toggle then.
  const showMetricToggle =
    !!fundingProviderId || scope === "NO" || isSubdivScope;
  const providerFunder = fundingProviderId
    ? (funders.find((f) => f.id === fundingProviderId) ?? null)
    : null;
  const providerReceivers = fundingProviderId
    ? (fundingLeaderboards[`received|${fundingProviderId}`] ?? [])
    : [];
  const providerSubs = fundingProviderId
    ? (fundingSubdivisions[`received|${fundingProviderId}|${subdivisionLevel}`] ??
      [])
    : [];
  const providerSumEur = providerSubs.reduce((a, d) => a + d.sumEur, 0);
  const providerCount = providerSubs.reduce((a, d) => a + d.awardCount, 0);

  // The list to render: a provider's top receivers when drilled in, else the
  // scope leaderboard. Re-sort by award count when the count metric is active
  // (the rows are top-50 by amount; this re-orders that set — a documented
  // approximation, exact top-by-count would need a separate rollup).
  const activeLeaderboard = fundingProviderId ? providerReceivers : leaderboard;
  const displayLeaderboard =
    subdivisionMetric === "count" && showMetricToggle
      ? [...activeLeaderboard].sort((a, b) => b.awardCount - a.awardCount)
      : activeLeaderboard;
  const selectedEntity = selectedId
    ? (activeLeaderboard.find((e) => e.entityId === selectedId) ?? null)
    : null;

  const Icon = fundingProviderId
    ? ArrowDownToLine
    : view === "received"
      ? ArrowDownToLine
      : ArrowUpFromLine;
  const title = view === "received" ? "Money received" : "Money awarded";
  const verb = view === "received" ? "received" : "paid out";
  const entityNoun = view === "received" ? "recipients" : "funders";

  // Provider drill-down overrides the chrome: the card becomes "where THIS
  // funder's money flows" + its top receivers.
  const headerTitle = providerFunder ? providerFunder.shortName : title;
  const heroSumEur = fundingProviderId ? providerSumEur : (scopeRow?.sumEur ?? 0);
  const heroCount = fundingProviderId
    ? providerCount
    : (scopeRow?.awardCount ?? 0);
  const heroMedian = fundingProviderId ? null : (scopeRow?.medianEur ?? null);
  const heroVerb = fundingProviderId ? "flows to Norwegian recipients" : verb;

  return (
    <div
      className={cn(
        "absolute left-4 top-4 z-20 flex flex-col bg-background rounded-2xl dash-panel border overflow-hidden w-80 sm:w-[420px]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        listExpanded ? "bottom-4" : "max-h-[calc(100%-2rem)]",
      )}
    >
      {/* Mode switch — sits with the card it controls */}
      <ModeSwitchInline className="mx-3 mt-3" />

      {/* Header + hero */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <SidebarTrigger className="size-7 -ml-1 shrink-0" />
            <h2 className="font-semibold text-base flex items-center gap-2 truncate">
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{headerTitle}</span>
            </h2>
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

        {/* Hero number */}
        {aggregate == null ? (
          <div className="py-3 text-sm text-muted-foreground">Loading funding…</div>
        ) : (
          <div>
            <div
              className="flex items-baseline gap-1.5"
              title={
                fmtNative(scopeRow?.sumNative ?? null, scopeRow?.nativeCurrency ?? null) ??
                undefined
              }
            >
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ≈ {fmtEur(heroSumEur, displayCurrency)}
              </span>
              <span className="text-sm text-muted-foreground">{heroVerb}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              across {heroCount.toLocaleString()} awards
              {heroMedian != null && (
                <> · median {fmtEur(heroMedian, displayCurrency)}</>
              )}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
              observed — a floor, not a complete figure
              <span
                className="cursor-help"
                aria-label="About this data"
                title={`Totals are observed disclosures, not complete. Coverage varies by country (capped / sample / partial). Converted to ${displayCurrency} at indicative rates as of ${FX_AS_OF}.`}
              >
                <Info className="size-3" />
              </span>
            </p>
          </div>
        )}

        {/* Currency selector + scope */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center rounded-lg bg-sidebar-accent p-0.5">
            {DISPLAY_CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDisplayCurrency(c)}
                aria-pressed={displayCurrency === c}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  displayCurrency === c
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {scope !== "ALL" && coverage && COMPLETENESS_CHIP[coverage.completeness] && (
              <span
                title={COMPLETENESS_CHIP[coverage.completeness].hint}
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  COMPLETENESS_CHIP[coverage.completeness].cls,
                )}
              >
                {COMPLETENESS_CHIP[coverage.completeness].label}
              </span>
            )}
            {fundingProviderId ? (
              <button
                type="button"
                onClick={() => setFundingProvider(null)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                aria-label="Clear provider drill-down"
              >
                provider flow
                <X className="size-3" />
              </button>
            ) : scope === "ALL" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3" /> All countries
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFundingScope(isSubdivScope ? "NO" : null)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                aria-label={
                  isSubdivScope
                    ? `Back to Norway from ${scope}`
                    : `Clear ${countryNameOf(funders, scope)} filter`
                }
              >
                {isFylkeScope
                  ? subdivisionLabel(scope)
                  : isKommuneScope
                    ? `Kommune ${scope}`
                    : countryNameOf(funders, scope)}
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Granularity toggle — Fylke ↔ Kommune choropleth on the map */}
        {showMetricToggle && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Level
            </span>
            <div className="inline-flex items-center rounded-lg bg-sidebar-accent p-0.5">
              {(
                [
                  ["fylke", "Fylke"],
                  ["kommune", "Kommune"],
                ] as const
              ).map(([lvl, label]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSubdivisionLevel(lvl)}
                  aria-pressed={subdivisionLevel === lvl}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                    subdivisionLevel === lvl
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* € / count metric toggle — drives the choropleth shading + ranks */}
        {showMetricToggle && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Shade by
            </span>
            <div className="inline-flex items-center rounded-lg bg-sidebar-accent p-0.5">
              <button
                type="button"
                onClick={() => setSubdivisionMetric("sum")}
                aria-pressed={subdivisionMetric === "sum"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  subdivisionMetric === "sum"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Coins className="size-3" /> Amount
              </button>
              <button
                type="button"
                onClick={() => setSubdivisionMetric("count")}
                aria-pressed={subdivisionMetric === "count"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  subdivisionMetric === "count"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Hash className="size-3" /> Awards
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible leaderboard — prominent collapse control */}
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
          <span className="capitalize">
            {fundingProviderId ? "Top receivers" : `Top ${entityNoun}`}
          </span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {listExpanded ? "Hide" : "Show"}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent className="flex-1 min-h-0 overflow-hidden data-[state=closed]:hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-2 space-y-1.5">
              {selectedEntity ? (
                <EntityDetail
                  entity={selectedEntity}
                  view={fundingProviderId ? "received" : view}
                  currency={displayCurrency}
                  onBack={() => selectFundingEntity(null)}
                />
              ) : displayLeaderboard.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {aggregate == null
                    ? "Loading…"
                    : fundingProviderId
                      ? "No mapped receivers for this funder yet."
                      : `No ${entityNoun} for this selection yet.`}
                </div>
              ) : (
                displayLeaderboard.map((e) => {
                  // In the awarded view, a funder row drills into that provider's
                  // money-flow (national or regional). Otherwise show entity detail.
                  const drillProvider =
                    !fundingProviderId &&
                    view === "awarded" &&
                    e.entityType === "funder";
                  return (
                    <LeaderboardRow
                      key={`${e.entityType}:${e.entityId}`}
                      entity={e}
                      currency={displayCurrency}
                      metric={subdivisionMetric}
                      showMetric={showMetricToggle}
                      onClick={() =>
                        drillProvider
                          ? setFundingProvider(e.entityId)
                          : selectFundingEntity(e.entityId)
                      }
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

function LeaderboardRow({
  entity,
  currency,
  metric = "sum",
  showMetric = false,
  onClick,
}: {
  entity: FundingEntity;
  currency: DisplayCurrency;
  metric?: "sum" | "count";
  showMetric?: boolean;
  onClick: () => void;
}) {
  const native = fmtNative(entity.sumNative, entity.nativeCurrency);
  // When ranking by award count, lead with the count and demote the amount.
  const countLead = showMetric && metric === "count";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left hover:bg-accent/50 transition-colors"
    >
      <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
        {entity.rank}
      </span>
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Building2 className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entity.entityName}</span>
        <span className="block text-[11px] text-muted-foreground tabular-nums">
          {countLead
            ? `≈ ${fmtEur(entity.sumEur, currency)}`
            : `${entity.awardCount.toLocaleString()} awards`}
          {entity.entityCountry ? ` · ${entity.entityCountry}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">
          {countLead
            ? `${entity.awardCount.toLocaleString()} awards`
            : `≈ ${fmtEur(entity.sumEur, currency)}`}
        </span>
        {!countLead && native && (
          <span className="block text-[10px] text-muted-foreground tabular-nums">{native}</span>
        )}
      </span>
    </button>
  );
}

// A recipient's grants, grouped by award year (rows arrive year-desc, undated
// last, largest funder first — preserve that order). Each group carries its own
// sum + count for the year header.
type YearGroup = {
  year: number | null;
  rows: FundingRecipientYear[];
  sumEur: number;
  count: number;
};
function groupByYear(rows: FundingRecipientYear[]): YearGroup[] {
  const m = new Map<number | null, FundingRecipientYear[]>();
  for (const r of rows) {
    const arr = m.get(r.year);
    if (arr) arr.push(r);
    else m.set(r.year, [r]);
  }
  return [...m.entries()].map(([year, rs]) => ({
    year,
    rows: rs,
    sumEur: rs.reduce((a, r) => a + r.sumEur, 0),
    count: rs.reduce((a, r) => a + r.awardCount, 0),
  }));
}

function EntityDetail({
  entity,
  view,
  currency,
  onBack,
}: {
  entity: FundingEntity;
  view: FundingView;
  currency: DisplayCurrency;
  onBack: () => void;
}) {
  const native = fmtNative(entity.sumNative, entity.nativeCurrency);
  const verb = view === "received" ? "received" : "paid out";
  const isRecipient = entity.entityType === "recipient";

  // All-grants breakdown (year × funder), loaded + cached per recipient.
  const loadDetail = useGrantsStore((s) => s.loadFundingRecipientDetail);
  const breakdown = useGrantsStore(
    (s) => s.fundingRecipientBreakdowns[entity.entityId],
  );
  React.useEffect(() => {
    if (isRecipient) void loadDetail(entity.entityId);
  }, [isRecipient, entity.entityId, loadDetail]);

  const groups = React.useMemo(
    () => (breakdown ? groupByYear(breakdown) : null),
    [breakdown],
  );
  const allTimeCount = groups?.reduce((a, g) => a + g.count, 0) ?? 0;
  const allTimeSumEur = groups?.reduce((a, g) => a + g.sumEur, 0) ?? 0;

  return (
    <div className="rounded-lg border bg-card p-3">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to top {view === "received" ? "recipients" : "funders"}
      </button>
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{entity.entityName}</p>
          {entity.entityCountry && (
            <p className="text-[11px] text-muted-foreground">{entity.entityCountry}</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label={`Total ${verb}`} value={`≈ ${fmtEur(entity.sumEur, currency)}`} sub={native ?? undefined} />
        <Metric label="Awards" value={entity.awardCount.toLocaleString()} />
        {entity.medianEur != null && (
          <Metric label="Median award" value={`≈ ${fmtEur(entity.medianEur, currency)}`} />
        )}
        <Metric label="Rank" value={`#${entity.rank}`} />
      </div>

      {/* All grants this recipient received, grouped by year (who paid + how much). */}
      {isRecipient && (
        <div className="mt-3 border-t pt-2">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              All grants
            </span>
            {groups && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {allTimeCount.toLocaleString()} received · ≈ {fmtEur(allTimeSumEur, currency)}
              </span>
            )}
          </div>

          {breakdown == null ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">Loading grants…</p>
          ) : groups && groups.length > 0 ? (
            <div className="space-y-1">
              {groups.map((g, i) => (
                <YearGroupRow
                  key={g.year ?? "undated"}
                  group={g}
                  currency={currency}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          ) : (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              No grant breakdown available for this recipient.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function YearGroupRow({
  group,
  currency,
  defaultOpen,
}: {
  group: YearGroup;
  currency: DisplayCurrency;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const label = group.year == null ? "Undated" : String(group.year);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border bg-background">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent/50 transition-colors">
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold tabular-nums">{label}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {group.count.toLocaleString()} {group.count === 1 ? "grant" : "grants"} · ≈ {fmtEur(group.sumEur, currency)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:hidden">
        <div className="space-y-1 px-2 pb-2 pt-0.5">
          {group.rows.map((r) => {
            const native = fmtNative(r.sumNative, r.nativeCurrency);
            return (
              <div
                key={r.funderId}
                className="flex items-center gap-2 rounded-md px-1.5 py-1"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{r.funderName}</span>
                  <span className="block text-[10px] text-muted-foreground tabular-nums">
                    {r.awardCount.toLocaleString()} {r.awardCount === 1 ? "grant" : "grants"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold tabular-nums">
                    ≈ {fmtEur(r.sumEur, currency)}
                  </span>
                  {native && (
                    <span className="block text-[10px] text-muted-foreground tabular-nums">{native}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}
