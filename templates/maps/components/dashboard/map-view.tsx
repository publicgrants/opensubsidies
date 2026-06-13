"use client";
// Tier-aware rendering: country bubbles → proximity clusters → individual pins.

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useGrantsStore } from "@/store/maps-store";
import type {
  Funder,
  Grant,
  GrantStatus,
  InstrumentType,
} from "@/mock-data/locations";
import {
  buildContinentBubbles,
  buildCountryBubbles,
  buildFunderClusterIndex,
  buildFundingCountryBubbles,
  CLUSTER_TIER_MAX_ZOOM,
  CONTINENT_TIER_MAX_ZOOM,
  COUNTRY_TIER_MAX_ZOOM,
  featureMetricValue,
  getVisibleClusters,
  isClusterFeature,
  tierForZoom,
} from "@/lib/clustering";
import { createClusterMarkerElement } from "@/components/dashboard/map-cluster-marker";
import { subdivisionLabel } from "@/mock-data/subdivisions";
import { fromEur, CURRENCY_SYMBOL, type DisplayCurrency } from "@/lib/fx-rates";

// Fylke choropleth colour ramps (light → strong) by money direction. Received
// (money landing) uses an emerald ramp; awarded (money leaving) an orange one.
const CHOROPLETH_RAMP: Record<"received" | "awarded", [string, string]> = {
  received: ["#d1fae5", "#047857"],
  awarded: ["#ffedd5", "#c2410c"],
};
const NORWAY_VIEW = { center: [14, 65] as [number, number], zoom: 3.6 };

// Geometry-backed subdivision levels. Each maps a GeoJSON file + a function that
// derives the join code from a feature's properties (matching the rollup's
// `subdivision` codes). City/poststed has no polygon geometry, so the map falls
// back to the kommune layer for it (city granularity still drives leaderboards).
const MAP_LEVELS: Record<
  "fylke" | "kommune",
  { file: string; codeOf: (props: Record<string, unknown>) => string }
> = {
  fylke: {
    file: "/geo/no-fylker.json",
    codeOf: (p) => `NO-${p.fylkesnummer ?? ""}`,
  },
  kommune: {
    file: "/geo/no-kommuner.json",
    codeOf: (p) => String(p.kommunenummer ?? ""),
  },
};
type MapLevel = keyof typeof MAP_LEVELS;

const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  streets: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  outdoors: "https://tiles.stadiamaps.com/styles/outdoors.json",
  satellite: "https://tiles.stadiamaps.com/styles/alidade_satellite.json",
};

const STATUS_COLOR: Record<GrantStatus, string> = {
  open: "#10b981",
  "closing-soon": "#f97316",
  upcoming: "#3b82f6",
  closed: "#9ca3af",
};

const STATUS_LABEL: Record<GrantStatus, string> = {
  open: "Open",
  "closing-soon": "Closing soon",
  upcoming: "Upcoming",
  closed: "Closed",
};

// Marker pin color by instrument type — replaces the old per-sector palette.
const INSTRUMENT_COLOR: Record<InstrumentType, string> = {
  grant: "#3b82f6",
  loan: "#8b5cf6",
  guarantee: "#0ea5e9",
  voucher: "#f59e0b",
  equity: "#ec4899",
  mixed: "#14b8a6",
  unknown: "#6b7280",
};

const INSTRUMENT_LABEL: Record<InstrumentType, string> = {
  grant: "Grant",
  loan: "Loan",
  guarantee: "Guarantee",
  voucher: "Voucher",
  equity: "Equity",
  mixed: "Mixed / blended",
  unknown: "Unspecified",
};

function symbolFor(currency: string): string {
  switch (currency) {
    case "EUR":
      return "€";
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "JPY":
    case "CNY":
      return "¥";
    default:
      return "";
  }
}

function fmtAmount(amount: number, currency: string | null): string {
  const sym = currency ? symbolFor(currency) : "";
  const prefix = sym || (currency ? `${currency} ` : "");
  if (amount >= 1_000_000_000) return `${prefix}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${prefix}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${prefix}${(amount / 1_000).toFixed(0)}K`;
  return `${prefix}${amount}`;
}

