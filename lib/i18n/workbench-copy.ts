import type { Locale } from "@/lib/i18n/copy";

// 顶部导航等「外壳」文案随语言切换；工作台内容按设计稿保持中文演示数据。
const zh = {
  brandSub: "v0.4",
  navHome: "工作台",
  navTracking: "追踪对象",
  navBriefs: "编辑简报",
  navTopicPool: "选题库",
  navMap: "情报地图",
  pipelineOnline: "信息源",
  date: { day: "10", month: "6月" },
  switchIdentity: "切换身份（演示）",
  switcherFoot: "整个团队共享一个选题库 · 追踪对象按人订阅",
  trackingCountSuffix: (count: number) => `追踪 ${count} 项`,
};

const en: typeof zh = {
  brandSub: "v0.4",
  navHome: "Workbench",
  navTracking: "Tracked",
  navBriefs: "Briefings",
  navTopicPool: "Topic Pool",
  navMap: "Map",
  pipelineOnline: "Sources",
  date: { day: "10", month: "JUN" },
  switchIdentity: "Switch identity (demo)",
  switcherFoot: "One shared topic pool · tracked objects are subscribed per member",
  trackingCountSuffix: (count: number) => `tracking ${count}`,
};

export type WorkbenchChrome = typeof zh;

export function getWorkbenchChrome(locale: Locale): WorkbenchChrome {
  return locale === "zh" ? zh : en;
}
