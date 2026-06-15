"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import MapLibreMap, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import type { CandidateSignal, EditorialBrief, LocationAnchor } from "@/lib/domain/types";
import type { Locale } from "@/lib/i18n/copy";
import { getMapBounds, getMapViewport } from "@/lib/workflow/map-viewport";
import { BriefPreviewDialog } from "@/components/workbench/brief-preview-dialog";
import { useWorkflow } from "@/components/workbench/workflow-provider";

// 演示数据的「今天」（与 fixtures 保持一致）
const SIM_TODAY = new Date("2026-06-10");

interface MapEvent {
  signal: CandidateSignal;
  brief: EditorialBrief | null;
  location: LocationAnchor;
  trackingObjectId: string;
}

interface LocationGroup {
  location: LocationAnchor;
  events: MapEvent[];
  trackingObjectIds: Set<string>;
}

const PALETTE = [
  "#8b5e3c", "#1890ff", "#722ed1", "#fa8c16", "#52c41a", "#ff4d4f",
  "#2d2d5e", "#c49a6c", "#faad14", "#13c2c2", "#eb2f96", "#52525b",
];

const DATE_OPTIONS = [
  { value: "1", label: "今天" },
  { value: "3", label: "最近 3 天" },
  { value: "7", label: "最近 7 天" },
  { value: "all", label: "全部" },
];

function formatCoordMono(location: LocationAnchor): string {
  if (location.coordLabel) {
    return location.coordLabel;
  }

  if (location.latitude === null || location.longitude === null) {
    return location.countryOrRegion;
  }

  const lat = `${Math.abs(location.latitude).toFixed(3)}°${location.latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(location.longitude).toFixed(3)}°${location.longitude >= 0 ? "E" : "W"}`;

  return `${lat}, ${lng}`;
}

