import type { ProductionPackage } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

function stripSubtitle(value: string): string {
  return value.replace(/[：:].*$/, "");
}

/**
 * Builds a draft production package (script / storyboard / task) for a topic
 * card that has no hand-curated package yet. Mirrors the Claude Design
 * prototype's stub generator so the studio always opens with usable drafts.
 */
export function createStubProduction(brief: EditorialBrief, topicCard?: TopicCard | null): ProductionPackage {
  const facts = brief.factBullets ?? [brief.factSummary];
  const tagline = brief.tagline ?? brief.briefTitle;
  const coreQuestion = topicCard?.coreQuestion ?? "这件事对读者意味着什么？";
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  const workingTitle = topicCard?.workingTitle ?? brief.briefTitle;
  const targetDuration = formatLabel.match(/(\d+[-–~]?\d*\s*min)/i)?.[1] ?? "5-8 min";

  return {
    script: {
      targetDuration,
      wordCount: 980,
      sections: [
        {
          id: "hook",
          label: "开场 · 钩子（草稿）",
          duration: "0:00–0:30",
          body: `${tagline}。\n这是一个一眼看上去技术、但实际上正在重写整个赛道经济学的事件。\n（编辑可在此处替换为面向自有读者群的开场。）`,
        },
        {
          id: "context",
          label: "背景（草稿）",
          duration: "0:30–2:00",
          body: facts.join("\n"),
        },
        {
          id: "core",
          label: "为什么重要（草稿）",
          duration: "2:00–5:00",
          body: brief.whyItMatters,
        },
        {
          id: "close",
          label: "收束（草稿）",
          duration: "5:00–6:00",
          body: `回到一个问题：${coreQuestion}\n（建议编辑用一个具体的画面或反问收束。）`,
        },
      ],
    },
    storyboard: [
      { n: 1, time: "0:00-0:08", shot: "标题卡", voiceOver: "（无）", visual: `${stripSubtitle(brief.briefTitle)} · 字幕`, notes: "配乐 IN · 模板套用" },
      { n: 2, time: "0:08-0:30", shot: "钩子镜头", voiceOver: tagline, visual: "主视觉 + 关键数字浮现", notes: "需要主视觉设计" },
      { n: 3, time: "0:30-2:00", shot: "背景陈述", voiceOver: facts[0] ?? "", visual: "资料镜头 / 时间线", notes: "版权待核" },
      { n: 4, time: "2:00-3:30", shot: "核心论证 A", voiceOver: facts[1] ?? "", visual: "示意图 / 数据可视化", notes: "设计师交付" },
      { n: 5, time: "3:30-5:00", shot: "核心论证 B", voiceOver: facts[2] ?? brief.whyItMatters.slice(0, 60), visual: "对比镜头", notes: "可用 B-roll" },
      { n: 6, time: "5:00-6:00", shot: "收束 · 问题卡", voiceOver: coreQuestion, visual: "回到标题排版", notes: "配乐 OUT" },
    ],
    task: {
      title: workingTitle,
      format: formatLabel,
      channel: "YouTube · B站 · 微信视频号",
      owner: "林哈哈（主笔） · 待分配（剪辑）",
      deadline: "待定（建议 14 个工作日内）",
      budget: "待估算",
      checklist: [
        { id: "k1", label: "脚本一稿核查（事实 + 引述）", done: false, who: "研究员" },
        { id: "k2", label: "关键来源版权确认", done: false, who: "研究员" },
        { id: "k3", label: "B-roll 采购清单", done: false, who: "剪辑" },
        { id: "k4", label: "配音录制", done: false, who: "林哈哈" },
        { id: "k5", label: "剪辑一稿", done: false, who: "剪辑" },
        { id: "k6", label: "审片 + 上字幕", done: false, who: "林哈哈" },
        { id: "k7", label: "发布与跨平台分发", done: false, who: "社媒" },
      ],
    },
  };
}
