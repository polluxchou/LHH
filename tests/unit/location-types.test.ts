import { describe, expect, it } from "vitest";
import { locationAnchors } from "@/lib/data/phase1-fixtures";
import { allowedLocationAnchorTypes } from "@/lib/domain/status";
import {
  LOCATION_ANCHOR_TYPE_LABELS,
  getLocationAnchorsForTrackingObject,
  getVisibleLocationTypeOptions,
  groupLocationAnchorsByType,
} from "@/components/location-anchor-list";

describe("location anchor MVP controls", () => {
  it("exposes only the five approved MVP location type options", () => {
    const options = getVisibleLocationTypeOptions();

    expect(options.map((option) => option.value)).toEqual([...allowedLocationAnchorTypes]);
    expect(options.map((option) => option.label)).toEqual(
      allowedLocationAnchorTypes.map((type) => LOCATION_ANCHOR_TYPE_LABELS[type]),
    );
    expect(JSON.stringify(options).toLowerCase()).not.toContain("university");
    expect(JSON.stringify(options).toLowerCase()).not.toContain("research");
  });

  it("groups location anchors by the allowed MVP type order", () => {
    const groups = groupLocationAnchorsByType(locationAnchors);

    expect(groups.map((group) => group.type)).toEqual([...allowedLocationAnchorTypes]);
    expect(groups.find((group) => group.type === "launch_site")?.locations.map((location) => location.id)).toEqual([
      "loc-starbase",
      "loc-ksc",
      "loc-wallops",
      "loc-taiyuan",
      "loc-wenchang",
      "loc-andoya",
    ]);
    expect(groups.find((group) => group.type === "test_site")?.locations.map((location) => location.id)).toEqual([
      "loc-mcgregor",
      "loc-moseslake",
    ]);
  });

  it("filters anchors related to a tracking object", () => {
    expect(getLocationAnchorsForTrackingObject(locationAnchors, "stoke").map((location) => location.id)).toEqual([
      "loc-kent",
      "loc-moseslake",
    ]);
  });
});
