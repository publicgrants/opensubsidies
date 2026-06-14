"use client";

import * as React from "react";
import { MapView } from "@/components/dashboard/map-view";
import { GlobeSearch } from "@/components/dashboard/globe-search";
import { ResultsDrawer } from "@/components/dashboard/results-drawer";
import { MapControls } from "@/components/dashboard/map-controls";
import { useGrantsStore } from "@/store/maps-store";

export default function FavoritesPage() {
  const setResultsOpen = useGrantsStore((s) => s.setResultsOpen);
  // The watchlist exists to show the list, so open the drawer on arrival.
  React.useEffect(() => {
    setResultsOpen(true);
  }, [setResultsOpen]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />
      <GlobeSearch showModes={false} />
      <ResultsDrawer mode="favorites" />
      <MapControls />
    </div>
  );
}
