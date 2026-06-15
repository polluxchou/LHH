import { describe, it, expect } from "vitest";
import { buildTaskScaffold, deriveTargetDuration } from "@/lib/production/stub-production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

const brief = { id: "b1", briefTitle: "测试简报" } as EditorialBrief;
const card = { id: "t1", workingTitle: "测试选题", formatLabel: "深度长视频（12-15 min）" } as TopicCard;

describe("deriveTargetDuration", () => {
  it("从 formatLabel 解析时长", () => {
    expect(deriveTargetDuration("深度长视频（12-15 min）")).toBe("12-15 min");
  });
  it("无法解析时回退 5-8 min", () => {
    expect(deriveTargetDuration("竖屏短视频")).toBe("5-8 min");
  });
});

describe("buildTaskScaffold", () => {
  it("用 workingTitle 作标题、formatLabel 作格式", () => {
    const task = buildTaskScaffold(brief, card);
    expect(task.title).toBe("测试选题");
    expect(task.format).toBe("深度长视频（12-15 min）");
    expect(task.checklist.length).toBeGreaterThanOrEqual(7);
    expect(task.checklist.every((c) => c.done === false)).toBe(true);
  });
  it("无 topicCard 时回退 brief.briefTitle", () => {
    const task = buildTaskScaffold(brief, null);
    expect(task.title).toBe("测试简报");
    expect(task.format).toBe("深度短视频（5-8 min）");
  });
});
