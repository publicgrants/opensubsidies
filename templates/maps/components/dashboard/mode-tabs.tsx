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

// Mobile bottom navigation for switching the three views. On desktop the switch
// lives inside the card (see <ModeSwitchInline/>), so this renders nothing.
// Mounted on the home route only (app/(dashboard)/page.tsx).
export function ModeTabs() {
  const panelView = useGrantsStore((s) => s.panelView);
  const setPanelView = useGrantsStore((s) => s.setPanelView);
  const isMobile = useIsMobile();

  if (!isMobile) return null;

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

// In-card segmented control (desktop). Rendered at the top of the discover and
// funding cards so the switch sits with the content it controls — no floating
// bar to collide with the card or the map controls. Hidden on mobile (the
// bottom nav handles it there).
export function ModeSwitchInline({ className }: { className?: string }) {
  const panelView = useGrantsStore((s) => s.panelView);
  const setPanelView = useGrantsStore((s) => s.setPanelView);

  return (
    <div
      className={cn(
        "hidden grid-cols-3 gap-0.5 rounded-lg bg-sidebar-accent p-0.5 sm:grid",
        className,
      )}
      role="tablist"
      aria-label="View"
    >
      {TABS.map((t) => {
        const active = panelView === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPanelView(t.id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
