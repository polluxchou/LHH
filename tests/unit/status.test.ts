import { describe, expect, it } from "vitest";
import {
  allowedCandidateSignalTypes,
  allowedLocationAnchorTypes,
  allowedScreeningDecisions,
  isAllowedLocationAnchorType,
} from "@/lib/domain/status";

describe("MVP status constraints", () => {
  it("allows only the five approved location anchor types", () => {
    expect(allowedLocationAnchorTypes).toEqual([
      "launch_site",
      "company_office",
      "manufacturing_supply_chain",
      "test_site",
      "investor_policy_industrial_park",
    ]);
  });

  it("excludes university and research institute location types from MVP controls", () => {
    expect(allowedLocationAnchorTypes).not.toContain("university");
    expect(allowedLocationAnchorTypes).not.toContain("research_institute");
    expect(isAllowedLocationAnchorType("research_institute")).toBe(false);
  });

  it("allows only the three priority candidate signal types", () => {
    expect(allowedCandidateSignalTypes).toEqual([
      "technical_project_milestone",
      "location_facility_change",
      "policy_regulatory_change",
    ]);
  });

  it("allows only approved, watch, and rejected screening decisions", () => {
    expect(allowedScreeningDecisions).toEqual(["approved", "watch", "rejected"]);
  });
});
