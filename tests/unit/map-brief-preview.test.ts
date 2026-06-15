import { describe, expect, it } from "vitest";
import { buildMapBriefPreview } from "@/lib/workflow/map-brief-preview";
import { createInitialWorkflowState } from "@/lib/workflow/local-workflow";

describe("map brief preview", () => {
  it("builds the content shown when a map timeline event opens a brief popup", () => {
    const state = createInitialWorkflowState();
    const brief = state.editorialBriefs.find((item) => item.id === "b-sbx-01");

    expect(brief).toBeDefined();

    const preview = buildMapBriefPreview(brief!);

    expect(preview.title).toBe(brief!.briefTitle);
    expect(preview.facts.length).toBeGreaterThan(1);
    expect(preview.whyItMatters).toBe(brief!.whyItMatters);
    expect(preview.mapContext).toBe(brief!.mapContext);
  });

  it("falls back to the fact summary and an empty map context label", () => {
    const state = createInitialWorkflowState();
    const brief = { ...state.editorialBriefs[0], factBullets: undefined, mapContext: null };

    const preview = buildMapBriefPreview(brief);

    expect(preview.facts).toEqual([brief.factSummary]);
    expect(preview.mapContext).toBe("暂无地图上下文");
  });
});
