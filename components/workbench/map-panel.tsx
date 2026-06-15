"use client";

import dynamic from "next/dynamic";
import type { LocationAnchor } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { LOCATION_KIND_META, formatCoord } from "@/components/workbench/helpers";

const MapLibreCanvas = dynamic(
  () => import("@/components/workbench/maplibre-canvas").then((module) => module.MapLibreCanvas),
  {
    ssr: false,
    loading: () => <div className="maplibre-shell loading">地图加载中...</div>,
  },
);

export function MapPanel({ locations, briefTitle }: { locations: LocationAnchor[]; briefTitle?: string }) {
  if (locations.length === 0) {
    return (
      <EmptyMini
        glyph="📍"
        title="未选择简报"
        sub="点击中间的简报，这里会显示它涉及的地点：发射场、总部、试验场、政策节点等。"
      />
    );
  }

  return (
    <div>
      {briefTitle ? <div className="rail-title">关联简报：{briefTitle}</div> : null}
      <MapLibreCanvas locations={locations} />
      {locations.map((location) => {
        const kind = LOCATION_KIND_META[location.type];

        return (
          <div key={location.id} className="map-pin">
            <div className={`badge ${location.type}`}>{kind.glyph}</div>
            <div className="info">
              <div className="nm">
                {location.nameZh ?? location.name}
                <span className="en">{location.name}</span>
              </div>
              <div className="meta">{formatCoord(location)}</div>
              {location.description ? <div className="note">{location.description}</div> : null}
              <div style={{ marginTop: 6 }}>
                <span className="kind-tag">{kind.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
