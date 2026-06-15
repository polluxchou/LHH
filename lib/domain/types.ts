export type TrackingObjectType = "company" | "facility" | "program" | "project";

export type TrackingObjectPriority = 1 | 2 | 3;

export type LocationAnchorType =
  | "launch_site"
  | "company_office"
  | "manufacturing_supply_chain"
  | "test_site"
  | "investor_policy_industrial_park"
  | "extraterrestrial";

export type CandidateSignalType =
  | "technical_project_milestone"
  | "location_facility_change"
  | "policy_regulatory_change";

export type NoveltyStatus = "new" | "updated" | "duplicate" | "unclear";

export type BriefStatus = "draft" | "ready_for_screening" | "screened";

export type ScreeningDecisionValue = "approved" | "watch" | "rejected";

export type TopicCardStatus = "new" | "assigned" | "in_research" | "in_writing" | "paused" | "done";

export type LaunchStatus = "confirmed" | "window" | "tentative" | "standby";

export interface LaunchOrg {
  name: string;
  short: string;
  color: string;
  country: string;
  flag: string;
}

export interface Launch {
  id: string;
  /** UTC date YYYY-MM-DD */
  date: string;
  /** UTC time HH:mm */
  timeUTC: string;
  /** key into the launch-org registry */
  orgId: string;
  vehicle: string;
  mission: string;
  pad: string;
  site: string;
  siteCountry: string;
  status: LaunchStatus;
  orbit: string;
  payload: string;
  /** window length display, e.g. "4h" / "instant" */
  window: string;
  /** where to watch the stream */
  watch: string;
  /** related tracking object (enables jump back to the workbench) */
  trackingObjectId?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarChar: string;
  color: string;
  /** ids of tracking objects this member subscribes to */
  trackingObjectIds: string[];
}

export interface TrackingObject {
  id: string;
  name: string;
  /** Chinese display name; falls back to `name` when absent */
  nameZh?: string;
  type: TrackingObjectType;
  aliases: string[];
  countryOrRegion: string;
  officialUrl: string | null;
  primaryTrack: string;
  whyTrack: string;
  keywords: string[];
  excludedTerms: string[];
  languages: string[];
  regions: string[];
  preferredSources: string[];
  searchFrequency: "daily";
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationAnchor {
  id: string;
  name: string;
  /** Chinese display label, e.g. "Boca Chica · 德州沿海" */
  nameZh?: string;
  type: LocationAnchorType;
  latitude: number | null;
  longitude: number | null;
  /** display override for coordinates that cannot be formatted from lat/lng */
  coordLabel?: string;
  countryOrRegion: string;
  description: string | null;
  relatedTrackingObjectIds: string[];
  sourceIds: string[];
  confidence: number;
}

export interface SearchRun {
  id: string;
  trackingObjectId: string;
  runDate: string;
  querySet: string[];
  status: "pending" | "running" | "completed" | "failed";
  resultCount: number;
  newSignalCount: number;
  errorSummary: string | null;
  /** ISO timestamp of when the run finished (display only) */
  completedAt?: string;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  sourceType:
    | "official"
    | "regulator"
    | "authoritative_media"
    | "trade_media"
    | "social_public_post"
    | "database"
    | "other";
  confidence: number;
  notes: string | null;
}

export interface CandidateSignal {
  id: string;
  trackingObjectId: string;
  searchRunId: string;
  signalType: CandidateSignalType;
  headline: string;
  summary: string;
  eventDate: string | null;
  detectedAt: string;
  sourceIds: string[];
  dedupeKey: string;
  noveltyStatus: NoveltyStatus;
  confidence: number;
}

export interface EditorialBrief {
  id: string;
  candidateSignalId: string;
  trackingObjectId: string;
  briefTitle: string;
  /** one-line serif deck under the headline */
  tagline?: string;
  factSummary: string;
  /** bullet-point fact list; falls back to [factSummary] when absent */
  factBullets?: string[];
  sourceSummary: string;
  mapContext: string | null;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
  riskNotes: string[];
  locationAnchorIds: string[];
  status: BriefStatus;
  createdAt: string;
}

export interface ContentValueScore {
  editorialBriefId: string;
  /** 0-100 headline score shown on brief cards */
  compositeScore: number;
  freshnessScore: number;
  importanceScore: number;
  rarityScore: number;
  audienceInterestScore: number;
  visualPotentialScore: number;
  riskScore: number;
  overallRecommendation: "strong" | "medium" | "weak";
  scoringNotes: string;
}

export interface ScreeningDecision {
  editorialBriefId: string;
  decision: ScreeningDecisionValue;
  reason: string;
  /** 持续观察时记录的多条观察维度（自由文本） */
  observationDimensions?: string[];
  decidedBy: string;
  decidedAt: string;
}

export interface TopicCard {
  id: string;
  sourceEditorialBriefId: string;
  workingTitle: string;
  coreQuestion: string;
  recommendedFormat:
    | "news_brief"
    | "technical_explainer"
    | "company_tracking"
    | "policy_explainer"
    | "industry_map"
    | "other";
  /** free-text display label for the recommended format, e.g. "深度长视频（12-15min）" */
  formatLabel?: string;
  keyFacts: string[];
  sourceIds: string[];
  mapContext: string | null;
  status: TopicCardStatus;
  /** team member responsible for production; null = unclaimed */
  ownerId?: string | null;
  /** 观察维度（自由文本），普通通过时为空 */
  observationDimensions?: string[];
}
