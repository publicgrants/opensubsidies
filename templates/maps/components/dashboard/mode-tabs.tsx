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
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "discover", label: "Find grants", short: "Grants", sub: "Discover", icon: Compass },
  { id: "received", label: "Money received", short: "Received", sub: "Inflow", icon: ArrowDownToLine },
  { id: "awarded", label: "Money awarded", short: "Awarded", sub: "Outflow", icon: ArrowUpFromLine },
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

// In-card hero switch (desktop): the "Luxury Glass" segmented control — a
// recessed glass track with a luminous sliding thumb whose accent (blue / green
// / amber) mirrors the map bubbles. Styling lives in app/globals.css
// (`.mode-switch`); display is `hidden sm:grid` so mobile uses the bottom nav.
export function ModeSwitchInline({ className }: { className?: string }) {
  const panelView = useGrantsStore((s) => s.panelView);
  const setPanelView = useGrantsStore((s) => s.setPanelView);

  const pos = Math.max(
    0,
    TABS.findIndex((t) => t.id === panelView),
  );

  // Brief flag (cleared after the animation) drives the sheen sweep + icon pop.
  const [animating, setAnimating] = React.useState(false);
  const prevPos = React.useRef(pos);
  React.useEffect(() => {
    if (prevPos.current === pos) return;
    prevPos.current = pos;
    setAnimating(true);
    const t = setTimeout(() => setAnimating(false), 720);
    return () => clearTimeout(t);
  }, [pos]);

  return (
    <div
      className={cn("mode-switch hidden sm:grid", className)}
      role="tablist"
      aria-label="View"
      data-pos={pos}
      data-animating={animating ? "1" : undefined}
    >
      <span className="mode-switch__thumb" aria-hidden="true" />
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
            className={cn("mode-switch__seg", active && "is-active")}
          >
            <span className="mode-switch__ico">
              <Icon />
            </span>
            <span className="mode-switch__label">{t.label}</span>
            <span className="mode-switch__sub">{t.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
