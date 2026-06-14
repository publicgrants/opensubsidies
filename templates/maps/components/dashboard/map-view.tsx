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
// Geometry-backed subdivision levels. Each maps a GeoJSON file + a function that
// derives the join code from a feature's properties (matching the rollup's
// `subdivision` codes). City/poststed has no polygon geometry, so the map falls
// back to the kommune layer for it (city granularity still drives leaderboards).
const MAP_LEVELS: Record<
  "world" | "fylke" | "kommune",
  { file: string; codeOf: (props: Record<string, unknown>) => string }
> = {
  // Discover view: whole-globe country choropleth, joined by ISO 3166-1 alpha-2.
  world: {
    file: "/geo/world-countries.json",
    codeOf: (p) => String(p.code ?? ""),
  },
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

// Discover (provider/scheme density) colour ramp — distinct from the funding
// received/awarded ramps.
const DISCOVER_RAMP: [string, string] = ["#e0e7ff", "#4338ca"];

// Linearly blend two #rrggbb colours (t in [0,1]) — used to derive a mid stop
// for the log-scaled funding ramp so the middle of the range reads clearly.
function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

// Supranational funder "countries" have no single polygon — kept off the world
// choropleth and surfaced as offshore flag markers instead. EU sits in the
// Atlantic next to Europe; the others are parked nearby in open ocean.
const SUPRA_MARKERS: {
  code: string;
  label: string;
  emoji: string;
  at: { lng: number; lat: number };
}[] = [
  { code: "EU", label: "EU", emoji: "🇪🇺", at: { lng: -24, lat: 47 } },
  { code: "CoE", label: "Council of Europe", emoji: "🏛️", at: { lng: -24, lat: 41 } },
  { code: "INTL", label: "International", emoji: "🌐", at: { lng: -38, lat: 33 } },
];
const SUPRANATIONAL = new Set(SUPRA_MARKERS.map((m) => m.code));

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
    fundingProviderId,
    subdivisionMetric,
    setSelectedCountry,
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

  // ── Unified choropleth spec ──────────────────────────────────────────────
  // One feature-state engine drives the whole globe:
  //  • discover → WORLD country choropleth coloured by provider/scheme density
  //  • received/awarded (focused on Norway / a provider) → Fylke/Kommune money flow
  // `data` is a code→value map (code = the geometry's join code = feature id).
  const choro = React.useMemo<{
    active: boolean;
    level: MapLevel;
    kind: "discover" | "funding";
    data: Map<string, number>;
    ramp: [string, string];
    scale: "linear" | "log";
  }>(() => {
    if (panelView === "discover") {
      const data = new Map<string, number>();
      for (const f of funders) {
        if (SUPRANATIONAL.has(f.country)) continue; // EU etc. → ocean flag marker
        const inc = metricMode === "schemes" ? f.schemes || 0 : 1; // else provider count
        data.set(f.country, (data.get(f.country) ?? 0) + inc);
      }
      return { active: true, level: "world", kind: "discover", data, ramp: DISCOVER_RAMP, scale: "linear" };
    }
    // Funding views: GLOBAL world-country money-flow choropleth. Each country is
    // shaded by the money it received / awarded (from the funding_country rollup,
    // already loaded into fundingAggregates by setPanelView). € totals span ~6
    // orders of magnitude (US ≈ $945B vs tiny recipients), so we colour on a LOG
    // scale to keep the map readable.
    //
    // The Norway Fylke/Kommune sub-national drill-down is SHELVED (not deleted):
    // its rollups (funding_subdivision), geometry (MAP_LEVELS.fylke/kommune) and
    // store plumbing remain in place for an easy revive. See git history.
    const view: "received" | "awarded" = panelView === "awarded" ? "awarded" : "received";
    const rows = fundingAggregates[view]?.countries ?? [];
    const data = new Map<string, number>();
    for (const c of rows) {
      if (c.country === "ALL") continue; // global hero total, not a polygon
      if (SUPRANATIONAL.has(c.country)) continue; // EU/CoE/INTL → offshore markers
      data.set(c.country, subdivisionMetric === "count" ? c.awardCount : c.sumEur);
    }
    return {
      active: data.size > 0,
      level: "world",
      kind: "funding",
      data,
      ramp: CHOROPLETH_RAMP[view],
      scale: "log",
    };
  }, [panelView, funders, metricMode, fundingAggregates, subdivisionMetric]);

  const choroplethActive = choro.active;
  const mapLevel: MapLevel = choro.level;

  // Lazily-loaded GeoJSON per geometry level (World / Fylke / Kommune).
  const geoRef = React.useRef<Partial<Record<MapLevel, GeoJSON.FeatureCollection>>>(
    {},
  );
  const choroplethPopupRef = React.useRef<maplibregl.Popup | null>(null);
  // Which geometry is currently uploaded to the single choropleth source — so we
  // only re-upload polygons when the LEVEL changes, never on a colour change.
  const loadedLevelRef = React.useRef<MapLevel | null>(null);
  // Active metric value per region code, for the (once-registered) hover handler
  // (values now live in feature-state, not in feature properties).
  const valByCodeRef = React.useRef<Map<string, number>>(new Map());

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
  // never read stale metric / view / provider / kind values.
  const choroCtxRef = React.useRef<{
    metric: "sum" | "count";
    kind: "discover" | "funding";
    metricMode: string;
    provider: boolean;
    displayCurrency: DisplayCurrency;
  }>({
    metric: subdivisionMetric,
    kind: "discover",
    metricMode,
    provider: false,
    displayCurrency,
  });
  choroCtxRef.current = {
    metric: subdivisionMetric,
    kind: choro.kind,
    metricMode,
    provider: !!fundingProviderId,
    displayCurrency,
  };

  const fmtChoroplethVal = React.useCallback(
    (val: number, has: boolean): string => {
      if (!has) return "no data";
      const ctx = choroCtxRef.current;
      // Discover (world) values are provider/scheme COUNTS, not money.
      if (ctx.kind === "discover") {
        const noun = ctx.metricMode === "schemes" ? "schemes" : "providers";
        return `${Math.round(val).toLocaleString()} ${noun}`;
      }
      if (ctx.metric === "count")
        return `${Math.round(val).toLocaleString()} awards`;
      const cur = ctx.displayCurrency;
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
      if (!code) return;
      const ctx = choroCtxRef.current;
      if (ctx.kind === "discover") {
        // Click a country → filter the schemes list to it.
        setSelectedCountry(code);
      } else if (!ctx.provider) {
        // Funding aggregate mode → drill into the Fylke's recipients.
        // (Provider mode keeps the provider's flow on screen.)
        setFundingScope(code);
      }
    },
    [setFundingScope, setSelectedCountry],
  );

  const onFylkeHover = React.useCallback((e: maplibregl.MapLayerMouseEvent) => {
    const map = mapRef.current;
    const f = e.features?.[0];
    if (!map || !f) return;
    map.getCanvas().style.cursor = "pointer";
    const code = f.properties?._code as string;
    // The geometry carries a display name (country / Fylke / Kommune); fall back
    // to the subdivision label table.
    const name = (f.properties?.name as string) || subdivisionLabel(code);
    const v = valByCodeRef.current.get(code);
    const has = v != null;
    const html = `<div class="px-2 py-1 text-xs"><div class="font-medium">${name}</div><div class="tabular-nums text-muted-foreground">${fmtChoroplethVal(
      v ?? 0,
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

    // Active value per region code (= feature id via promoteId).
    const valByCode = choro.data;
    let max = 0;
    for (const v of valByCode.values()) if (v > max) max = v;
    valByCodeRef.current = valByCode;

    // Source + layers are created ONCE. `promoteId: "_code"` makes each region's
    // join code its feature id, so colours are driven by feature-state. Geometry
    // is only re-uploaded when the LEVEL changes (different polygons); a metric
    // or data change updates feature-state only — no re-tessellation, no GPU
    // re-upload (the cheap path the perf review recommended).
    if (!map.getSource(FYLKE_SRC)) {
      map.addSource(FYLKE_SRC, { type: "geojson", data: geo, promoteId: "_code" });
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
      loadedLevelRef.current = mapLevel;
    } else if (loadedLevelRef.current !== mapLevel) {
      // Level changed → swap polygons (the only case that re-uploads geometry).
      (map.getSource(FYLKE_SRC) as maplibregl.GeoJSONSource).setData(geo);
      loadedLevelRef.current = mapLevel;
    }

    // Re-colour via feature-state: clear, then set val/has for regions with data.
    map.removeFeatureState({ source: FYLKE_SRC });
    for (const [code, v] of valByCode) {
      map.setFeatureState({ source: FYLKE_SRC, id: code }, { val: v, has: 1 });
    }

    const [c0, c1] = choro.ramp;
    const hi = max > 0 ? max : 1;
    // Linear for discover (provider/scheme counts), log for funding € totals
    // (which span many orders of magnitude). For log we colour by ln(1 + val) so
    // 0 maps to the light end and the largest value to the strong end, with a mid
    // stop to spread the middle of the range.
    const valExpr = ["coalesce", ["feature-state", "val"], 0];
    const fillColor =
      choro.scale === "log"
        ? [
            "interpolate",
            ["linear"],
            ["ln", ["+", 1, valExpr]],
            0,
            c0,
            Math.log(1 + hi) / 2,
            mixHex(c0, c1, 0.5),
            Math.log(1 + hi),
            c1,
          ]
        : ["interpolate", ["linear"], valExpr, 0, c0, hi, c1];
    map.setPaintProperty(FYLKE_FILL, "fill-color", fillColor);
    map.setPaintProperty(FYLKE_FILL, "fill-opacity", [
      "case",
      ["==", ["coalesce", ["feature-state", "has"], 0], 1],
      0.78,
      0.05,
    ]);
    map.setLayoutProperty(FYLKE_FILL, "visibility", "visible");
    map.setLayoutProperty(FYLKE_LINE, "visibility", "visible");
  }, [
    choroplethActive,
    choro,
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
        // Bake the join code into each feature so `promoteId: "_code"` can use it
        // as the feature id for feature-state colouring.
        const codeOf = MAP_LEVELS[mapLevel].codeOf;
        g.features = g.features.map((f) => ({
          ...f,
          properties: { ...f.properties, _code: codeOf(f.properties ?? {}) },
        }));
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

  // Funding views are now GLOBAL (world-country choropleth), so the camera stays
  // at the world view — no auto fly-to. (Previously this flew to a hardcoded
  // Norway view when the Fylke choropleth activated; that sub-national layer is
  // shelved. See git history to revive a per-country fly-to on drill-down.)

  // Supranational funders (EU / CoE / INTL) have no country polygon, so each is
  // surfaced as a flag marker parked offshore (EU in the Atlantic next to Europe;
  // the rest nearby) on EVERY lens. On discover the chip shows the group's scheme
  // count (click → filter the list); on a funding lens it shows the money the
  // group received / awarded (click → focus its leaderboard). The EU is the
  // single largest awarder, so keeping it visible on the funding lenses matters.
  const supraMarkersRef = React.useRef<Map<string, maplibregl.Marker>>(new Map());
  // Latest click handler per lens, read by the (once-attached) marker listeners.
  const supraClickRef = React.useRef<(code: string) => void>(() => {});
  supraClickRef.current = (code: string) => {
    if (panelView === "discover") setSelectedCountry(code);
    else setFundingScope(code);
  };
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = supraMarkersRef.current;

    const fundingView: "received" | "awarded" | null =
      panelView === "received" || panelView === "awarded" ? panelView : null;

    // Per-code label for the active lens, or null when the group has no data.
    const labelFor = (code: string): string | null => {
      if (!fundingView) {
        let schemes = 0;
        for (const f of funders)
          if (f.country === code) schemes += f.schemes || 0;
        return schemes > 0 ? `${schemes.toLocaleString()} schemes` : null;
      }
      const row = fundingAggregates[fundingView]?.countries.find(
        (c) => c.country === code,
      );
      if (!row) return null;
      if (subdivisionMetric === "count")
        return `${row.awardCount.toLocaleString()} awards`;
      const body = fromEur(row.sumEur, displayCurrency);
      const compact =
        body >= 1e9
          ? `${(body / 1e9).toFixed(1)}B`
          : body >= 1e6
            ? `${(body / 1e6).toFixed(1)}M`
            : body >= 1e3
              ? `${(body / 1e3).toFixed(0)}K`
              : `${Math.round(body)}`;
      return displayCurrency === "NOK"
        ? `${compact} kr`
        : `${CURRENCY_SYMBOL[displayCurrency]}${compact}`;
    };

    for (const spec of SUPRA_MARKERS) {
      const valueLabel = labelFor(spec.code);
      const existing = markers.get(spec.code);
      if (valueLabel === null) {
        // No data for this group on the active lens → no marker.
        if (existing) {
          existing.remove();
          markers.delete(spec.code);
        }
        continue;
      }
      if (!existing) {
        const el = document.createElement("button");
        el.type = "button";
        el.style.cssText =
          "display:flex;align-items:center;gap:5px;background:#1b3a8c;color:#fff;" +
          "border:1px solid rgba(255,255,255,0.55);border-radius:9999px;padding:3px 9px;" +
          "font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;" +
          "box-shadow:0 2px 6px rgba(0,0,0,0.35);";
        el.innerHTML = `<span style="font-size:14px;line-height:1">${spec.emoji}</span><span class="supra-count"></span>`;
        el.addEventListener("click", () => supraClickRef.current(spec.code));
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([spec.at.lng, spec.at.lat])
          .addTo(map);
        markers.set(spec.code, marker);
      }
      const markerEl = markers.get(spec.code)!.getElement();
      markerEl.title = fundingView
        ? `${spec.label} — click to focus its ${fundingView === "received" ? "recipients" : "funders"}`
        : `${spec.label} funders — click to see their grant schemes`;
      const countEl = markerEl.querySelector(".supra-count");
      if (countEl) countEl.textContent = `${spec.label} · ${valueLabel}`;
    }
  }, [panelView, funders, fundingAggregates, subdivisionMetric, displayCurrency, setSelectedCountry, setFundingScope]);

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

    // Choropleth-only globe: the discover (world country) and funding
    // (Fylke/Kommune) views are BOTH rendered as fill layers by applyChoropleth.
    // We no longer place continent/country/cluster bubbles or grant pins. The
    // tier code below is retained but unreachable, to ease re-enabling pins later.
    return;

    // (Unreachable — retained for easy pin re-enable. `!` since control-flow
    // narrowing from the guard above doesn't carry past the early return.)
    const map = mapRef.current!;
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
