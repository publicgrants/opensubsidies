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
  const userMarkerRef = React.useRef<maplibregl.Marker | null>(null);
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
    userLocation,
    setUserLocation,
    getFilteredGrants,
    metricMode,
    funders,
    panelView,
    displayCurrency,
    fundingAggregates,
    setFundingScope,
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

  // User location marker
  React.useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      return;
    }

    const el = document.createElement("div");
    el.className = "user-marker";
    el.innerHTML = `
      <div class="relative">
        <div class="w-3 h-3 rounded-full bg-foreground border-2 border-background shadow-lg"></div>
        <div class="absolute inset-0 w-3 h-3 rounded-full bg-foreground/40 animate-ping"></div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(mapRef.current);

    userMarkerRef.current = marker;
  }, [userLocation]);

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
      fundingBubbles.forEach((b) => {
        const el = createClusterMarkerElement({
          count: null,
          label: b.code,
          variant: "country",
          displayValue: b.displayValue,
          magnitude: b.magnitude,
          tone: panelView === "received" ? "received" : "awarded",
          onClick: () => {
            setFundingScope(b.code);
            setMapCenter({ lat: b.lat, lng: b.lng });
            setMapZoom(Math.max(mapZoom, COUNTRY_TIER_MAX_ZOOM - 0.5));
          },
        });
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([b.lng, b.lat])
          .addTo(map);
        markersRef.current.set(`funding:${b.code}`, marker);
      });
      return;
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
