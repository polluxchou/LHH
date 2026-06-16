"use client";

import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import type { LocationAnchor } from "@/lib/domain/types";
import { LOCATION_KIND_GLYPH } from "@/components/workbench/helpers";
import { getMapViewport } from "@/lib/workflow/map-viewport";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

export function MapLibreCanvas({ locations }: { locations: LocationAnchor[] }) {
  const viewport = getMapViewport(locations);
  const mappedLocations = locations.filter(
    (location): location is LocationAnchor & { latitude: number; longitude: number } =>
      location.latitude !== null && location.longitude !== null,
  );

  return (
    <div className="maplibre-shell">
      <Map
        initialViewState={viewport}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        cooperativeGestures
      >
        <NavigationControl position="top-right" showCompass={false} />
        {mappedLocations.map((location) => {
          const glyph = LOCATION_KIND_GLYPH[location.type];

          return (
            <Marker
              key={location.id}
              longitude={location.longitude}
              latitude={location.latitude}
              anchor="bottom"
            >
              <button
                type="button"
                className={`maplibre-marker ${location.type}`}
                title={location.nameZh ?? location.name}
                aria-label={location.nameZh ?? location.name}
              >
                {glyph}
              </button>
            </Marker>
          );
        })}
      </Map>
      <div className="maplibre-legend">MAPLIBRE · OSM DEMO TILES</div>
    </div>
  );
}
