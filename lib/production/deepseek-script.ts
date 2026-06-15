import OpenAI from "openai";
import type { ScriptSection, StoryboardShot, ProductionPackage } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { productions } from "@/lib/data/phase1-fixtures";
import { buildTaskScaffold, deriveTargetDuration } from "@/lib/production/stub-production";

const REQUIRED_SECTION_IDS = ["hook", "context", "core", "close"] as const;

/** 取 b-cna-01 精品包的 script+storyboard 作为 few-shot 范本(只读,单一来源)。 */
function exemplarBlock(): string {
  const ex = productions["b-cna-01"];
  if (!ex) return "";
  return JSON.stringify({ sections: ex.script.sections, storyboard: ex.storyboard }, null, 2);
}

export function buildScriptPrompt(
  brief: EditorialBrief,
  topicCard?: TopicCard | null,
  targetDurationOverride?: string,
): string {
  const facts = brief.factBullets ?? [brief.factSummary];
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  const targetDuration = targetDurationOverride?.trim() || deriveTargetDuration(formatLabel);
  const coreQuestion = topicCard?.coreQuestion ?? "这件事对读者意味着什么？";
  const workingTitle = topicCard?.workingTitle ?? brief.briefTitle;

  return [
    `你是"林哈哈聊太空"的主笔编辑。请基于下面这条航天简报，写一份短视频脚本与配套分镜。`,
    ``,
    `【选题】${workingTitle}`,
    `【核心问题】${coreQuestion}`,
    `【目标时长】${targetDuration}`,
    `【事实要点】`,
    ...facts.map((f) => `- ${f}`),
    `【为什么重要】${brief.whyItMatters}`,
    ``,
    `下面是一份高质量范本(注意它的叙事密度、口语化推进、用具体数字与画面收束的风格)，请向它看齐，但不要照抄内容：`,
    exemplarBlock(),
    ``,
    `请只输出一个 JSON 对象(不要解释、不要 markdown 代码块)，结构如下：`,
    `{`,
    `  "sections": [`,
    `    {"id":"hook","label":"开场 · 钩子","duration":"0:00–0:35","body":"……"},`,
    `    {"id":"context","label":"背景","duration":"……","body":"……"},`,
    `    {"id":"core","label":"核心 · 为什么重要","duration":"……","body":"……"},`,
    `    {"id":"close","label":"收束","duration":"……","body":"……"}`,
    `  ],`,
    `  "storyboard": [`,
    `    {"n":1,"time":"0:00-0:08","shot":"镜头描述","voiceOver":"旁白","visual":"画面","notes":"备注"}`,
    `  ]`,
    `}`,
    ``,
    `要求：`,
    `1. sections 必须恰好 4 段，id 依次为 hook/context/core/close，body 为中文、有信息量、可直接配音。`,
    `2. storyboard 条数随目标时长伸缩(约每 60-90 秒一镜；${targetDuration} 大致 ${storyboardHint(targetDuration)} 镜)，n 从 1 连续递增，time 覆盖整段时长，每条字段都要填。`,
    `3. 【关键】每个分镜的 voiceOver 必须是该镜头时间段【实际要念的完整旁白原文】——按时间顺序把上面 sections 的正文切分到各镜头里，所有分镜的 voiceOver 连起来应基本覆盖整篇脚本正文。严禁用省略号"……"略写、严禁只写开头几个字当占位（上面范本里 voiceOver 用省略号只是为了示意，你的输出必须把每句旁白写完整）。仅纯标题卡/字幕卡这类无人声镜头可填"（无）"。`,
    `4. 全程中文。只输出 json。`,
  ].join("\n");
}

/** 给模型一个分镜条数的量级提示(纯展示,不强校验)。支持区间"5-8 min"与单值"3 min"。 */
function storyboardHint(targetDuration: string): string {
  const range = targetDuration.match(/(\d+)\s*[-–~]\s*(\d+)/);
  let minutes: number;
  if (range) {
    minutes = (Number(range[1]) + Number(range[2])) / 2;
  } else {
    const single = targetDuration.match(/(\d+)/);
    minutes = single ? Number(single[1]) : 6;
  }
  const shots = Math.max(6, Math.round((minutes * 60) / 50));
  return `${Math.max(6, shots - 1)}-${shots + 1}`;
}

function nonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseProduction(
  raw: string,
): { sections: ScriptSection[]; storyboard: StoryboardShot[] } | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;

  const rawSections = Array.isArray(o.sections) ? o.sections : [];
  if (rawSections.length !== 4) return null;
  const sections: ScriptSection[] = [];
  for (let i = 0; i < 4; i++) {
    const s = rawSections[i] as Record<string, unknown>;
    if (!s || s.id !== REQUIRED_SECTION_IDS[i]) return null;
    const body = nonEmpty(s.body);
    const label = nonEmpty(s.label);
    const duration = nonEmpty(s.duration);
    if (!body || !label || !duration) return null;
    sections.push({ id: REQUIRED_SECTION_IDS[i] as string, label, duration, body });
  }

  const rawShots = Array.isArray(o.storyboard) ? o.storyboard : [];
  if (rawShots.length < 6) return null;
  const storyboard: StoryboardShot[] = [];
  for (let i = 0; i < rawShots.length; i++) {
    const sh = rawShots[i] as Record<string, unknown>;
    if (!sh) return null;
    const time = nonEmpty(sh.time);
    const shot = nonEmpty(sh.shot);
    const voiceOver = nonEmpty(sh.voiceOver);
    const visual = nonEmpty(sh.visual);
    const notes = typeof sh.notes === "string" ? sh.notes : "";
    if (!time || !shot || !voiceOver || !visual) return null;
    storyboard.push({ n: i + 1, time, shot, voiceOver, visual, notes });
  }

  return { sections, storyboard };
}

export interface GenerateDeps {
  complete: (prompt: string) => Promise<string>;
}

function defaultDeps(): GenerateDeps {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  return {
    complete: async (prompt) => {
      const res = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        // 长视频(12-15 min)需 4 段脚本 + ~10-13 个分镜的完整 JSON;留足上限避免截断导致 JSON 解析失败。
        max_tokens: 8000,
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export async function generateProduction(
  opts: { brief: EditorialBrief; topicCard?: TopicCard | null; targetDuration?: string },
  deps: GenerateDeps = defaultDeps(),
): Promise<ProductionPackage> {
  const topicCard = opts.topicCard ?? null;
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  // 用户在工作室选定的时长优先;否则回退到选题卡 formatLabel 推导。
  const targetDuration = opts.targetDuration?.trim() || deriveTargetDuration(formatLabel);
  const prompt = buildScriptPrompt(opts.brief, topicCard, targetDuration);
  // 真实模型偶发输出不达标(已实测);重试一次(temperature>0,重试通常不同)再放弃。
  let parsed = parseProduction(await deps.complete(prompt));
  if (!parsed) parsed = parseProduction(await deps.complete(prompt));
  if (!parsed) throw new Error("DeepSeek 生产包解析失败");
  const wordCount = parsed.sections.reduce((sum, s) => sum + s.body.length, 0);
  return {
    script: { targetDuration, wordCount, sections: parsed.sections },
    storyboard: parsed.storyboard,
    task: buildTaskScaffold(opts.brief, topicCard),
  };
}
