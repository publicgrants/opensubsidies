"use client";

import * as React from "react";
import {
  PanelRightClose,
  Globe2,
  Bookmark,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGrantsStore } from "@/store/maps-store";
import { cn } from "@/lib/utils";
import { GrantResultsList, panelConfig } from "@/components/dashboard/maps-panel";
import { FundingCard } from "@/components/dashboard/funding-card";

type PanelMode = "all" | "favorites" | "recents";

// The collapsible results surface of the search-first canvas. Collapsed by
// default (so the globe is unobstructed) and revealed when the user searches or
// clicks a country/region (see the store actions that flip `resultsOpen`).
// Hosts the grant list (discover / watchlist / recents) or the funding card
// (money received / awarded). Search + filters + the lens switch live in
// <GlobeSearch/>; this owns only the shell + header.
export function ResultsDrawer({ mode = "all" }: { mode?: PanelMode }) {
  const resultsOpen = useGrantsStore((s) => s.resultsOpen);
  const setResultsOpen = useGrantsStore((s) => s.setResultsOpen);
  const panelView = useGrantsStore((s) => s.panelView);
  const total = useGrantsStore((s) => s.total);
  const savedIds = useGrantsStore((s) => s.savedIds);
  const recentIds = useGrantsStore((s) => s.recentIds);
  const metricMode = useGrantsStore((s) => s.metricMode);
  const funders = useGrantsStore((s) => s.funders);

  const isFunding =
    mode === "all" && (panelView === "received" || panelView === "awarded");

  // Header title + icon + count, per lens / mode.
  const { title, Icon, count } = React.useMemo(() => {
    if (isFunding) {
      return panelView === "received"
        ? { title: "Money received", Icon: ArrowDownToLine, count: null as number | null }
        : { title: "Money awarded", Icon: ArrowUpFromLine, count: null as number | null };
    }
    if (mode === "favorites")
      return { title: panelConfig.favorites.title, Icon: Bookmark, count: savedIds.size };
    if (mode === "recents")
      return { title: panelConfig.recents.title, Icon: Clock, count: recentIds.length };
    // Discover: providers count or total schemes, matching the active metric.
    const c = metricMode === "providers" ? funders.length : total;
    return { title: panelConfig.all.title, Icon: Globe2, count: c };
  }, [isFunding, panelView, mode, savedIds, recentIds, metricMode, funders.length, total]);

  // Collapsed → a compact floating button that reopens the drawer. On mobile it
  // sits bottom-left (above the lens nav) so it never overlaps the top search.
  if (!resultsOpen) {
    return (
      <Button
        variant="outline"
        className="absolute bottom-20 left-4 z-20 h-11 gap-2 rounded-full bg-background! pl-3 pr-4 dash-floating sm:bottom-auto sm:top-4"
        onClick={() => setResultsOpen(true)}
        aria-label="Open results"
      >
        <ListFilter className="size-4" />
        <span className="text-sm font-medium">
          {count != null ? `${count.toLocaleString()} ${count === 1 ? "result" : "results"}` : "Results"}
        </span>
      </Button>
    );
  }

  return (
    <div className="absolute left-4 right-4 top-[76px] bottom-16 z-20 flex flex-col overflow-hidden rounded-2xl border bg-background dash-panel animate-in fade-in slide-in-from-left-2 duration-200 sm:right-auto sm:top-4 sm:bottom-4 sm:w-[380px]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {count.toLocaleString()}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={() => setResultsOpen(false)}
          aria-label="Collapse results"
          title="Collapse"
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      {/* Body */}
      <div className={cn("flex min-h-0 flex-1 flex-col")}>
        {isFunding ? (
          <FundingCard view={panelView === "awarded" ? "awarded" : "received"} />
        ) : (
          <GrantResultsList mode={mode} />
        )}
      </div>
    </div>
  );
}
