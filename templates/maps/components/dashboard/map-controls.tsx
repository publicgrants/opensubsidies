"use client";

import Link from "next/link";
import {
  Plus,
  Minus,
  Locate,
  Globe2,
  Layers,
  Map as MapIcon,
  Mountain,
  Satellite,
  Circle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGrantsStore } from "@/store/maps-store";
import { cn } from "@/lib/utils";

const mapStyles = [
  { id: "default", name: "Default", icon: Circle, description: "Follows theme" },
  { id: "streets", name: "Streets", icon: MapIcon, description: "Detailed roads" },
  { id: "outdoors", name: "Outdoors", icon: Mountain, description: "Terrain & jurisdictions" },
  { id: "satellite", name: "Satellite", icon: Satellite, description: "Aerial view" },
] as const;

export function MapControls() {
  const {
    mapZoom,
    setMapZoom,
    setMapCenter,
    setUserLocation,
    userLocation,
    mapStyle,
    setMapStyle,
  } = useGrantsStore();

  const handleZoomIn = () => setMapZoom(Math.min(mapZoom + 1, 18));
  const handleZoomOut = () => setMapZoom(Math.max(mapZoom - 1, 1.5));

  const handleWorldView = () => {
    setMapCenter({ lat: 30, lng: 10 });
    setMapZoom(2);
  };

  const getLocationFromIP = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch("https://ipapi.co/json/");
      const data = (await response.json()) as {
        latitude?: number;
        longitude?: number;
      };
      if (data.latitude && data.longitude) {
        return { lat: data.latitude, lng: data.longitude };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleLocate = async () => {
    if (userLocation) {
      setMapCenter(userLocation);
      setMapZoom(5.5);
      return;
    }
    const tryIPFallback = async () => {
      const ipLocation = await getLocationFromIP();
      if (ipLocation) {
        setUserLocation(ipLocation);
        setMapCenter(ipLocation);
        setMapZoom(5.5);
      }
    };
    if (!("geolocation" in navigator)) {
      await tryIPFallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setMapCenter(location);
        setMapZoom(5.5);
      },
      () => {
        tryIPFallback();
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );
  };

  return (
    <>
      {/* Top-right cluster: brand pill, layers, theme, AI connector link */}
      <div className="absolute top-4 right-4 z-10 flex flex-col sm:flex-row items-center gap-2">
        {/* Brand pill — minimalist, hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 dash-floating">
          <div className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Globe2 className="size-3" />
          </div>
          <span className="text-xs font-semibold tracking-tight">
            Open<span className="text-muted-foreground">Subsidies</span>
          </span>
          <span className="text-[10px] text-muted-foreground border-l pl-2 ml-1">Beta</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="bg-background! size-11 dash-floating"
              title="Map style"
              aria-label="Choose map style"
            >
              <Layers className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
              Map style
            </DropdownMenuLabel>
            {mapStyles.map((style) => {
              const Icon = style.icon;
              return (
                <DropdownMenuItem
                  key={style.id}
                  onClick={() => setMapStyle(style.id)}
                  className={cn("gap-3", mapStyle === style.id && "bg-accent")}
                >
                  <Icon className="size-4 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium">{style.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {style.description}
                    </span>
                  </div>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
              Markers are colour-coded by instrument (grant · loan ·
              guarantee · voucher · equity · mixed) with a status ring
              (open · closing · upcoming · closed).
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle className="bg-background! size-11 dash-floating" />

        <Button
          variant="outline"
          size="icon"
          className="bg-background! size-11 dash-floating"
          asChild
          title="Open OpenSubsidies AI connector"
        >
          <Link
            href="https://www.opensubsidies.com/connectors"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open OpenSubsidies AI connector in a new tab"
          >
            <Sparkles className="size-4" />
          </Link>
        </Button>
      </div>

      {/* Bottom-right cluster: locate, world view, zoom */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          className="bg-background! size-11 dash-floating"
          onClick={handleLocate}
          title="Centre on my country"
          aria-label="Centre map on my country"
        >
          <Locate className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-background! size-11 dash-floating"
          onClick={handleWorldView}
          title="Reset to world view"
          aria-label="Reset to world view"
        >
          <Globe2 className="size-4" />
        </Button>
        <div className="flex flex-col rounded-lg border bg-background! dash-floating overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none size-11 border-b flex items-center justify-center"
            onClick={handleZoomIn}
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none size-11 flex items-center justify-center"
            onClick={handleZoomOut}
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
