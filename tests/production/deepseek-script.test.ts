import { describe, it, expect } from "vitest";
import { buildScriptPrompt } from "@/lib/production/deepseek-script";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

const brief = {
  id: "b1", briefTitle: "中国月球计划国际化",
  tagline: "从单干到搭载", factSummary: "嫦娥八号搭载 13 国 21 项目",
  factBullets: ["13 个国家", "21 个研究项目", "前往月球南极"],
  whyItMatters: "这是把上月球这件事重新分配", possibleAngles: [], openQuestions: [], riskNotes: [],
} as unknown as EditorialBrief;
const card = { id: "t1", workingTitle: "中国月球计划国际化", coreQuestion: "是不是同一个月球？", formatLabel: "深度长视频（12-15 min）" } as TopicCard;

describe("buildScriptPrompt", () => {
  const p = buildScriptPrompt(brief, card);
  it("含关键事实与核心问题", () => {
    expect(p).toContain("13 个国家");
    expect(p).toContain("是不是同一个月球？");
  });
  it("含 json 字样(json_object 模式要求)", () => {
    expect(p.toLowerCase()).toContain("json");
  });
  it("要求固定 4 段 id", () => {
    expect(p).toContain("hook");
    expect(p).toContain("close");
  });
  it("嵌入 b-cna-01 few-shot 范本(含其原文片段)", () => {
    expect(p).toContain("嫦娥");
  });
  it("要求分镜随时长伸缩(出现 targetDuration 提示)", () => {
    expect(p).toContain("12-15 min");
  });
});
