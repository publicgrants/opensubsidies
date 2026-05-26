"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { useGrantsStore } from "@/store/maps-store";
import {
  categories,
  funders,
  type Grant,
  type GrantStatus,
} from "@/mock-data/locations";

const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  streets: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  outdoors: "https://tiles.stadiamaps.com/styles/outdoors.json",
  satellite: "https://tiles.stadiamaps.com/styles/alidade_satellite.json",
};

const STATUS_COLOR: Record<GrantStatus, string> = {
  open: "#10b981", // green
  "closing-soon": "#f97316", // orange
  upcoming: "#3b82f6", // blue
  closed: "#9ca3af", // muted grey
};

const STATUS_LABEL: Record<GrantStatus, string> = {
  open: "Open",
  "closing-soon": "Closing soon",
  upcoming: "Upcoming",
  closed: "Closed",
};

function fmtCurrency(n: number) {
  if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function fmtDeadline(iso: string, status: GrantStatus): string {
  const days = daysUntil(iso);
  if (status === "closed") return "Closed";
  if (status === "upcoming") return `Opens in ${Math.max(0, days)} days`;
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 30) return `${days} days left`;
  if (days <= 60) return `${Math.floor(days / 7)} weeks left`;
  return new Date(iso).toLocaleDateString("en-GB", {
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
  } = useGrantsStore();

  const getMapStyleUrl = React.useCallback(() => {
    if (mapStyle === "default") {
      return resolvedTheme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;
    }
    return MAP_STYLES[mapStyle];
  }, [mapStyle, resolvedTheme]);

  const grants = getFilteredGrants();

  // Resolve user location once, but DON'T re-center the map — Grant.com is a
  // global dashboard that should default to a world view.
  React.useEffect(() => {
    const getLocationFromIP = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
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
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
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
      minZoom: 1.5,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
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

  // Grant markers
  React.useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    grants.forEach((grant) => {
      const sector = categories.find((c) => c.id === grant.sectorId);
      const funder = funders.find((f) => f.id === grant.funderId);
      const sectorColor = sector?.color || "#6b7280";
      const statusColor = STATUS_COLOR[grant.status];
      const isSelected = selectedGrantId === grant.id;

      const el = document.createElement("div");
      el.className = "grant-marker-container";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute(
        "aria-label",
        `${grant.name} — ${funder?.shortName ?? ""}, ${STATUS_LABEL[grant.status]}`
      );
      // Marker = sector-colored pin, ringed by status color.
      // transform-origin: bottom keeps the pin tip anchored on hover/select
      // (no layout shift relative to the actual map coordinate).
      el.innerHTML = `
        <div class="relative cursor-pointer transition-transform duration-150 origin-bottom ${
          isSelected ? "scale-125 z-30" : "hover:scale-110"
        }">
          <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.25));">
            <path d="M17 0C7.611 0 0 7.611 0 17C0 30 17 42 17 42C17 42 34 30 34 17C34 7.611 26.389 0 17 0Z" fill="${
              isSelected ? "var(--foreground)" : sectorColor
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

        const tagsHtml = grant.tags
          .slice(0, 3)
          .map((t) => `<span class="popup-tag">${escapeHtml(t)}</span>`)
          .join("");

        // Official favicon URL for both the foreground tile and the
        // diagonal watermark backdrop. Fall back gracefully if the funder
        // record predates the auto-fill step.
        const faviconUrl = funder?.faviconUrl ?? "";
        const funderName = funder?.name ?? "";

        // Foreground tile in the popup header — renders the official favicon
        // (parity with the inline FunderFavicon used in GrantCard).
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

        // Diagonal watermark backdrop — same dirstarter pattern as the
        // side-panel cards (giant favicon, top-right, rotate 12°, masked,
        // 10% opacity). Skipped if there is no faviconUrl.
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
                  <p class="popup-category" style="color:${sectorColor}">${escapeHtml(sector?.name ?? "Sector")}</p>
                </div>
              </div>

              <p class="popup-description">${escapeHtml(grant.description)}</p>

              ${tagsHtml ? `<div class="popup-tags">${tagsHtml}</div>` : ""}

              <div class="popup-stats">
                <div class="popup-stat">
                  <span class="popup-stat-label">Funding</span>
                  <span class="popup-stat-value">${fmtCurrency(grant.fundingMinEUR)} – ${fmtCurrency(grant.fundingMaxEUR)}</span>
                </div>
                <div class="popup-stat">
                  <span class="popup-stat-label">Deadline</span>
                  <span class="popup-stat-value popup-stat-deadline">${fmtDeadline(grant.deadline, grant.status)}</span>
                </div>
                <div class="popup-stat">
                  <span class="popup-stat-label">Match</span>
                  <span class="popup-stat-value popup-stat-match">${grant.matchScore}%</span>
                </div>
              </div>

              <div class="popup-footer">
                <span class="popup-scope">${escapeHtml(grant.geographicScopeLabel)}</span>
                <span class="popup-budget">Annual pool ${fmtCurrency(grant.totalAnnualBudgetEUR)}</span>
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

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([grant.coordinates.lng, grant.coordinates.lat])
        .addTo(mapRef.current!);

      markersRef.current.set(grant.id, marker);
    });
  }, [grants, selectedGrantId, selectGrant, closePopup]);

  // Fly to selected grant
  React.useEffect(() => {
    if (!mapRef.current || !selectedGrantId) return;
    const grant = grants.find((g) => g.id === selectedGrantId);
    if (!grant) return;
    isAnimatingRef.current = true;
    mapRef.current.flyTo({
      center: [grant.coordinates.lng, grant.coordinates.lat],
      zoom: Math.max(mapRef.current.getZoom(), 5.5),
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