export function MapModeView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const home = locale === "zh" ? "/zh" : "/";
  const [dateFilter, setDateFilter] = useState("7");
  const [activeTrackedIds, setActiveTrackedIds] = useState<Set<string> | null>(null);
  const [hoveredLoc, setHoveredLoc] = useState<string | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [previewBriefId, setPreviewBriefId] = useState<string | null>(null);

  const days = dateFilter === "all" ? 9999 : Number.parseInt(dateFilter, 10);

  const scopeTrackedIds = useMemo(
    () =>
      store.scope === "mine"
        ? new Set(store.currentMember.trackingObjectIds)
        : new Set(state.trackingObjects.map((object) => object.id)),
    [store.scope, store.currentMember, state.trackingObjects],
  );

  const visibleTrackedIds = useMemo(() => {
    if (activeTrackedIds === null) {
      return scopeTrackedIds;
    }

    return new Set([...scopeTrackedIds].filter((id) => activeTrackedIds.has(id)));
  }, [scopeTrackedIds, activeTrackedIds]);

  const trackColors = useMemo(() => {
    const colors: Record<string, string> = {};

    [...scopeTrackedIds].forEach((id, index) => {
      colors[id] = PALETTE[index % PALETTE.length];
    });

    return colors;
  }, [scopeTrackedIds]);

  const events = useMemo<MapEvent[]>(() => {
    const out: MapEvent[] = [];
    const anchorsById = new Map(state.locationAnchors.map((anchor) => [anchor.id, anchor]));

    for (const signal of state.candidateSignals) {
      if (!visibleTrackedIds.has(signal.trackingObjectId) || !signal.eventDate) {
        continue;
      }

      const diff = (SIM_TODAY.getTime() - new Date(signal.eventDate).getTime()) / 86_400_000;

      if (diff < 0 || (dateFilter === "1" ? diff >= 1 : diff > days)) {
        continue;
      }

      const brief = state.editorialBriefs.find((item) => item.candidateSignalId === signal.id) ?? null;
      let anchorIds = brief?.locationAnchorIds ?? [];

      if (anchorIds.length === 0) {
        anchorIds = state.locationAnchors
          .filter((anchor) => anchor.relatedTrackingObjectIds.includes(signal.trackingObjectId))
          .map((anchor) => anchor.id);
      }

      for (const anchorId of anchorIds) {
        const location = anchorsById.get(anchorId);

        if (location) {
          out.push({ signal, brief, location, trackingObjectId: signal.trackingObjectId });
        }
      }
    }

    return out;
  }, [state, visibleTrackedIds, days, dateFilter]);

  const locationGroups = useMemo<LocationGroup[]>(() => {
    const groups = new Map<string, LocationGroup>();

    for (const event of events) {
      let group = groups.get(event.location.id);

      if (!group) {
        group = { location: event.location, events: [], trackingObjectIds: new Set() };
        groups.set(event.location.id, group);
      }

      group.events.push(event);
      group.trackingObjectIds.add(event.trackingObjectId);
    }

    return [...groups.values()];
  }, [events]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, MapEvent[]>();

    for (const event of events) {
      const date = event.signal.eventDate ?? "";
      const list = groups.get(date) ?? [];

      list.push(event);
      groups.set(date, list);
    }

    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  const isAllOn = activeTrackedIds === null || activeTrackedIds.size === scopeTrackedIds.size;

  const toggleTracked = (id: string) => {
    setActiveTrackedIds((previous) => {
      const current = previous ?? new Set(scopeTrackedIds);
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next.size === scopeTrackedIds.size ? null : next;
    });
  };

  const jumpToBrief = (brief: EditorialBrief) => {
    store.focusBrief(brief.id, "sources");
    store.logDemo("info", `从地图模式跳转 · ${brief.briefTitle}`, brief.id);
    setPreviewBriefId(brief.id);
  };

  const objectName = (id: string) => {
    const object = state.trackingObjects.find((entry) => entry.id === id);

    return object ? (object.nameZh ?? object.name) : id;
  };

  const selectedGroup = locationGroups.find((group) => group.location.id === selectedLoc) ?? null;
  const hoveredGroup = locationGroups.find((group) => group.location.id === hoveredLoc) ?? null;
  const previewBrief = state.editorialBriefs.find((brief) => brief.id === previewBriefId) ?? null;

  return (
    <div className="mm">
      <header className="mm-head">
        <div className="mm-head-left">
          <div className="mm-kicker">地图模式 · MAP MODE</div>
          <h2 className="mm-title">事件发生地 · 按天追踪</h2>
        </div>
        <div className="mm-head-right">
          <div className="mm-stats">
            <span>
              <b>{events.length}</b> 个事件 · <b>{locationGroups.length}</b> 个地点 · <b>{visibleTrackedIds.size}</b> 个对象
            </span>
          </div>
          <button type="button" className="mm-close" onClick={() => router.push(home)}>
            返回工作台
          </button>
        </div>
      </header>

      <div className="mm-controls">
        <div className="mm-control-group">
          <span className="mm-clabel">时间</span>
          <div className="mm-date-pills">
            {DATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`mm-pill ${dateFilter === option.value ? "active" : ""}`}
                onClick={() => setDateFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mm-control-group flex-1">
          <span className="mm-clabel">追踪对象（{store.scope === "mine" ? "我关注的" : "团队全部"}）</span>
          <div className="mm-tracked-chips">
            <button
              type="button"
              className={`mm-chip-all ${isAllOn ? "active" : ""}`}
              onClick={() => setActiveTrackedIds(null)}
            >
              全部 <span className="n">{scopeTrackedIds.size}</span>
            </button>
            {[...scopeTrackedIds].map((id) => {
              const isOn = isAllOn || (activeTrackedIds?.has(id) ?? false);

              return (
                <button
                  key={id}
                  type="button"
                  className={`mm-chip ${isOn ? "on" : "off"}`}
                  style={{ "--cc": trackColors[id] } as CSSProperties}
                  onClick={() => toggleTracked(id)}
                >
                  <span className="dot" />
                  {objectName(id)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mm-stage">
        <div className="mm-canvas-wrap">
          <MapModeLibreCanvas
            groups={locationGroups}
            hoveredGroup={hoveredGroup}
            selectedLoc={selectedLoc}
            trackColors={trackColors}
            objectName={objectName}
            onHover={setHoveredLoc}
            onSelect={(locationId) => setSelectedLoc((current) => (current === locationId ? null : locationId))}
          />
          <div className="mm-canvas-foot">
            <span>MAPLIBRE · OSM DEMO TILES · 可缩放拖拽</span>
            <span className="mm-legend">
              <span className="lg-dot small" /> 单事件
              <span className="lg-dot mid" /> 多事件
              <span className="lg-dot lrg" /> 集群
            </span>
          </div>
        </div>

        <aside className="mm-sidebar">
          {selectedGroup ? (
            <div className="mm-side">
              <div className="mm-side-head">
                <button type="button" className="mm-back" onClick={() => setSelectedLoc(null)}>
                  ← 返回时间线
                </button>
                <div className="mm-side-loc">
                  <div className="mm-side-loc-name">{selectedGroup.location.nameZh ?? selectedGroup.location.name}</div>
                  <div className="mm-side-loc-meta">
                    {selectedGroup.location.name} · {formatCoordMono(selectedGroup.location)}
                  </div>
                  {selectedGroup.location.description ? (
                    <div className="mm-side-loc-note">{selectedGroup.location.description}</div>
                  ) : null}
                </div>
              </div>
              <div className="mm-side-list">
                <div className="mm-side-listhead">{selectedGroup.events.length} 个事件 · 按日期倒序</div>
                {[...selectedGroup.events]
                  .sort((a, b) => (b.signal.eventDate ?? "").localeCompare(a.signal.eventDate ?? ""))
                  .map((event, index) => (
                    <div key={`${event.signal.id}-${index}`} className="mm-evt">
                      <div className="mm-evt-head">
                        <span className="mm-evt-trk" style={{ "--cc": trackColors[event.trackingObjectId] } as CSSProperties}>
                          <span className="dot" />
                          {objectName(event.trackingObjectId)}
                        </span>
                        <span className="mm-evt-date">{event.signal.eventDate}</span>
                      </div>
                      <div className="mm-evt-title">{event.signal.headline}</div>
                      {event.brief ? (
                        <button type="button" className="mm-evt-jump" onClick={() => jumpToBrief(event.brief!)}>
                          ↗ 跳转到简报
                        </button>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : dateGroups.length === 0 ? (
            <div className="mm-side mm-empty">
              <div className="mm-empty-glyph">🛰</div>
              <div className="mm-empty-title">所选时间段内无事件</div>
              <div className="mm-empty-sub">尝试拉长时间范围，或勾选更多追踪对象。</div>
            </div>
          ) : (
            <div className="mm-side">
              <div className="mm-side-headlite">事件时间线 · 点击地图上的圆点查看详情</div>
              <div className="mm-side-list">
                {dateGroups.map(([date, dayEvents]) => (
                  <div key={date} className="mm-day">
                    <div className="mm-day-head">
                      <span className="mm-day-d">{date.slice(5)}</span>
                      <span className="mm-day-n">{dayEvents.length} 事件</span>
                    </div>
                    {dayEvents.map((event, index) => (
                      <div key={`${event.signal.id}-${index}`} className="mm-evt">
                        <div className="mm-evt-head">
                          <span className="mm-evt-trk" style={{ "--cc": trackColors[event.trackingObjectId] } as CSSProperties}>
                            <span className="dot" />
                            {objectName(event.trackingObjectId)}
                          </span>
                          <button type="button" className="mm-evt-loc" onClick={() => setSelectedLoc(event.location.id)}>
                            📍 {event.location.nameZh ?? event.location.name}
                          </button>
                        </div>
                        <div className="mm-evt-title">{event.signal.headline}</div>
                        {event.brief ? (
                          <button type="button" className="mm-evt-jump" onClick={() => jumpToBrief(event.brief!)}>
                            ↗ 跳转到简报
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      {previewBrief ? (
        <BriefPreviewDialog
          brief={previewBrief}
          onClose={() => setPreviewBriefId(null)}
          footer={
            <>
              <button type="button" className="mbp-btn" onClick={() => setPreviewBriefId(null)}>
                关闭
              </button>
              <button type="button" className="mbp-btn primary" onClick={() => router.push(home)}>
                在工作台查看
              </button>
            </>
          }
        />
      ) : null}
    </div>
  );
}

function MapModeLibreCanvas({
  groups,
  hoveredGroup,
  selectedLoc,
  trackColors,
  objectName,
  onHover,
  onSelect,
}: {
  groups: LocationGroup[];
  hoveredGroup: LocationGroup | null;
  selectedLoc: string | null;
  trackColors: Record<string, string>;
  objectName: (id: string) => string;
  onHover: (locationId: string | null) => void;
  onSelect: (locationId: string) => void;
}) {
  const drawableGroups = groups.filter(
    (group): group is LocationGroup & { location: LocationAnchor & { latitude: number; longitude: number } } =>
      group.location.latitude !== null && group.location.longitude !== null,
  );
  const locations = drawableGroups.map((group) => group.location);
  const viewport = getMapViewport(locations);
  const bounds = drawableGroups.length > 1 ? getMapBounds(locations) : null;
  const initialViewState = bounds
    ? {
        ...viewport,
        bounds,
        fitBoundsOptions: { padding: 90, maxZoom: 5.4 },
      }
    : viewport;

  return (
    <div className="mm-maplibre">
      <MapLibreMap
        key={drawableGroups.map((group) => group.location.id).join("|") || "empty"}
        initialViewState={initialViewState}
        mapStyle="https://demotiles.maplibre.org/style.json"
        style={{ width: "100%", height: "100%" }}
        cooperativeGestures
      >
        <NavigationControl position="top-right" showCompass={false} />
        {drawableGroups.map((group) => {
          const primaryColor = trackColors[[...group.trackingObjectIds][0]];
          const size = Math.min(40, 18 + group.events.length * 3);

          return (
            <Marker
              key={group.location.id}
              longitude={group.location.longitude}
              latitude={group.location.latitude}
              anchor="center"
            >
              <button
                type="button"
                className={`mm-map-marker ${selectedLoc === group.location.id ? "sel" : ""} ${
                  hoveredGroup?.location.id === group.location.id ? "hov" : ""
                }`}
                style={{ "--cc": primaryColor, width: size, height: size } as CSSProperties}
                onPointerEnter={() => onHover(group.location.id)}
                onPointerLeave={() => onHover(null)}
                onClick={() => onSelect(group.location.id)}
                title={group.location.nameZh ?? group.location.name}
              >
                <span>{group.events.length}</span>
              </button>
            </Marker>
          );
        })}
        {hoveredGroup && hoveredGroup.location.latitude !== null && hoveredGroup.location.longitude !== null ? (
          <Popup
            longitude={hoveredGroup.location.longitude}
            latitude={hoveredGroup.location.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="top"
            offset={18}
            className="mm-map-popup"
          >
            <div className="mm-tt-name">{hoveredGroup.location.nameZh ?? hoveredGroup.location.name}</div>
            <div className="mm-tt-meta">
              {formatCoordMono(hoveredGroup.location)} · {hoveredGroup.events.length} 个事件
            </div>
            <div className="mm-tt-tracked">
              {[...hoveredGroup.trackingObjectIds].map((id) => (
                <span key={id} className="mm-tt-chip" style={{ "--cc": trackColors[id] } as CSSProperties}>
                  <span className="dot" />
                  {objectName(id)}
                </span>
              ))}
            </div>
          </Popup>
        ) : null}
      </MapLibreMap>
    </div>
  );
}
