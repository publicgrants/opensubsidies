"use client";

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
  Leaf,
  HeartPulse,
  Monitor,
  Factory,
  Wheat,
  Train,
  GraduationCap,
  Palette,
  Users,
  Briefcase,
  MapPin,
  Sparkles,
  Building2,
  Landmark,
  Globe,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGrantsStore } from "@/store/maps-store";
import { categories, funders } from "@/mock-data/locations";
import type { FunderType } from "@/mock-data/locations";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "all", title: "Discover Grants", icon: Globe2, href: "/" },
  { id: "favorites", title: "Watchlist", icon: Bookmark, href: "/favorites" },
  { id: "recents", title: "Recently Viewed", icon: Clock, href: "/recents" },
];

const sectorIconMap: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  "brain-circuit": BrainCircuit,
  leaf: Leaf,
  "heart-pulse": HeartPulse,
  monitor: Monitor,
  factory: Factory,
  wheat: Wheat,
  train: Train,
  "graduation-cap": GraduationCap,
  palette: Palette,
  users: Users,
  briefcase: Briefcase,
};

const REGIONS = [
  { id: "all", label: "All regions", flag: "🌍" },
  { id: "EU", label: "European Union", flag: "🇪🇺" },
  { id: "Nordics", label: "Nordics", flag: "🇳🇴" },
  { id: "North America", label: "North America", flag: "🇺🇸" },
  { id: "Asia & APAC", label: "Asia & APAC", flag: "🇯🇵" },
  { id: "Latin America", label: "Latin America", flag: "🇧🇷" },
  { id: "Global", label: "Multilateral / Global", flag: "🌐" },
];

const FUNDER_TYPE_OPTIONS: { id: FunderType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "supranational", label: "Supranational (EU)", icon: Globe },
  { id: "national", label: "National agencies", icon: Landmark },
  { id: "regional", label: "Regional", icon: Building2 },
  { id: "agency", label: "Specialised agencies", icon: HandCoins },
  { id: "foundation", label: "Foundations", icon: Sparkles },
  { id: "multilateral", label: "Multilateral", icon: Globe2 },
];

export function LocationsSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const {
    grants,
    selectedSector,
    setSelectedSector,
    selectedRegion,
    setSelectedRegion,
    selectedFunderTypes,
    toggleFunderType,
    getRecentGrants,
  } = useGrantsStore();

  const savedCount = grants.filter((g) => g.isSaved).length;
  const recentCount = getRecentGrants().length;
  const openCount = grants.filter(
    (g) => g.status === "open" || g.status === "closing-soon"
  ).length;

  const getSectorCount = (sectorId: string) => {
    if (sectorId === "all") return grants.length;
    return grants.filter((g) => g.sectorId === sectorId).length;
  };

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
                  Grant<span className="text-muted-foreground">.com</span>
                </span>
                <ChevronsUpDown className="size-3 text-muted-foreground" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              Grant.com — Beta
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

        {/* Sectors */}
        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="px-0 h-6">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Sectors
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedSector === "all"}
                  onClick={() => setSelectedSector("all")}
                  className="h-7"
                >
                  <Globe2 className="size-3.5" />
                  <span className="text-sm">All sectors</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{getSectorCount("all")}</SidebarMenuBadge>
              </SidebarMenuItem>
              {categories.map((sector) => {
                const Icon = sectorIconMap[sector.icon] || MapPin;
                const count = getSectorCount(sector.id);
                return (
                  <SidebarMenuItem key={sector.id}>
                    <SidebarMenuButton
                      isActive={selectedSector === sector.id}
                      onClick={() => setSelectedSector(sector.id)}
                      className="h-7"
                    >
                      <Icon
                        className="size-3.5"
                        style={{ color: sector.color }}
                      />
                      <span className="text-sm">{sector.name}</span>
                    </SidebarMenuButton>
                    {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Region filter */}
        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="px-0 h-6">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              Region
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {REGIONS.map((r) => (
                <SidebarMenuItem key={r.id}>
                  <SidebarMenuButton
                    isActive={selectedRegion === r.id}
                    onClick={() => setSelectedRegion(r.id)}
                    className="h-7"
                  >
                    <span className="size-3.5 text-center text-[13px] leading-none">
                      {r.flag}
                    </span>
                    <span className="text-sm">{r.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
                    {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
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
              Use the Grant.com connector inside your AI assistant to match
              your eligibility against every grant in this dashboard.
            </div>
            <Button size="sm" className="w-full mt-1" asChild>
              <Link
                href="https://grant.com/connectors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open AI connector
              </Link>
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
            Grant.com indexes public grants worldwide.
            <br />
            Coverage: Nordics → EU → US → Global.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
