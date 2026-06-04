"use client";

import * as React from "react";
import { MapView } from "@/components/dashboard/map-view";
import { MapsPanel } from "@/components/dashboard/maps-panel";
import { MapControls } from "@/components/dashboard/map-controls";
import { useGrantsStore } from "@/store/maps-store";

export default function MapsPage() {
  const initialize = useGrantsStore((s) => s.initialize);
  const loadError = useGrantsStore((s) => s.loadError);

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView />
      <MapsPanel />
      <MapControls />
      {loadError && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-destructive bg-background px-3 py-2 text-xs text-destructive shadow-lg">
          Failed to load grant data: {loadError}
        </div>
      )}
    </div>
  );
}
