import type { Launch, LaunchOrg } from "@/lib/domain/types";

// 紧固件全球展会日程 · 拟真演示数据（用于"紧固件供应链"类空间，如 Mr.Marco）。
// 复用 Launch 结构，让发射日程视图的时间线 UI 直接渲染；字段语义映射见下。
//   mission → 展会名 · vehicle → 主办方 · site/pad → 城市/展馆 · orgId → 地区
//   orbit → 届数/规模 · payload → 主要品类 · window → 展期 · watch → 官网/报名
// 与其余演示数据共用同一个"今天" 2026-06-10，保证"未来 7/30 天"筛选有内容。

export const EXPO_SIM_TODAY = "2026-06-10";

/** 使用"紧固件展会"日程（而非火箭发射）的空间名单。 */
export const EXPO_SCHEDULE_SPACE_NAMES = ["Mr.Marco"];

/** 当前空间是否走"紧固件展会"日程。导航菜单与日程视图共用，避免判断漂移。 */
export function usesExpoSchedule(spaceName: string | null | undefined): boolean {
  return !!spaceName && EXPO_SCHEDULE_SPACE_NAMES.includes(spaceName);
}

/** 地区/主办（复用 LaunchOrg 结构作为"机构"维度）。 */
export const expoOrgs: Record<string, LaunchOrg> = {
  china: { name: "中国", short: "中国", color: "#ff4d4f", country: "CN", flag: "🇨🇳" },
  europe: { name: "欧洲", short: "欧洲", color: "#2d2d5e", country: "EU", flag: "🇪🇺" },
  germany: { name: "德国", short: "德国", color: "#737373", country: "DE", flag: "🇩🇪" },
  usa: { name: "美国", short: "美国", color: "#1a8cff", country: "US", flag: "🇺🇸" },
  italy: { name: "意大利", short: "意大利", color: "#13c2c2", country: "IT", flag: "🇮🇹" },
  india: { name: "印度", short: "印度", color: "#fa8c16", country: "IN", flag: "🇮🇳" },
  japan: { name: "日本", short: "日本", color: "#eb2f96", country: "JP", flag: "🇯🇵" },
  turkey: { name: "土耳其", short: "土耳其", color: "#fa541c", country: "TR", flag: "🇹🇷" },
  mexico: { name: "墨西哥", short: "墨西哥", color: "#52c41a", country: "MX", flag: "🇲🇽" },
};

export const fastenerExpos: Launch[] = [
  { id: "e-001", date: "2026-06-10", timeUTC: "09:00", orgId: "china", vehicle: "RX 励展 / 上海会展", mission: "上海国际紧固件工业博览会 2026", pad: "国家会展中心 6.2H", site: "上海", siteCountry: "CN", status: "confirmed", orbit: "第 14 届 · 1,200+ 展商", payload: "螺栓螺母 · 紧固系统 · 装配工具 · 表面处理", window: "3 天", watch: "fastenershanghai.com" },
  { id: "e-002", date: "2026-06-11", timeUTC: "09:00", orgId: "germany", vehicle: "Mack Brooks / RX", mission: "Fastener Fair Global 2026（斯图加特）", pad: "Messe Stuttgart Hall 1", site: "斯图加特", siteCountry: "DE", status: "confirmed", orbit: "旗舰展 · 950 展商 · 90 国", payload: "工业紧固件 · 连接技术 · 装配自动化", window: "3 天", watch: "fastenerfair.com/global" },
  { id: "e-003", date: "2026-06-12", timeUTC: "10:00", orgId: "italy", vehicle: "Mack Brooks / RX", mission: "Fastener Fair Italy 2026", pad: "MiCo Milano", site: "米兰", siteCountry: "IT", status: "window", orbit: "第 5 届 · 420 展商", payload: "紧固件 · 弹簧 · 冷镦 · 检测设备", window: "2 天", watch: "fastenerfair.com/italy" },
  { id: "e-004", date: "2026-06-13", timeUTC: "10:00", orgId: "india", vehicle: "Messe Frankfurt India", mission: "Fastener Fair India 2026（孟买）", pad: "Bombay Exhibition Centre", site: "孟买", siteCountry: "IN", status: "confirmed", orbit: "第 4 届 · 300 展商", payload: "标准件 · 紧固件原材料 · 线材", window: "3 天", watch: "fastenerfairindia.com" },
  { id: "e-005", date: "2026-06-15", timeUTC: "09:30", orgId: "china", vehicle: "宁波紧固件协会", mission: "中国紧固件之都（宁波）博览会", pad: "宁波国际会展中心", site: "宁波", siteCountry: "CN", status: "confirmed", orbit: "第 18 届 · 800 展商", payload: "高强度螺栓 · 异型件 · 冷镦设备 · 模具", window: "3 天", watch: "nb-fastener.com" },
  { id: "e-006", date: "2026-06-18", timeUTC: "10:00", orgId: "turkey", vehicle: "Hannover Messe / TÜYAP", mission: "Fastener Fair Türkiye 2026", pad: "Istanbul Expo Center", site: "伊斯坦布尔", siteCountry: "TR", status: "window", orbit: "第 8 届 · 350 展商", payload: "紧固件 · 五金 · 表面处理 · 物流", window: "3 天", watch: "fastenerfairturkey.com" },
  { id: "e-007", date: "2026-06-22", timeUTC: "10:00", orgId: "japan", vehicle: "Reed Exhibitions Japan", mission: "日本国际紧固件 · 配管展（东京）", pad: "Tokyo Big Sight 东馆", site: "东京", siteCountry: "JP", status: "tentative", orbit: "第 9 届 · 260 展商", payload: "精密紧固件 · 微型螺丝 · 防松技术", window: "3 天", watch: "fastener-tokyo.jp" },
  { id: "e-008", date: "2026-06-28", timeUTC: "10:00", orgId: "mexico", vehicle: "RX México", mission: "Fastener Fair Mexico 2026", pad: "Cintermex Monterrey", site: "蒙特雷", siteCountry: "MX", status: "tentative", orbit: "首届 · 180 展商", payload: "汽车紧固件 · 工业连接件 · 工具", window: "2 天", watch: "fastenerfairmexico.com" },
  { id: "e-009", date: "2026-07-05", timeUTC: "09:00", orgId: "china", vehicle: "深圳会展", mission: "深圳国际弹簧 · 紧固件展", pad: "深圳国际会展中心", site: "深圳", siteCountry: "CN", status: "window", orbit: "第 7 届 · 600 展商", payload: "弹簧 · 紧固件 · 自动化装配 · 检测", window: "3 天", watch: "szspring-fastener.com" },
  { id: "e-010", date: "2026-07-15", timeUTC: "10:00", orgId: "usa", vehicle: "Emerald Expositions", mission: "International Fastener Expo（拉斯维加斯）", pad: "Mandalay Bay Convention Center", site: "拉斯维加斯", siteCountry: "US", status: "tentative", orbit: "旗舰展 · 800 展商", payload: "工业紧固件 · 分销 · 包装 · 物流", window: "3 天", watch: "fastenerexpo.com" },
];

/** 距演示"今天"的天数（0 = 今天，负数 = 已过）。 */
export function expoDayDiff(date: string): number {
  return Math.round((new Date(date).getTime() - new Date(EXPO_SIM_TODAY).getTime()) / 86_400_000);
}
