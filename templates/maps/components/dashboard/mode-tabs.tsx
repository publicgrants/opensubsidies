"use client";

import * as React from "react";
import { Compass, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGrantsStore, type PanelView } from "@/store/maps-store";

const TABS: {
  id: PanelView;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "discover", label: "Find grants", short: "Grants", icon: Compass },
  { id: "received", label: "Money received", short: "Received", icon: ArrowDownToLine },
  { id: "awarded", label: "Money awarded", short: "Awarded", icon: ArrowUpFromLine },
];

// Floating switch between the three faces of the landing-page card. Top-centre,
// hovering over the map on desktop; an iOS-style bottom nav on mobile. It only
// drives `panelView` — the map + card react to it. Mounted on the home route
// only (see app/(dashboard)/page.tsx), so Watchlist/Recents are unaffected.
export function ModeTabs() {
  const panelView = useGrantsStore((s) => s.panelView);
  const setPanelView = useGrantsStore((s) => s.setPanelView);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <nav
        className="absolute inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="View"
      >
        {TABS.map((t) => {
          const active = panelView === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanelView(t.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{t.short}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2">
      <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border bg-background/80 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
        {TABS.map((t) => {
          const active = panelView === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanelView(t.id)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
