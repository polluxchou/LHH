import type { CandidateSignalType } from "@/lib/domain/types";

type SignalTextInput =
  | string
  | {
      title?: string | null;
      headline?: string | null;
      summary?: string | null;
      snippet?: string | null;
      content?: string | null;
    };

const classificationTerms: Array<{ type: CandidateSignalType; patterns: RegExp[] }> = [
  {
    type: "policy_regulatory_change",
    patterns: [
      /\blicen[cs]e\b/i,
      /\bFAA\b/,
      /\bregulat(?:or|ory|ion|ed)\b/i,
      /\bexport control\b/i,
      /\bgovernment procurement\b/i,
    ],
  },
  {
    type: "location_facility_change",
    patterns: [
      /\bfacilit(?:y|ies)\b/i,
      /\bfactor(?:y|ies)\b/i,
      /\btest site\b/i,
      /\bspaceport\b/i,
      /\bpermit\b/i,
      /\bexpansion\b/i,
    ],
  },
  {
    type: "technical_project_milestone",
    patterns: [
      /\blaunch(?:ed|es)?\b/i,
      /\btest(?:ed|s|ing)?\b/i,
      /\bhot[- ]fire\b/i,
      /\bflight\b/i,
      /\borbit(?:al|ed|s)?\b/i,
      /\brecover(?:y|ed|ies)?\b/i,
    ],
  },
];

const ignoredOnlyPatterns = [
  /\bfund(?:ing|ed|raise|raises|raising)\b/i,
  /\bseries [a-z]\b/i,
  /\binvest(?:ment|or|ors)?\b/i,
  /\bhir(?:e|es|ed|ing)\b/i,
  /\bpersonnel\b/i,
  /\bteam\b/i,
  /\bchief\b/i,
  /\bCEO\b/,
  /\bCFO\b/,
  /\bCOO\b/,
];

function toSearchText(input: SignalTextInput): string {
  if (typeof input === "string") {
    return input;
  }

  return [input.title, input.headline, input.summary, input.snippet, input.content]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function classifyCandidateSignalType(input: SignalTextInput): CandidateSignalType | null {
  const text = toSearchText(input);

  for (const classifier of classificationTerms) {
    if (classifier.patterns.some((pattern) => pattern.test(text))) {
      return classifier.type;
    }
  }

  if (ignoredOnlyPatterns.some((pattern) => pattern.test(text))) {
    return null;
  }

  return null;
}
