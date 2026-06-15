import { describe, expect, it } from "vitest";
import type { LocationAnchor } from "@/lib/domain/types";
import { getMapBounds, getMapViewport } from "@/lib/workflow/map-viewport";

const baseLocation: LocationAnchor = {
  id: "loc-test",
  name: "Test Location",
  type: "launch_site",
  latitude: 10,
  longitude: 20,
  countryOrRegion: "Test Region",
  description: null,
  relatedTrackingObjectIds: [],
  sourceIds: [],
  confidence: 1,
};

describe("MapLibre viewport helper", () => {
  it("centers on a single valid location", () => {
    expect(getMapViewport([baseLocation])).toEqual({
      longitude: 20,
      latitude: 10,
      zoom: 4.8,
    });
  });

  it("centers between multiple valid locations and zooms out", () => {
    const viewport = getMapViewport([
      { ...baseLocation, id: "loc-a", latitude: 25.997, longitude: -97.156 },
      { ...baseLocation, id: "loc-b", latitude: 47.382, longitude: -122.234 },
    ]);

    expect(viewport.longitude).toBeCloseTo(-109.695, 3);
    expect(viewport.latitude).toBeCloseTo(36.69, 2);
    expect(viewport.zoom).toBe(3.2);
  });

  it("uses a global fallback when no valid coordinates exist", () => {
    expect(getMapViewport([{ ...baseLocation, latitude: null, longitude: null }])).toEqual({
      longitude: 0,
      latitude: 20,
      zoom: 1.2,
    });
  });

  it("returns southwest and northeast bounds for valid locations only", () => {
    expect(
      getMapBounds([
        { ...baseLocation, id: "loc-a", latitude: 25.997, longitude: -97.156 },
        { ...baseLocation, id: "loc-b", latitude: 47.382, longitude: -122.234 },
        { ...baseLocation, id: "loc-null", latitude: null, longitude: null },
      ]),
    ).toEqual([
      [-122.234, 25.997],
      [-97.156, 47.382],
    ]);
  });
});
