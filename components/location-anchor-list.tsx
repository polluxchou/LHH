import type { LocationAnchor, LocationAnchorType } from "@/lib/domain/types";
import { allowedLocationAnchorTypes } from "@/lib/domain/status";

export const LOCATION_ANCHOR_TYPE_LABELS = {
  launch_site: "Launch site / spaceport",
  company_office: "Company headquarters / office",
  manufacturing_supply_chain: "Manufacturing / assembly / supply-chain facility",
  test_site: "Test site / test stand / test base",
  investor_policy_industrial_park: "Investor / policy / industrial park node",
  extraterrestrial: "Extraterrestrial site",
} as const satisfies Record<LocationAnchorType, string>;

export interface LocationTypeOption {
  value: LocationAnchorType;
  label: string;
}

export interface LocationAnchorGroup {
  type: LocationAnchorType;
  label: string;
  locations: LocationAnchor[];
}

export function getVisibleLocationTypeOptions(): LocationTypeOption[] {
  return allowedLocationAnchorTypes.map((type) => ({
    value: type,
    label: LOCATION_ANCHOR_TYPE_LABELS[type],
  }));
}

export function groupLocationAnchorsByType(locations: LocationAnchor[]): LocationAnchorGroup[] {
  return allowedLocationAnchorTypes.map((type) => ({
    type,
    label: LOCATION_ANCHOR_TYPE_LABELS[type],
    locations: locations.filter((location) => location.type === type),
  }));
}

export function getLocationAnchorsForTrackingObject(
  locations: LocationAnchor[],
  trackingObjectId: string,
): LocationAnchor[] {
  return locations.filter((location) => location.relatedTrackingObjectIds.includes(trackingObjectId));
}

interface LocationAnchorListProps {
  locations: LocationAnchor[];
  activeLocationId?: string;
  emptyMessage?: string;
}

export function LocationAnchorList({
  locations,
  activeLocationId,
  emptyMessage = "No location anchors are available for this view.",
}: LocationAnchorListProps) {
  if (locations.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--muted)",
          padding: 18,
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {groupLocationAnchorsByType(locations).map((group) => (
        <section
          key={group.type}
          aria-labelledby={`location-group-${group.type}`}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--surface)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 id={`location-group-${group.type}`} style={{ margin: 0, fontSize: 16 }}>
              {group.label}
            </h2>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>{group.locations.length} anchors</span>
          </div>
          {group.locations.length > 0 ? (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {group.locations.map((location) => {
                const isActive = location.id === activeLocationId;

                return (
                  <article
                    key={location.id}
                    aria-current={isActive ? "true" : undefined}
                    style={{
                      border: isActive ? "2px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: 8,
                      background: isActive ? "#f0fdfa" : "#fafafa",
                      padding: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 15 }}>{location.name}</h3>
                      {isActive ? (
                        <span style={{ color: "var(--accent)", fontSize: 12, fontWeight: 800 }}>Selected</span>
                      ) : null}
                    </div>
                    <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.45, margin: "8px 0 0" }}>
                      {location.countryOrRegion} · Confidence {Math.round(location.confidence * 100)}%
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "12px 0 0" }}>
              No anchors for this MVP type yet.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
