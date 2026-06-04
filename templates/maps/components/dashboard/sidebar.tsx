"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Globe2,
  Bookmark,
  Clock,
  Settings,
  ChevronsUpDown,
  LogOut,
  BrainCircuit,
  Sparkles,
  Landmark,
  Globe,
  HandCoins,
  Coins,
  Receipt,
  Ticket,
  TrendingUp,
  Shuffle,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGrantsStore, type MetricMode } from "@/store/maps-store";
import { funders } from "@/mock-data/locations";
import type { FunderType, InstrumentType } from "@/mock-data/locations";
import { cn } from "@/lib/utils";

// "Funding" is intentionally omitted: there is no disbursement data wired yet
// (clustering.fundingForGrant returns 0), so the metric renders an em-dash
// everywhere and looks broken. The MetricMode type and the null-handling code
// downstream are left intact — re-add the entry below once awards.jsonl is
// summed into the catalog.
const METRIC_OPTIONS: { id: MetricMode; label: string; hint?: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "schemes", label: "Schemes" },
];

function fmtBadge(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

const navItems = [
  { id: "all", title: "Discover Grants", icon: Globe2, href: "/" },
  { id: "favorites", title: "Watchlist", icon: Bookmark, href: "/favorites" },
  { id: "recents", title: "Recently Viewed", icon: Clock, href: "/recents" },
];

const FUNDER_TYPE_OPTIONS: {
  id: FunderType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "government", label: "Government", icon: Landmark },
  { id: "supranational", label: "Supranational", icon: Globe },
  { id: "foundation", label: "Foundation", icon: Sparkles },
  { id: "unknown", label: "Other / unknown", icon: HelpCircle },
];

const INSTRUMENT_OPTIONS: {
  id: InstrumentType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "grant", label: "Grant", icon: HandCoins },
  { id: "loan", label: "Loan", icon: Coins },
  { id: "guarantee", label: "Guarantee", icon: ShieldCheck },
  { id: "voucher", label: "Voucher", icon: Ticket },
  { id: "equity", label: "Equity", icon: TrendingUp },
  { id: "mixed", label: "Mixed / blended", icon: Shuffle },
  { id: "unknown", label: "Unspecified", icon: Receipt },
];

