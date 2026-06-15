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

import { parseProduction } from "@/lib/production/deepseek-script";

const goodSections = [
  { id: "hook", label: "开场", duration: "0:00–0:35", body: "钩子正文" },
  { id: "context", label: "背景", duration: "0:35–3:00", body: "背景正文" },
  { id: "core", label: "核心", duration: "3:00–9:00", body: "核心正文" },
  { id: "close", label: "收束", duration: "9:00–12:00", body: "收束正文" },
];
const goodShots = Array.from({ length: 6 }, (_, i) => ({
  n: i + 1, time: `${i}:00-${i + 1}:00`, shot: `镜${i + 1}`, voiceOver: "旁白", visual: "画面", notes: "备注",
}));

describe("parseProduction", () => {
  it("合法 JSON → 返回 sections + storyboard", () => {
    const r = parseProduction(JSON.stringify({ sections: goodSections, storyboard: goodShots }));
    expect(r).not.toBeNull();
    expect(r!.sections).toHaveLength(4);
    expect(r!.storyboard).toHaveLength(6);
  });
  it("坏 JSON → null", () => {
    expect(parseProduction("not json")).toBeNull();
  });
  it("段数不足 4 → null", () => {
    expect(parseProduction(JSON.stringify({ sections: goodSections.slice(0, 3), storyboard: goodShots }))).toBeNull();
  });
  it("段 id 不命中 → null", () => {
    const bad = [...goodSections]; bad[0] = { ...bad[0], id: "intro" };
    expect(parseProduction(JSON.stringify({ sections: bad, storyboard: goodShots }))).toBeNull();
  });
  it("body 为空 → null", () => {
    const bad = [...goodSections]; bad[1] = { ...bad[1], body: "  " };
    expect(parseProduction(JSON.stringify({ sections: bad, storyboard: goodShots }))).toBeNull();
  });
  it("分镜少于 6 条 → null", () => {
    expect(parseProduction(JSON.stringify({ sections: goodSections, storyboard: goodShots.slice(0, 5) }))).toBeNull();
  });
  it("分镜字段缺失 → null", () => {
    const bad = [...goodShots]; bad[0] = { ...bad[0], visual: "" };
    expect(parseProduction(JSON.stringify({ sections: goodSections, storyboard: bad }))).toBeNull();
  });
});

import { generateProduction } from "@/lib/production/deepseek-script";

describe("generateProduction", () => {
  const okJson = JSON.stringify({ sections: goodSections, storyboard: goodShots });

  it("注入 mock complete → 组装出完整 ProductionPackage", async () => {
    const pkg = await generateProduction({ brief, topicCard: card }, { complete: async () => okJson });
    expect(pkg.script.sections).toHaveLength(4);
    expect(pkg.storyboard).toHaveLength(6);
    expect(pkg.script.targetDuration).toBe("12-15 min"); // 来自 formatLabel
    expect(pkg.script.wordCount).toBeGreaterThan(0);      // 由正文统计
    expect(pkg.task.title).toBe("中国月球计划国际化");      // 来自脚手架
    expect(pkg.task.checklist.length).toBeGreaterThanOrEqual(7);
  });

  it("complete 返回坏 JSON → 抛错", async () => {
    await expect(generateProduction({ brief, topicCard: card }, { complete: async () => "garbage" })).rejects.toThrow();
  });
});

describe("generateProduction 重试", () => {
  const okJson2 = JSON.stringify({ sections: goodSections, storyboard: goodShots });

  it("首次坏 JSON、重试good → 成功(调用 2 次)", async () => {
    let calls = 0;
    const complete = async () => { calls += 1; return calls === 1 ? "garbage" : okJson2; };
    const pkg = await generateProduction({ brief, topicCard: card }, { complete });
    expect(pkg.script.sections).toHaveLength(4);
    expect(calls).toBe(2);
  });

  it("两次都坏 → 抛错(调用 2 次,不再无限重试)", async () => {
    let calls = 0;
    const complete = async () => { calls += 1; return "garbage"; };
    await expect(generateProduction({ brief, topicCard: card }, { complete })).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it("首次就 good → 不重试(只调用 1 次)", async () => {
    let calls = 0;
    const complete = async () => { calls += 1; return okJson2; };
    await generateProduction({ brief, topicCard: card }, { complete });
    expect(calls).toBe(1);
  });
});
