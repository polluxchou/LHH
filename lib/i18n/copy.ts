export type Locale = "en" | "zh";

export const supportedLocales = ["en", "zh"] as const;

const en = {
  languageName: "English",
  alternateLocaleHref: "/zh",
  alternateLocaleLabel: "中文",
  nav: {
    brand: "Aerospace Intelligence",
    tracking: "Tracking",
    briefs: "Brief Inbox",
    topicPool: "Topic Pool",
    map: "Map",
  },
  workbench: {
    phaseLabel: "Phase 3 Hardened Demo",
    title: "Integrated intelligence workflow",
    intro:
      "Run the local MVP loop from tracking object to daily search, candidate signal, source-backed brief, screening decision, topic card, map context, source-confidence display, and run-log observability.",
    trackedObjects: "Tracked objects",
    searchRun: "Search run",
    runSearch: "Run mocked daily search",
    simulateFailedSearch: "Simulate failed search",
    status: "Status",
    queries: "Queries",
    results: "Results",
    candidateSignalsMetric: "Candidate signals",
    error: "Error",
    runSearchEmpty: "Run search to create a local search run.",
    selectedObjectMapContext: "Selected object map context",
    candidateSignals: "Candidate signals",
    noCandidateSignals: "No candidate signals for this tracking object.",
    openExistingBrief: "Open existing brief",
    generateBrief: "Generate editorial brief",
    briefQueue: "Brief queue",
    screened: "Screened",
    ready: "Ready",
    noBriefs: "No briefs yet. Generate a brief from a candidate signal to start.",
    activeBriefMapContext: "Active brief map context",
    alreadyScreenedTitle: "This brief has already been screened.",
    alreadyScreenedDetail: "Screened briefs are read-only in the integrated Phase 3 workflow.",
    approve: "Approve",
    watch: "Watch",
    reject: "Reject",
    topicPool: "Topic pool",
    noTopicCards: "Approved briefs for this object will appear here.",
    runLog: "Run log",
    sourceConfidence: "Source confidence",
    sourceConfidenceEmpty: "No matching sources are attached to this brief.",
    unknownPublisher: "Unknown publisher",
    confidence: "Confidence",
  },
  feedback: {
    briefGenerationFailed: "Brief generation failed.",
    screeningActionFailed: "Screening action failed.",
    unknownWorkflowError: "Unknown workflow error.",
  },
};

const zh: typeof en = {
  languageName: "中文",
  alternateLocaleHref: "/",
  alternateLocaleLabel: "English",
  nav: {
    brand: "航天情报筛选台",
    tracking: "追踪对象",
    briefs: "编辑简报",
    topicPool: "选题库",
    map: "地图上下文",
  },
  workbench: {
    phaseLabel: "Phase 3 加固演示",
    title: "集成情报工作流",
    intro:
      "从追踪对象出发，完成本地 MVP 闭环：日更搜索、候选信号、带来源的编辑简报、筛选决策、选题卡、地图上下文、来源可信度和运行日志。",
    trackedObjects: "追踪对象",
    searchRun: "搜索运行",
    runSearch: "运行模拟日更搜索",
    simulateFailedSearch: "模拟搜索失败",
    status: "状态",
    queries: "查询数",
    results: "结果数",
    candidateSignalsMetric: "候选信号",
    error: "错误",
    runSearchEmpty: "运行搜索后会生成一条本地搜索记录。",
    selectedObjectMapContext: "当前对象地图上下文",
    candidateSignals: "候选信号",
    noCandidateSignals: "当前追踪对象还没有候选信号。",
    openExistingBrief: "打开已有简报",
    generateBrief: "生成编辑简报",
    briefQueue: "简报队列",
    screened: "已筛选",
    ready: "待筛选",
    noBriefs: "还没有简报。请先从候选信号生成编辑简报。",
    activeBriefMapContext: "当前简报地图上下文",
    alreadyScreenedTitle: "这条简报已经完成筛选。",
    alreadyScreenedDetail: "已筛选简报在 Phase 3 集成工作流中为只读状态，避免重复决策。",
    approve: "通过",
    watch: "观察",
    reject: "拒绝",
    topicPool: "选题库",
    noTopicCards: "通过筛选的简报会在这里形成选题卡。",
    runLog: "运行日志",
    sourceConfidence: "来源可信度",
    sourceConfidenceEmpty: "这条简报还没有匹配到来源。",
    unknownPublisher: "未知发布方",
    confidence: "可信度",
  },
  feedback: {
    briefGenerationFailed: "简报生成失败。",
    screeningActionFailed: "筛选操作失败。",
    unknownWorkflowError: "未知工作流错误。",
  },
};

const dictionaries = {
  en,
  zh,
};

export type InterfaceCopy = typeof en;

export function getCopy(locale: string): InterfaceCopy {
  return dictionaries[isSupportedLocale(locale) ? locale : "en"];
}

export function isSupportedLocale(locale: string): locale is Locale {
  return supportedLocales.includes(locale as Locale);
}
