import type { Launch, LaunchOrg } from "@/lib/domain/types";

// 紧固件全球展会日程 · 真实可核实数据（用于"紧固件供应链"类空间，如 Mr.Marco）。
// 每条都经官网核实：确切档期 + 城市 + 展馆 + 官网；查不到确切信息的不收录。
// 复用 Launch 结构，让发射日程视图的时间线 UI 直接渲染（展会模式下隐藏 UTC 时间）。
//   字段映射：mission→展会名 · vehicle→主办方 · site/pad→城市/展馆 · orgId→地区
//            orbit→确切档期 · payload→品类 · window→展期 · watch→官网
// 核实日期：2026-06-15（官网数据，下次维护需复核档期是否更新）。

export const EXPO_SIM_TODAY = "2026-06-10"; // 仅作首屏回退；视图实际用真实本机日期

/** 使用"紧固件展会"日程（而非火箭发射）的空间名单。 */
export const EXPO_SCHEDULE_SPACE_NAMES = ["Mr.Marco"];

/** 当前空间是否走"紧固件展会"日程。导航菜单与日程视图共用，避免判断漂移。 */
export function usesExpoSchedule(spaceName: string | null | undefined): boolean {
  return !!spaceName && EXPO_SCHEDULE_SPACE_NAMES.includes(spaceName);
}

/** 地区（复用 LaunchOrg 结构作为"机构"维度），仅保留下方展会用到的地区。 */
export const expoOrgs: Record<string, LaunchOrg> = {
  china: { name: "中国", short: "中国", color: "#ff4d4f", country: "CN", flag: "🇨🇳" },
  italy: { name: "意大利", short: "意大利", color: "#13c2c2", country: "IT", flag: "🇮🇹" },
  india: { name: "印度", short: "印度", color: "#fa8c16", country: "IN", flag: "🇮🇳" },
  germany: { name: "德国", short: "德国", color: "#737373", country: "DE", flag: "🇩🇪" },
};

// 真实展会（官网核实，2026-06-15）。date 取开幕日，window 为展期，orbit 为确切档期。
// timeUTC 留空：展会无统一开闭时间，展会模式下不显示 UTC 时钟。主办方未确证的留空（vehicle）。
export const fastenerExpos: Launch[] = [
  {
    id: "fe-shanghai-2026", date: "2026-06-24", timeUTC: "", orgId: "china",
    vehicle: "", mission: "Fastener Expo Shanghai 上海紧固件专业展 2026",
    pad: "国家会展中心（NECC）", site: "上海", siteCountry: "CN", status: "confirmed",
    orbit: "2026-06-24 – 06-26", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerexpo.cn",
  },
  {
    id: "fe-italy-2026", date: "2026-06-24", timeUTC: "", orgId: "italy",
    vehicle: "RX Global", mission: "Fastener Fair Italy 2026",
    pad: "CityLife · Allianz MiCo", site: "米兰", siteCountry: "IT", status: "confirmed",
    orbit: "2026-06-24 – 06-25", payload: "紧固件 · 紧固与连接技术", window: "2 天",
    watch: "fastenerfairitaly.com",
  },
  {
    id: "fe-india-2026", date: "2026-07-24", timeUTC: "", orgId: "india",
    vehicle: "RX Global", mission: "Fastener Fair India 2026",
    pad: "India Expo Mart", site: "大诺伊达（Greater Noida）", siteCountry: "IN", status: "confirmed",
    orbit: "2026-07-24 – 07-26", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerfairindia.com",
  },
  {
    id: "fe-global-stuttgart-2027", date: "2027-04-06", timeUTC: "", orgId: "germany",
    vehicle: "RX Global", mission: "Fastener Fair Global 2027（旗舰展）",
    pad: "Messe Stuttgart", site: "斯图加特", siteCountry: "DE", status: "confirmed",
    orbit: "2027-04-06 – 04-08", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerfairglobal.com",
  },
];
