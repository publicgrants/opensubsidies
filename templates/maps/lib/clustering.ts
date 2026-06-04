// =============================================================================
// OpenSubsidies — Zoom-driven grant-provider aggregation
// =============================================================================
// Four rendering tiers selected by map zoom level:
//   • zoom < CONTINENT_TIER_MAX_ZOOM → one bubble per continent
//   • zoom < COUNTRY_TIER_MAX_ZOOM   → one bubble per country
//   • zoom ≤ CLUSTER_TIER_MAX_ZOOM   → proximity clusters of funders
//   • zoom > CLUSTER_TIER_MAX_ZOOM   → individual per-grant pins
//
// Tiers are built from the AGGREGATE (every funder, with server-resolved
// coordinates and a precomputed scheme count) — not from the grant list, which
// is now server-paginated. Continent/country/cluster tiers count providers
// (funders) or schemes (sum of per-funder counts) per the active metric.
// =============================================================================

import Supercluster from "supercluster";
import type { Funder } from "@/mock-data/locations";
import type { MetricMode } from "@/store/maps-store";
import { COUNTRY_CENTROIDS, type LatLng } from "@/mock-data/geo";

export const CONTINENT_TIER_MAX_ZOOM = 2.5;
export const COUNTRY_TIER_MAX_ZOOM = 4;
export const CLUSTER_TIER_MAX_ZOOM = 10.5;

export type RenderTier = "continent" | "country" | "cluster" | "pin";

export function tierForZoom(zoom: number): RenderTier {
  if (zoom < CONTINENT_TIER_MAX_ZOOM) return "continent";
  if (zoom < COUNTRY_TIER_MAX_ZOOM) return "country";
  if (zoom <= CLUSTER_TIER_MAX_ZOOM) return "cluster";
  return "pin";
}

// Each continent maps to a representative centroid for bubble placement.
export const CONTINENT_CENTROIDS: Record<string, LatLng> = {
  Europe: { lat: 54.526, lng: 15.2551 },
  Asia: { lat: 34.0479, lng: 100.6197 },
  Americas: { lat: 14.0, lng: -85.0 },
  Africa: { lat: 0.0, lng: 20.0 },
  Oceania: { lat: -22.7359, lng: 140.0188 },
  Supranational: { lat: 50.8503, lng: 4.3517 }, // Brussels
};

function normalizeContinent(region: string): string {
  if (region === "North America") return "Americas";
  return region;
}

// Bubble counts are `number | null`. null = "no data" (funding mode today).
export type CountryBubble = {
  code: string;
  countryName: string;
  count: number | null;
  lng: number;
  lat: number;
};

type MetricAcc = { providers: number; schemes: number; funding: number };

function metricValue(acc: MetricAcc, mode: MetricMode): number | null {
  switch (mode) {
    case "providers":
      return acc.providers;
    case "schemes":
      return acc.schemes;
    case "funding":
      return null; // no disbursement data yet
  }
}

export function buildCountryBubbles(
  funders: Funder[],
  mode: MetricMode,
): CountryBubble[] {
  const byCountry = new Map<string, MetricAcc & { name: string }>();
  for (const f of funders) {
    const code = f.country || "INTL";
    const entry = byCountry.get(code);
    if (entry) {
      entry.providers += 1;
      entry.schemes += f.schemes;
    } else {
      byCountry.set(code, {
        providers: 1,
        schemes: f.schemes,
        funding: 0,
        name: f.countryName || code,
      });
    }
  }

  const bubbles: CountryBubble[] = [];
  byCountry.forEach((value, code) => {
    const centroid: LatLng | undefined =
      COUNTRY_CENTROIDS[code] ?? COUNTRY_CENTROIDS.INTL;
    if (!centroid) return;
    bubbles.push({
      code,
      countryName: value.name,
      count: metricValue(value, mode),
      lng: centroid.lng,
      lat: centroid.lat,
    });
  });
  return bubbles;
}

export type ContinentBubble = {
  name: string;
  count: number | null;
  lng: number;
  lat: number;
};

export function buildContinentBubbles(
  funders: Funder[],
  mode: MetricMode,
): ContinentBubble[] {
  const byContinent = new Map<string, MetricAcc>();
  for (const f of funders) {
    const name = normalizeContinent(f.region || "Other");
    const entry = byContinent.get(name);
    if (entry) {
      entry.providers += 1;
      entry.schemes += f.schemes;
    } else {
      byContinent.set(name, { providers: 1, schemes: f.schemes, funding: 0 });
    }
  }

  const bubbles: ContinentBubble[] = [];
  byContinent.forEach((acc, name) => {
    const c = CONTINENT_CENTROIDS[name];
    if (!c) return;
    bubbles.push({ name, count: metricValue(acc, mode), lng: c.lng, lat: c.lat });
  });
  return bubbles;
}

// Each funder point carries its own scheme contribution; Supercluster sums them
// via reduce so a cluster feature exposes the total directly.
export type FunderPointProps = {
  funderId: string;
  schemes: number;
  funding: number;
};

export type FunderClusterProps = {
  schemes: number;
  funding: number;
};

export type FunderClusterIndex = Supercluster<
  FunderPointProps,
  FunderClusterProps
>;
export type FunderClusterFeature = ReturnType<
  FunderClusterIndex["getClusters"]
>[number];

export function isClusterFeature(
  feature: FunderClusterFeature,
): feature is Extract<
  FunderClusterFeature,
  { properties: { cluster: true } }
> {
  return Boolean(
    (feature.properties as { cluster?: boolean } | undefined)?.cluster,
  );
}

export function featureMetricValue(
  feature: FunderClusterFeature,
  mode: MetricMode,
): number | null {
  const props = feature.properties as {
    cluster?: boolean;
    point_count?: number;
    schemes?: number;
    funding?: number;
  };
  switch (mode) {
    case "providers":
      return props.cluster ? (props.point_count ?? 0) : 1;
    case "schemes":
      return props.schemes ?? 0;
    case "funding":
      return null; // no disbursement data yet
  }
}

export function buildFunderClusterIndex(funders: Funder[]): FunderClusterIndex {
  const index = new Supercluster<FunderPointProps, FunderClusterProps>({
    radius: 60,
    maxZoom: Math.floor(CLUSTER_TIER_MAX_ZOOM),
    minZoom: Math.floor(COUNTRY_TIER_MAX_ZOOM),
    map: (props) => ({ schemes: props.schemes, funding: props.funding }),
    reduce: (acc, props) => {
      acc.schemes += props.schemes;
      acc.funding += props.funding;
    },
  });

  const points = funders.map((f) => ({
    type: "Feature" as const,
    properties: { funderId: f.id, schemes: f.schemes, funding: 0 },
    geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
  }));

  index.load(points);
  return index;
}

export function getVisibleClusters(
  index: FunderClusterIndex,
  bbox: [number, number, number, number],
  zoom: number,
): FunderClusterFeature[] {
  return index.getClusters(bbox, Math.floor(zoom));
}