export function LocationsSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const {
    grants,
    selectedCountry,
    setSelectedCountry,
    selectedFunderTypes,
    toggleFunderType,
    selectedInstrumentTypes,
    toggleInstrumentType,
    getRecentGrants,
    metricMode,
    setMetricMode,
  } = useGrantsStore();

  const savedCount = grants.filter((g) => g.isSaved).length;
  const recentCount = getRecentGrants().length;
  const openCount = grants.filter(
    (g) => g.status === "open" || g.status === "closing-soon",
  ).length;

  const funderCountryById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const f of funders) m.set(f.id, f.country);
    return m;
  }, []);

  const grantsByCountry = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of grants) {
      const cc = funderCountryById.get(g.funderId);
      if (!cc) continue;
      counts.set(cc, (counts.get(cc) ?? 0) + 1);
    }
    return counts;
  }, [grants, funderCountryById]);

  const fundersByCountry = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of funders) counts.set(f.country, (counts.get(f.country) ?? 0) + 1);
    return counts;
  }, []);

  // Count shown on each country chip, per active metric. funding = null ("—").
  const metricFor = React.useCallback(
    (code: string): number | null => {
      if (metricMode === "funding") return null;
      if (metricMode === "providers") return fundersByCountry.get(code) ?? 0;
      return grantsByCountry.get(code) ?? 0;
    },
    [metricMode, fundersByCountry, grantsByCountry],
  );

  const allCountriesMetric: number | null =
    metricMode === "funding"
      ? null
      : metricMode === "providers"
        ? funders.length
        : grants.length;

  const countryOptions = React.useMemo(() => {
    const byCode = new Map<string, { code: string; name: string }>();
    for (const f of funders) {
      if (!byCode.has(f.country)) {
        byCode.set(f.country, { code: f.country, name: f.countryName });
      }
    }
    // Sort by the active metric (providers / schemes). Funding has no data,
    // so fall back to scheme counts for a stable, meaningful ordering.
    const sortMap =
      metricMode === "providers" ? fundersByCountry : grantsByCountry;
    return [...byCode.values()].sort((a, b) => {
      const ca = sortMap.get(a.code) ?? 0;
      const cb = sortMap.get(b.code) ?? 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
  }, [grantsByCountry, fundersByCountry, metricMode]);

  const grantsByInstrument = React.useMemo(() => {
    const counts = new Map<InstrumentType, number>();
    for (const g of grants) {
      counts.set(g.instrumentType, (counts.get(g.instrumentType) ?? 0) + 1);
    }
    return counts;
  }, [grants]);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="px-2.5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 w-full hover:bg-sidebar-accent rounded-md p-1 -m-1 transition-colors shrink-0">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                <Globe2 className="size-4" />
              </div>
              <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold tracking-tight">
                  Open<span className="text-muted-foreground">Subsidies</span>
                </span>
                <ChevronsUpDown className="size-3 text-muted-foreground" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              OpenSubsidies — Beta
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Sparkles className="size-4" />
              <div className="flex flex-col">
                <span>Grant Matching</span>
                <span className="text-xs text-muted-foreground">
                  AI connector — match my company
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BrainCircuit className="size-4" />
              <div className="flex flex-col">
                <span>Grant Writing</span>
                <span className="text-xs text-muted-foreground">
                  AI connector — draft applications
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Settings className="size-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        {/* Metric mode — switches every count in the UI between grant
            providers, grant schemes, and grant funding. */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <div
              role="group"
              aria-label="Count metric"
              className="grid grid-cols-3 gap-0.5 rounded-lg bg-sidebar-accent p-0.5"
            >
              {METRIC_OPTIONS.map((opt) => {
                const active = metricMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMetricMode(opt.id)}
                    title={opt.hint}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md px-1 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Primary navigation */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                let badge: number | undefined;
                if (item.id === "favorites") badge = savedCount;
                if (item.id === "recents") badge = recentCount;
                if (item.id === "all") badge = openCount;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="h-8"
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span className="text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge !== undefined && badge > 0 && (
                      <SidebarMenuBadge>
                        {item.id === "all" ? `${badge} open` : badge}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Country filter */}
        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="px-0 h-6">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Country
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedCountry === "all"}
                  onClick={() => setSelectedCountry("all")}
                  className="h-7"
                >
                  <Globe2 className="size-3.5" />
                  <span className="text-sm">All countries</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{fmtBadge(allCountriesMetric)}</SidebarMenuBadge>
              </SidebarMenuItem>
              {countryOptions.map((c) => {
                const count = metricFor(c.code);
                const showBadge = count === null || count > 0;
                return (
                  <SidebarMenuItem key={c.code}>
                    <SidebarMenuButton
                      isActive={selectedCountry === c.code}
                      onClick={() => setSelectedCountry(c.code)}
                      className="h-7"
                    >
                      <span className="size-3.5 text-center text-[10px] font-medium tabular-nums text-muted-foreground leading-none">
                        {c.code}
                      </span>
                      <span className="text-sm">{c.name}</span>
                    </SidebarMenuButton>
                    {showBadge && (
                      <SidebarMenuBadge>{fmtBadge(count)}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Funder type filter */}
        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="px-0 h-6">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Funder type
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {FUNDER_TYPE_OPTIONS.map((ft) => {
                const Icon = ft.icon;
                const isActive = selectedFunderTypes.includes(ft.id);
                const count = funders.filter((f) => f.type === ft.id).length;
                if (count === 0) return null;
                return (
                  <SidebarMenuItem key={ft.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => toggleFunderType(ft.id)}
                      className={cn("h-7", isActive && "font-medium")}
                    >
                      <Icon className="size-3.5" />
                      <span className="text-sm">{ft.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{count}</SidebarMenuBadge>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Instrument filter */}
        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="px-0 h-6">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Instrument
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {INSTRUMENT_OPTIONS.map((it) => {
                const Icon = it.icon;
                const isActive = selectedInstrumentTypes.includes(it.id);
                const count = grantsByInstrument.get(it.id) ?? 0;
                if (count === 0) return null;
                return (
                  <SidebarMenuItem key={it.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => toggleInstrumentType(it.id)}
                      className={cn("h-7", isActive && "font-medium")}
                    >
                      <Icon className="size-3.5" />
                      <span className="text-sm">{it.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{count}</SidebarMenuBadge>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2.5 pb-3">
        <div className="group-data-[collapsible=icon]:hidden space-y-3">
          <div className="group/sidebar relative flex flex-col gap-2 rounded-lg border p-4 text-sm w-full bg-background">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" />
              </div>
              <div className="text-balance text-sm font-semibold leading-tight">
                Match my company
              </div>
            </div>
            <div className="text-muted-foreground text-xs leading-snug">
              Use the OpenSubsidies connector inside your AI assistant to
              match your eligibility against every grant in this dashboard.
            </div>
            <Button size="sm" className="w-full mt-1" asChild>
              <Link
                href="https://www.opensubsidies.com/connectors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open AI connector
              </Link>
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
            OpenSubsidies indexes public grants worldwide.
            <br />
            Coverage: Nordics → EU → US → Global.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
