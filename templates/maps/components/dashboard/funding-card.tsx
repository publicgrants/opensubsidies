"use client";

import * as React from "react";
import {
  X,
  Info,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Building2,
  MapPin,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
import type { Funder, FundingEntity } from "@/mock-data/locations";

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

  const scope = fundingScope ?? "ALL";
  const aggregate = fundingAggregates[view] ?? null;
  const leaderboard = fundingLeaderboards[`${view}|${scope}`] ?? [];
  const selectedEntity = selectedId
    ? (leaderboard.find((e) => e.entityId === selectedId) ?? null)
    : null;
  const scopeRow = aggregate?.countries.find((c) => c.country === scope) ?? null;
  const coverage =
    scope !== "ALL"
      ? (aggregate?.coverage.find((c) => c.country === scope) ?? null)
      : null;

  const Icon = view === "received" ? ArrowDownToLine : ArrowUpFromLine;
  const title = view === "received" ? "Money received" : "Money awarded";
  const verb = view === "received" ? "received" : "paid out";
  const entityNoun = view === "received" ? "recipients" : "funders";

  return (
    <div
      className={cn(
        "absolute left-4 top-4 z-20 flex flex-col bg-background rounded-2xl dash-panel border overflow-hidden w-80 sm:w-[420px]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        listExpanded ? "bottom-4" : "max-h-[calc(100%-2rem)]",
      )}
    >
      {/* Header + hero */}
      <div className="px-3 pt-3 pb-2 border-b">
        <div className="flex items-start justify-between mb-2">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Icon className="size-4" />
            {title}
          </h2>
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
                ≈ {fmtEur(scopeRow?.sumEur ?? 0, displayCurrency)}
              </span>
              <span className="text-sm text-muted-foreground">{verb}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              across {(scopeRow?.awardCount ?? 0).toLocaleString()} awards
              {scopeRow?.medianEur != null && (
                <> · median {fmtEur(scopeRow.medianEur, displayCurrency)}</>
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
            {scope === "ALL" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="size-3" /> All countries
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFundingScope(null)}
                className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
                aria-label={`Clear ${countryNameOf(funders, scope)} filter`}
              >
                {countryNameOf(funders, scope)}
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
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
          <span className="capitalize">Top {entityNoun}</span>
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
                  view={view}
                  currency={displayCurrency}
                  onBack={() => selectFundingEntity(null)}
                />
              ) : leaderboard.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {aggregate == null
                    ? "Loading…"
                    : `No ${entityNoun} for this selection yet.`}
                </div>
              ) : (
                leaderboard.map((e) => (
                  <LeaderboardRow
                    key={`${e.entityType}:${e.entityId}`}
                    entity={e}
                    currency={displayCurrency}
                    onClick={() => selectFundingEntity(e.entityId)}
                  />
                ))
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
  onClick,
}: {
  entity: FundingEntity;
  currency: DisplayCurrency;
  onClick: () => void;
}) {
  const native = fmtNative(entity.sumNative, entity.nativeCurrency);
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
          {entity.awardCount.toLocaleString()} awards
          {entity.entityCountry ? ` · ${entity.entityCountry}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">
          ≈ {fmtEur(entity.sumEur, currency)}
        </span>
        {native && (
          <span className="block text-[10px] text-muted-foreground tabular-nums">{native}</span>
        )}
      </span>
    </button>
  );
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
    </div>
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
