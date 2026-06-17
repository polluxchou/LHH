import { describe, expect, it } from "vitest";
import { getCopy } from "@/lib/i18n/copy";
import type { TrackingObject } from "@/lib/domain/types";
import { buildAdaptiveAddCopy, type AdaptiveAddBase } from "@/lib/workflow/adaptive-add-copy";

const zhBase = getCopy("zh").dialogs.addTracked as unknown as AdaptiveAddBase;
const enBase = getCopy("en").dialogs.addTracked as unknown as AdaptiveAddBase;

function obj(over: Partial<TrackingObject>): TrackingObject {
  return {
    id: "o", name: "Acme", nameZh: "阿克梅", type: "company", aliases: [],
    countryOrRegion: "深圳", officialUrl: null, primaryTrack: "高强度螺栓", whyTrack: "",
    keywords: ["螺栓", "Acme", "钛合金"], excludedTerms: [], languages: [], regions: [],
    preferredSources: [], searchFrequency: "daily", priority: 2,
    createdAt: "2026-01-01", updatedAt: "2026-01-01", createdBy: null,
    ...over,
  };
}

describe("buildAdaptiveAddCopy", () => {
  it("weaves the theme into the title when set, leaving placeholders generic", () => {
    const r = buildAdaptiveAddCopy({ base: zhBase, theme: "紧固件行业", objects: [] });
    expect(r.title).toBe(zhBase.titleThemed("紧固件行业"));
    expect(r.nameZhPlaceholder).toBe(zhBase.nameZhPlaceholder);
    expect(r.trackPlaceholder).toBe(zhBase.trackPlaceholder);
  });

  it("derives placeholders from a real object when no theme is set", () => {
    const r = buildAdaptiveAddCopy({ base: zhBase, theme: "", objects: [obj({})] });
    expect(r.title).toBe(zhBase.title);
    expect(r.nameZhPlaceholder).toBe("例：阿克梅");
    expect(r.nameEnPlaceholder).toBe("例：Acme");
    expect(r.trackPlaceholder).toBe("例：高强度螺栓");
    expect(r.hqPlaceholder).toBe("例：深圳");
    expect(r.keywordsPlaceholder).toBe("例：螺栓, Acme, 钛合金");
  });

  it("combines theme title and object-derived placeholders", () => {
    const r = buildAdaptiveAddCopy({ base: zhBase, theme: "紧固件行业", objects: [obj({})] });
    expect(r.title).toBe(zhBase.titleThemed("紧固件行业"));
    expect(r.nameZhPlaceholder).toBe("例：阿克梅");
  });

  it("returns the static base copy when there is neither theme nor objects", () => {
    const r = buildAdaptiveAddCopy({ base: zhBase, theme: "  ", objects: [] });
    expect(r).toEqual({
      title: zhBase.title,
      nameZhPlaceholder: zhBase.nameZhPlaceholder,
      nameEnPlaceholder: zhBase.nameEnPlaceholder,
      trackPlaceholder: zhBase.trackPlaceholder,
      hqPlaceholder: zhBase.hqPlaceholder,
      keywordsPlaceholder: zhBase.keywordsPlaceholder,
    });
  });

  it("falls back to base for fields the object does not provide", () => {
    const r = buildAdaptiveAddCopy({
      base: zhBase,
      objects: [obj({ primaryTrack: "  ", keywords: [] })],
    });
    expect(r.trackPlaceholder).toBe(zhBase.trackPlaceholder);
    expect(r.keywordsPlaceholder).toBe(zhBase.keywordsPlaceholder);
    expect(r.nameZhPlaceholder).toBe("例：阿克梅"); // still derived
  });

  it("uses the most-recently-updated object for examples", () => {
    const older = obj({ id: "old", nameZh: "旧对象", updatedAt: "2026-01-01" });
    const newer = obj({ id: "new", nameZh: "新对象", updatedAt: "2026-06-01" });
    const r = buildAdaptiveAddCopy({ base: zhBase, objects: [older, newer] });
    expect(r.nameZhPlaceholder).toBe("例：新对象");
  });

  it("pulls keywords from the most-recent object that has any", () => {
    const newer = obj({ id: "new", nameZh: "新对象", updatedAt: "2026-06-01", keywords: [] });
    const older = obj({ id: "old", nameZh: "旧对象", updatedAt: "2026-01-01", keywords: ["甲", "乙"] });
    const r = buildAdaptiveAddCopy({ base: zhBase, objects: [newer, older] });
    expect(r.nameZhPlaceholder).toBe("例：新对象"); // name from newest
    expect(r.keywordsPlaceholder).toBe("例：甲, 乙"); // keywords from the one that has them
  });

  it("uses the English egPrefix and themed title for the en locale", () => {
    const r = buildAdaptiveAddCopy({ base: enBase, theme: "Fastener industry", objects: [obj({})] });
    expect(r.title).toBe(enBase.titleThemed("Fastener industry"));
    expect(r.nameZhPlaceholder).toBe("e.g. 阿克梅");
    expect(r.trackPlaceholder).toBe("e.g. 高强度螺栓");
  });
});
