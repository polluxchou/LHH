"use client";

import dynamic from "next/dynamic";
import type { LocationAnchor } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { LOCATION_KIND_GLYPH, formatCoord } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

const MapLibreCanvas = dynamic(
  () => import("@/components/workbench/maplibre-canvas").then((module) => module.MapLibreCanvas),
  {
    ssr: false,
    loading: () => <div className="maplibre-shell loading">…</div>,
  },
);

export function MapPanel({ locations, briefTitle }: { locations: LocationAnchor[]; briefTitle?: string }) {
  const t = useCopy();

  if (locations.length === 0) {
    return <EmptyMini glyph="📍" title={t.workbench.mapPanel.emptyTitle} sub={t.workbench.mapPanel.emptySub} />;
  }

  return (
    <div>
      {briefTitle ? <div className="rail-title">{t.workbench.relatedBrief(briefTitle)}</div> : null}
      <MapLibreCanvas locations={locations} />
      {locations.map((location) => (
        <div key={location.id} className="map-pin">
          <div className={`badge ${location.type}`}>{LOCATION_KIND_GLYPH[location.type]}</div>
          <div className="info">
            <div className="nm">
              {location.nameZh ?? location.name}
              <span className="en">{location.name}</span>
            </div>
            <div className="meta">{formatCoord(location)}</div>
            {location.description ? <div className="note">{location.description}</div> : null}
            <div style={{ marginTop: 6 }}>
              <span className="kind-tag">{t.labels.locationKind[location.type]}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
