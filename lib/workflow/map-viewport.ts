import type { LocationAnchor } from "@/lib/domain/types";

export interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
}

export type MapBounds = [[number, number], [number, number]];

const FALLBACK_VIEWPORT: MapViewport = {
  longitude: 0,
  latitude: 20,
  zoom: 1.2,
};

export function getMapViewport(locations: LocationAnchor[]): MapViewport {
  const points = locations.filter(
    (location): location is LocationAnchor & { latitude: number; longitude: number } =>
      location.latitude !== null && location.longitude !== null,
  );

  if (points.length === 0) {
    return FALLBACK_VIEWPORT;
  }

  if (points.length === 1) {
    return {
      longitude: points[0].longitude,
      latitude: points[0].latitude,
      zoom: 4.8,
    };
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const span = Math.max(maxLatitude - minLatitude, maxLongitude - minLongitude);

  return {
    longitude: (minLongitude + maxLongitude) / 2,
    latitude: (minLatitude + maxLatitude) / 2,
    zoom: zoomForSpan(span),
  };
}

function zoomForSpan(span: number): number {
  if (span <= 2) return 6;
  if (span <= 8) return 5;
  if (span <= 35) return 3.2;
  if (span <= 80) return 2.2;
  return 1.2;
}

export function getMapBounds(locations: LocationAnchor[]): MapBounds | null {
  const points = locations.filter(
    (location): location is LocationAnchor & { latitude: number; longitude: number } =>
      location.latitude !== null && location.longitude !== null,
  );

  if (points.length === 0) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}
