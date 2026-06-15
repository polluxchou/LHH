import { describe, expect, it } from "vitest";
import { classifyCandidateSignalType } from "@/lib/domain/signal-classification";

describe("candidate signal classification", () => {
  it("classifies technical project milestones", () => {
    expect(classifyCandidateSignalType("Reusable launcher completes hot-fire engine test")).toBe(
      "technical_project_milestone",
    );
    expect(classifyCandidateSignalType("Capsule reaches orbit after first flight")).toBe(
      "technical_project_milestone",
    );
    expect(classifyCandidateSignalType("Booster recovery confirmed after launch")).toBe(
      "technical_project_milestone",
    );
  });

  it("classifies location and facility changes", () => {
    expect(classifyCandidateSignalType("Factory expansion permit filed near test site")).toBe(
      "location_facility_change",
    );
    expect(classifyCandidateSignalType("New spaceport facility opens for launch operations")).toBe(
      "location_facility_change",
    );
  });

  it("classifies policy and regulatory changes", () => {
    expect(classifyCandidateSignalType("FAA issues launch license after regulator review")).toBe(
      "policy_regulatory_change",
    );
    expect(classifyCandidateSignalType("Government procurement and export control update published")).toBe(
      "policy_regulatory_change",
    );
  });

  it("ignores funding-only and personnel-only items", () => {
    expect(classifyCandidateSignalType("Company raises Series B funding round")).toBeNull();
    expect(classifyCandidateSignalType("Startup hires new chief financial officer and expands team")).toBeNull();
  });
});