function fmtAmountRange(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min !== null && max !== null) {
    if (min === max) return fmtAmount(max, currency);
    return `${fmtAmount(min, currency)} – ${fmtAmount(max, currency)}`;
  }
  if (max !== null) return `up to ${fmtAmount(max, currency)}`;
  if (min !== null) return `from ${fmtAmount(min, currency)}`;
  return null;
}

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function fmtDeadline(
  closesAt: string | null,
  status: GrantStatus,
  applicationMode: Grant["applicationMode"],
): string {
  if (status === "closed") return "Closed";
  if (!closesAt) {
    return applicationMode === "rolling" ? "Rolling intake" : "No deadline published";
  }
  const days = daysUntil(closesAt);
  if (status === "upcoming") return `Opens in ${Math.max(0, days)} days`;
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 30) return `${days} days left`;
  if (days <= 60) return `${Math.floor(days / 7)} weeks left`;
  return new Date(closesAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MapView() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupRef = React.useRef<maplibregl.Popup | null>(null);
  const isAnimatingRef = React.useRef(false);
  const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isHoveringPopupRef = React.useRef(false);
  const { resolvedTheme } = useTheme();

  const {
    mapCenter,
    mapZoom,
    mapStyle,
    setMapCenter,
    setMapZoom,
    selectGrant,
    selectedGrantId,
    setUserLocation,
    getFilteredGrants,
    metricMode,
    funders,
    panelView,
    displayCurrency,
    fundingAggregates,
    setFundingScope,
    fundingScope,
    fundingProviderId,
    subdivisionMetric,
    subdivisionLevel,
    fundingSubdivisions,
  } = useGrantsStore();

  const getMapStyleUrl = React.useCallback(() => {
    if (mapStyle === "default") {
      return resolvedTheme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;
    }
    return MAP_STYLES[mapStyle];
  }, [mapStyle, resolvedTheme]);

  const grants = getFilteredGrants();

  // Continent / country / cluster tiers aggregate over the WHOLE catalog
  // (all funders + all grants), so the bubble counts represent the provider
  // universe regardless of the list filters. The pin tier (zoom > 10.5) still
  // renders one pin per grant from the filtered grants list. The active
  // `metricMode` (providers / schemes / funding) decides what each bubble
  // counts — the index carries per-funder scheme/funding sums so switching
  // mode is a cheap re-read, not a rebuild.
  const clusterIndex = React.useMemo(
    () => buildFunderClusterIndex(funders),
    [funders],
  );
  const countryBubbles = React.useMemo(
    () => buildCountryBubbles(funders, metricMode),
    [funders, metricMode],
  );
  const continentBubbles = React.useMemo(
    () => buildContinentBubbles(funders, metricMode),
    [funders, metricMode],
  );
  const funderById = React.useMemo(() => {
    const m = new Map<string, Funder>();
    for (const f of funders) m.set(f.id, f);
    return m;
  }, [funders]);

  // Funding views: money-sized country bubbles from the funding aggregate.
  const fundingAgg =
    panelView === "received" || panelView === "awarded"
      ? fundingAggregates[panelView]
      : undefined;
  const fundingBubbles = React.useMemo(
    () =>
      fundingAgg
        ? buildFundingCountryBubbles(fundingAgg.countries, displayCurrency)
        : [],
    [fundingAgg, displayCurrency],
  );

  // ── Fylke choropleth (within-Norway money flow) ──────────────────────────
  // Active when a funding view is focused on Norway (scope NO / a NO-xx Fylke)
  // OR a provider is drilled into (its received-by-Fylke flow). Provider flow is
  // always a "received" question. Resolves the right cached subdivision rows.
  const isFundingView = panelView === "received" || panelView === "awarded";
  const choroplethView: "received" | "awarded" =
    fundingProviderId ? "received" : panelView === "awarded" ? "awarded" : "received";
  const choroplethScope = fundingProviderId
    ? fundingProviderId
    : fundingScope &&
        (fundingScope === "NO" ||
          fundingScope.startsWith("NO-") ||
          /^\d{4}$/.test(fundingScope))
      ? "NO"
      : null;
  const choroplethActive = isFundingView && choroplethScope !== null;
  const choroplethData = React.useMemo(() => {
    if (!choroplethActive || !choroplethScope) return [];
    const key = `${choroplethView}|${choroplethScope}|${subdivisionLevel}`;
    return fundingSubdivisions[key] ?? [];
  }, [
    choroplethActive,
    choroplethScope,
    choroplethView,
    subdivisionLevel,
    fundingSubdivisions,
  ]);

  // Lazily-loaded GeoJSON per geometry level (Fylke / Kommune).
  const geoRef = React.useRef<Partial<Record<MapLevel, GeoJSON.FeatureCollection>>>(
    {},
  );
  const choroplethPopupRef = React.useRef<maplibregl.Popup | null>(null);
  const prevActiveRef = React.useRef(false);
  // City/poststed has no polygons → render it on the kommune geometry.
  const mapLevel: MapLevel = subdivisionLevel === "fylke" ? "fylke" : "kommune";

  // Resolve user location once, but DON'T re-center the map — OpenSubsidies
  // is a global dashboard that should default to a world view.
  React.useEffect(() => {
    const getLocationFromIP = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = (await response.json()) as {
          latitude?: number;
          longitude?: number;
        };
        if (data.latitude && data.longitude) {
          setUserLocation({ lat: data.latitude, lng: data.longitude });
        }
      } catch {
        /* swallow */
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          getLocationFromIP();
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
      );
    } else {
      getLocationFromIP();
    }
  }, [setUserLocation]);

  const closePopup = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringPopupRef.current && popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    }, 150);
  }, []);

  // ── Fylke choropleth plumbing ────────────────────────────────────────────
  const FYLKE_SRC = "no-fylker";
  const FYLKE_FILL = "no-fylker-fill";
  const FYLKE_LINE = "no-fylker-line";

  // Latest render context for the (once-registered) map event handlers, so they
  // never read stale metric / view / provider values.
  const choroCtxRef = React.useRef({
    metric: subdivisionMetric as "sum" | "count",
    provider: false,
    displayCurrency: displayCurrency as DisplayCurrency,
  });
  choroCtxRef.current = {
    metric: subdivisionMetric,
    provider: !!fundingProviderId,
    displayCurrency,
  };

  const fmtChoroplethVal = React.useCallback(
    (val: number, has: boolean): string => {
      if (!has) return "no data";
      if (choroCtxRef.current.metric === "count")
        return `${Math.round(val).toLocaleString()} awards`;
      const cur = choroCtxRef.current.displayCurrency;
      const body = fromEur(val, cur);
      const compact =
        body >= 1e9
          ? `${(body / 1e9).toFixed(1)}B`
          : body >= 1e6
            ? `${(body / 1e6).toFixed(1)}M`
            : body >= 1e3
              ? `${(body / 1e3).toFixed(0)}K`
              : `${Math.round(body)}`;
      return cur === "NOK" ? `${compact} kr` : `${CURRENCY_SYMBOL[cur]}${compact}`;
    },
    [],
  );

  const onFylkeClick = React.useCallback(
    (e: maplibregl.MapLayerMouseEvent) => {
      const code = e.features?.[0]?.properties?._code as string | undefined;
      // Aggregate mode → drill into the Fylke's recipients. Provider mode keeps
      // the provider's flow on screen (no per-Fylke recipient rollup yet).
      if (code && !choroCtxRef.current.provider) setFundingScope(code);
    },
    [setFundingScope],
  );

  const onFylkeHover = React.useCallback((e: maplibregl.MapLayerMouseEvent) => {
    const map = mapRef.current;
    const f = e.features?.[0];
    if (!map || !f) return;
    map.getCanvas().style.cursor = "pointer";
    const code = f.properties?._code as string;
    const val = Number(f.properties?._val ?? 0);
    const has = Number(f.properties?._has ?? 0) === 1;
    const html = `<div class="px-2 py-1 text-xs"><div class="font-medium">${subdivisionLabel(
      code,
    )}</div><div class="tabular-nums text-muted-foreground">${fmtChoroplethVal(
      val,
      has,
    )}</div></div>`;
    if (!choroplethPopupRef.current) {
      choroplethPopupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "location-hover-popup",
      });
    }
    choroplethPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
  }, [fmtChoroplethVal]);

  const onFylkeLeave = React.useCallback(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "";
    if (choroplethPopupRef.current) {
      choroplethPopupRef.current.remove();
      choroplethPopupRef.current = null;
    }
  }, []);

  // Build the data-join + paint and toggle visibility. Safe to call repeatedly;
  // re-adds the source/layers after a style reload (theme / basemap switch).
  const applyChoropleth = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const geo = geoRef.current[mapLevel];

    if (!geo || !choroplethActive) {
      if (map.getLayer(FYLKE_FILL))
        map.setLayoutProperty(FYLKE_FILL, "visibility", "none");
      if (map.getLayer(FYLKE_LINE))
        map.setLayoutProperty(FYLKE_LINE, "visibility", "none");
      if (choroplethPopupRef.current) {
        choroplethPopupRef.current.remove();
        choroplethPopupRef.current = null;
      }
      return;
    }

    const valByCode = new Map<string, number>();
    for (const d of choroplethData) {
      valByCode.set(
        d.subdivision,
        subdivisionMetric === "count" ? d.awardCount : d.sumEur,
      );
    }
    const codeOf = MAP_LEVELS[mapLevel].codeOf;
    let max = 0;
    const features = geo.features.map((f) => {
      const code = codeOf(f.properties ?? {});
      const val = valByCode.get(code);
      if (val != null && val > max) max = val;
      return {
        ...f,
        properties: {
          ...f.properties,
          _code: code,
          _val: val ?? 0,
          _has: val != null ? 1 : 0,
        },
      };
    });
    const merged = {
      type: "FeatureCollection",
      features,
    } as GeoJSON.FeatureCollection;

    if (!map.getSource(FYLKE_SRC)) {
      map.addSource(FYLKE_SRC, { type: "geojson", data: merged });
      map.addLayer({
        id: FYLKE_FILL,
        type: "fill",
        source: FYLKE_SRC,
        paint: { "fill-color": "#cccccc", "fill-opacity": 0 },
      });
      map.addLayer({
        id: FYLKE_LINE,
        type: "line",
        source: FYLKE_SRC,
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.6,
          "line-opacity": 0.7,
        },
      });
      map.on("click", FYLKE_FILL, onFylkeClick);
      map.on("mousemove", FYLKE_FILL, onFylkeHover);
      map.on("mouseleave", FYLKE_FILL, onFylkeLeave);
    } else {
      (map.getSource(FYLKE_SRC) as maplibregl.GeoJSONSource).setData(merged);
    }

    const [c0, c1] = CHOROPLETH_RAMP[choroplethView];
    const hi = max > 0 ? max : 1;
    map.setPaintProperty(FYLKE_FILL, "fill-color", [
      "interpolate",
      ["linear"],
      ["get", "_val"],
      0,
      c0,
      hi,
      c1,
    ]);
    map.setPaintProperty(FYLKE_FILL, "fill-opacity", [
      "case",
      ["==", ["get", "_has"], 1],
      0.78,
      0.05,
    ]);
    map.setLayoutProperty(FYLKE_FILL, "visibility", "visible");
    map.setLayoutProperty(FYLKE_LINE, "visibility", "visible");
  }, [
    choroplethActive,
    choroplethData,
    choroplethView,
    subdivisionMetric,
    mapLevel,
    onFylkeClick,
    onFylkeHover,
    onFylkeLeave,
  ]);

  // Keep a ref to the latest applyChoropleth so the once-registered style.load
  // handler (in the init effect) can re-add layers after a basemap/theme switch.
  const applyChoroplethRef = React.useRef(applyChoropleth);
  React.useEffect(() => {
    applyChoroplethRef.current = applyChoropleth;
  }, [applyChoropleth]);

  // Load the active level's polygons on demand (cached per level), then apply.
  React.useEffect(() => {
    if (geoRef.current[mapLevel]) {
      applyChoroplethRef.current();
      return;
    }
    let cancelled = false;
    fetch(MAP_LEVELS[mapLevel].file)
      .then((r) => r.json())
      .then((g: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        geoRef.current[mapLevel] = g;
        applyChoroplethRef.current();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mapLevel]);

  // Re-apply whenever the active state / data / metric changes.
  React.useEffect(() => {
    applyChoropleth();
  }, [applyChoropleth]);

  // Fly to Norway when the choropleth first activates.
  React.useEffect(() => {
    if (choroplethActive && !prevActiveRef.current && mapRef.current) {
      isAnimatingRef.current = true;
      mapRef.current.flyTo({
        center: NORWAY_VIEW.center,
        zoom: NORWAY_VIEW.zoom,
        essential: true,
      });
    }
    prevActiveRef.current = choroplethActive;
  }, [choroplethActive]);

  // Initialize map once
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: [mapCenter.lng, mapCenter.lat],
      zoom: mapZoom,
      minZoom: 0.7,
      maxZoom: 18,
      attributionControl: false,
    });

    // Render as a 3D globe rather than a flat web-mercator map. The projection
    // (and the atmosphere/sky halo) live on the style, and `setStyle` — fired
    // by the theme / basemap toggle — resets them, so we re-apply on every
    // `style.load`, not just once at construction.
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      map.setSky({
        "sky-color": "#a7c7e7",
        "sky-horizon-blend": 0.6,
        "horizon-color": "#e8eef5",
        "horizon-fog-blend": 0.6,
        "fog-color": "#d9e4f0",
        "fog-ground-blend": 0.2,
        // Fade the atmosphere out as the user zooms in to street level.
        "atmosphere-blend": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1,
          7,
          1,
          11,
          0,
        ],
      });
      // Custom sources/layers are dropped on style reload — re-add the Fylke
      // choropleth (no-op when inactive or the GeoJSON hasn't loaded yet).
      applyChoroplethRef.current();
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("moveend", () => {
      if (isAnimatingRef.current) {
        isAnimatingRef.current = false;
        return;
      }
      const center = map.getCenter();
      const zoom = map.getZoom();
      setMapCenter({ lat: center.lat, lng: center.lng });
      setMapZoom(zoom);
    });

    mapRef.current = map;

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(getMapStyleUrl());
  }, [mapStyle, resolvedTheme, getMapStyleUrl]);

  // (User-location marker removed — no black dot on the map. Selecting a
  // place just flies/zooms the camera there; userLocation is still used by the
  // "locate" control to recenter, just without a visible pin.)

  // Per-grant pin factory — shared by tier='pin' and the unclustered-point
  // case inside tier='cluster'. Keeps the existing hover/select/popup
  // behavior intact and centralized.
  const buildGrantPinElement = React.useCallback(
    (grant: Grant) => {
      const funder = funderById.get(grant.funderId);
      const pinColor = INSTRUMENT_COLOR[grant.instrumentType];
      const statusColor = STATUS_COLOR[grant.status];
      const isSelected = selectedGrantId === grant.id;

      const el = document.createElement("div");
      el.className = "grant-marker-container";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute(
        "aria-label",
        `${grant.name} — ${funder?.shortName ?? ""}, ${STATUS_LABEL[grant.status]}`,
      );
      el.innerHTML = `
        <div class="relative cursor-pointer transition-transform duration-150 origin-bottom ${
          isSelected ? "scale-125 z-30" : "hover:scale-110"
        }">
          <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25));">
            <path d="M17 0C7.611 0 0 7.611 0 17C0 30 17 42 17 42C17 42 34 30 34 17C34 7.611 26.389 0 17 0Z" fill="${
              isSelected ? "var(--foreground)" : pinColor
            }"/>
            <circle cx="17" cy="15" r="9" fill="white"/>
            <circle cx="17" cy="15" r="6" fill="${statusColor}"/>
          </svg>
          ${
            isSelected
              ? '<div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-foreground/30 animate-ping"></div>'
              : ""
          }
          ${
            grant.status === "closing-soon"
              ? '<div class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-500 animate-pulse border-2 border-white"></div>'
              : ""
          }
        </div>
      `;

      el.addEventListener("click", () => {
        selectGrant(grant.id);
      });

      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectGrant(grant.id);
        }
      });

      el.addEventListener("mouseenter", () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        if (popupRef.current) popupRef.current.remove();

        const faviconUrl = funder?.faviconUrl ?? "";
        const funderName = funder?.name ?? "";

        const popupIconHtml = faviconUrl
          ? `<img class="popup-favicon-img" src="${escapeHtml(faviconUrl)}"
                   alt="${escapeHtml(funderName)} logo"
                   loading="lazy" decoding="async" referrerpolicy="no-referrer"
                   onerror="this.style.display='none'" />`
          : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" aria-hidden="true">
               <path d="M3 21V8a2 2 0 0 1 2-2h2V4h10v2h2a2 2 0 0 1 2 2v13"/>
               <path d="M3 21h18"/><path d="M9 21V11"/><path d="M15 21V11"/>
             </svg>`;

        const popupBackdropHtml = faviconUrl
          ? `<div class="grant-popup-bg" aria-hidden="true">
               <div class="grant-popup-bg-inner">
                 <img class="grant-popup-bg-img" src="${escapeHtml(faviconUrl)}"
                      alt="" aria-hidden="true" loading="lazy" decoding="async"
                      referrerpolicy="no-referrer"
                      onerror="this.parentElement.parentElement.style.display='none'" />
               </div>
             </div>`
          : "";

        const amountText = fmtAmountRange(grant.minAmount, grant.maxAmount, grant.currency);

        const popupContent = `
          <div class="grant-popup" data-popup-hover="true">
            ${popupBackdropHtml}
            <div class="grant-popup-content">
              <div class="popup-header">
                <div class="popup-icon">
                  ${popupIconHtml}
                </div>
                <div class="popup-title-section">
                  <div class="popup-funder-line">
                    <span class="popup-funder">${escapeHtml(funder?.shortName ?? "")}</span>
                    <span class="popup-status" style="color:${statusColor}">● ${STATUS_LABEL[grant.status]}</span>
                  </div>
                  <h3 class="popup-title">${escapeHtml(grant.name)}</h3>
                  <p class="popup-category" style="color:${pinColor}">${escapeHtml(INSTRUMENT_LABEL[grant.instrumentType])}</p>
                </div>
              </div>

              ${grant.description ? `<p class="popup-description">${escapeHtml(grant.description)}</p>` : ""}

              <div class="popup-stats">
                ${amountText ? `<div class="popup-stat">
                  <span class="popup-stat-label">Funding</span>
                  <span class="popup-stat-value">${escapeHtml(amountText)}</span>
                </div>` : ""}
                <div class="popup-stat">
                  <span class="popup-stat-label">Deadline</span>
                  <span class="popup-stat-value popup-stat-deadline">${escapeHtml(fmtDeadline(grant.closesAt, grant.status, grant.applicationMode))}</span>
                </div>
              </div>

              <div class="popup-footer">
                <span class="popup-scope">${escapeHtml(funder?.countryName ?? "")}</span>
                ${funder?.type ? `<span class="popup-budget">${escapeHtml(funder.type)}</span>` : ""}
              </div>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({
          offset: [0, -38],
          closeButton: false,
          closeOnClick: false,
          className: "location-hover-popup",
          maxWidth: "400px",
        })
          .setLngLat([grant.coordinates.lng, grant.coordinates.lat])
          .setHTML(popupContent)
          .addTo(mapRef.current!);

        const popupElement = popup.getElement();
        if (popupElement) {
          popupElement.addEventListener("mouseenter", () => {
            isHoveringPopupRef.current = true;
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
          });
          popupElement.addEventListener("mouseleave", () => {
            isHoveringPopupRef.current = false;
            closePopup();
          });
          popupElement.addEventListener("click", () => {
            selectGrant(grant.id);
            popup.remove();
            popupRef.current = null;
          });
        }

        popupRef.current = popup;
      });

      el.addEventListener("mouseleave", () => closePopup());

      return el;
    },
    [funderById, selectGrant, selectedGrantId, closePopup],
  );

  // Tier-aware marker rendering.
  // Re-runs on grants change, selection change, zoom change, or pan
  // (pan only matters for the cluster tier's bbox query — cheap otherwise).
  React.useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const map = mapRef.current;
    const tier = tierForZoom(mapZoom);

    // Funding views render one consistent layer of money-sized country bubbles
    // at every zoom, then return — the discover tiers below stay untouched, so a
    // bug here can never break the discover map.
    if (panelView === "received" || panelView === "awarded") {
      // Money-flow country bubbles are DISABLED — the Fylke/Kommune choropleth
      // (see applyChoropleth) is the funding visualization now. Render no
      // markers in funding views. (Old bubble code commented out below.)
      return;
      // fundingBubbles.forEach((b) => {
      //   const el = createClusterMarkerElement({
      //     count: null, label: b.code, variant: "country",
      //     displayValue: b.displayValue, magnitude: b.magnitude,
      //     tone: panelView === "received" ? "received" : "awarded",
      //     onClick: () => {
      //       setFundingScope(b.code);
      //       setMapCenter({ lat: b.lat, lng: b.lng });
      //       setMapZoom(Math.max(mapZoom, COUNTRY_TIER_MAX_ZOOM - 0.5));
      //     },
      //   });
      //   new maplibregl.Marker({ element: el }).setLngLat([b.lng, b.lat]).addTo(map);
      // });
    }

    if (tier === "continent") {
      continentBubbles.forEach((b) => {
        const el = createClusterMarkerElement({
          count: b.count,
          label: b.name,
          variant: "country",
          onClick: () => {
            setMapCenter({ lat: b.lat, lng: b.lng });
            setMapZoom(Math.max(mapZoom, CONTINENT_TIER_MAX_ZOOM + 0.5));
          },
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([b.lng, b.lat])
          .addTo(map);
        markersRef.current.set(`continent:${b.name}`, marker);
      });
      return;
    }

    if (tier === "country") {
      countryBubbles.forEach((b) => {
        const el = createClusterMarkerElement({
          count: b.count,
          label: b.code,
          variant: "country",
          onClick: () => {
            setMapCenter({ lat: b.lat, lng: b.lng });
            setMapZoom(Math.max(mapZoom, COUNTRY_TIER_MAX_ZOOM + 1.5));
          },
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([b.lng, b.lat])
          .addTo(map);
        markersRef.current.set(`country:${b.code}`, marker);
      });
      return;
    }

    if (tier === "cluster") {
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const features = getVisibleClusters(clusterIndex, bbox, mapZoom);

      features.forEach((feature) => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];

        if (isClusterFeature(feature)) {
          const clusterId = feature.properties.cluster_id;
          const count = featureMetricValue(feature, metricMode);
          const el = createClusterMarkerElement({
            count,
            variant: "cluster",
            onClick: () => {
              let nextZoom: number;
              try {
                nextZoom = clusterIndex.getClusterExpansionZoom(clusterId);
              } catch {
                nextZoom = mapZoom + 2;
              }
              setMapCenter({ lat, lng });
              setMapZoom(
                Math.min(18, Math.max(mapZoom + 1, nextZoom)),
              );
            },
          });
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
          markersRef.current.set(`cluster:${clusterId}`, marker);
          return;
        }

        // Unclustered point = one funder. Bubble shows the metric for that
        // single funder (1 provider, its scheme count, or — for funding).
        // Clicking zooms into pin tier where the funder's grants render.
        const funderId = feature.properties.funderId;
        const el = createClusterMarkerElement({
          count: featureMetricValue(feature, metricMode),
          variant: "cluster",
          onClick: () => {
            setMapCenter({ lat, lng });
            setMapZoom(Math.max(mapZoom + 2, CLUSTER_TIER_MAX_ZOOM + 1));
          },
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.set(`funder:${funderId}`, marker);
      });
      return;
    }

    // tier === 'pin': render every filtered grant as an individual pin.
    grants.forEach((grant) => {
      const el = buildGrantPinElement(grant);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([grant.coordinates.lng, grant.coordinates.lat])
        .addTo(map);
      markersRef.current.set(grant.id, marker);
    });
  }, [
    grants,
    selectedGrantId,
    mapZoom,
    mapCenter,
    clusterIndex,
    countryBubbles,
    continentBubbles,
    metricMode,
    buildGrantPinElement,
    setMapCenter,
    setMapZoom,
    panelView,
    fundingBubbles,
    setFundingScope,
    choroplethActive,
  ]);

  // Fly to selected grant
  React.useEffect(() => {
    if (!mapRef.current || !selectedGrantId) return;
    const grant = grants.find((g) => g.id === selectedGrantId);
    if (!grant) return;
    isAnimatingRef.current = true;
    mapRef.current.flyTo({
      center: [grant.coordinates.lng, grant.coordinates.lat],
      zoom: Math.max(mapRef.current.getZoom(), CLUSTER_TIER_MAX_ZOOM + 1),
      essential: true,
    });
  }, [selectedGrantId, grants]);

  const lastCenterRef = React.useRef({
    lat: mapCenter.lat,
    lng: mapCenter.lng,
  });
  const lastZoomRef = React.useRef(mapZoom);

  React.useEffect(() => {
    if (!mapRef.current) return;
    const centerChanged =
      Math.abs(lastCenterRef.current.lat - mapCenter.lat) > 0.0001 ||
      Math.abs(lastCenterRef.current.lng - mapCenter.lng) > 0.0001;
    const zoomChanged = Math.abs(lastZoomRef.current - mapZoom) > 0.1;
    if (centerChanged || zoomChanged) {
      isAnimatingRef.current = true;
      mapRef.current.flyTo({
        center: [mapCenter.lng, mapCenter.lat],
        zoom: mapZoom,
        essential: true,
      });
      lastCenterRef.current = { lat: mapCenter.lat, lng: mapCenter.lng };
      lastZoomRef.current = mapZoom;
    }
  }, [mapCenter, mapZoom]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Compatibility export — expose `Grant` so any legacy import keeps working.
export type { Grant };
