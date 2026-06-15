import { describe, expect, it } from "vitest";
import {
  candidateSignals,
  editorialBriefs,
  locationAnchors,
  sources,
  topicCards,
  trackingObjects,
} from "@/lib/data/phase1-fixtures";

describe("Phase 1 fixtures", () => {
  it("provide enough local data to demonstrate the MVP loop", () => {
    expect(trackingObjects.length).toBeGreaterThanOrEqual(2);
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(candidateSignals.length).toBeGreaterThanOrEqual(3);
    expect(locationAnchors.length).toBeGreaterThanOrEqual(2);
    expect(editorialBriefs.length).toBeGreaterThanOrEqual(2);
    expect(topicCards.length).toBeGreaterThanOrEqual(1);
  });

  it("does not include excluded university or research institute location types", () => {
    expect(locationAnchors.map((location) => location.type)).not.toContain("university");
    expect(locationAnchors.map((location) => location.type)).not.toContain("research_institute");
  });
});
