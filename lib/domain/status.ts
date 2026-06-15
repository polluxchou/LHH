import type { CandidateSignalType, LocationAnchorType, ScreeningDecisionValue } from "./types";

export const allowedLocationAnchorTypes = [
  "launch_site",
  "company_office",
  "manufacturing_supply_chain",
  "test_site",
  "investor_policy_industrial_park",
] as const satisfies readonly LocationAnchorType[];

export const allowedCandidateSignalTypes = [
  "technical_project_milestone",
  "location_facility_change",
  "policy_regulatory_change",
] as const satisfies readonly CandidateSignalType[];

export const allowedScreeningDecisions = [
  "approved",
  "watch",
  "rejected",
] as const satisfies readonly ScreeningDecisionValue[];

export type AllowedLocationAnchorType = (typeof allowedLocationAnchorTypes)[number];

export function isAllowedLocationAnchorType(value: string): value is AllowedLocationAnchorType {
  return (allowedLocationAnchorTypes as readonly string[]).includes(value);
}
