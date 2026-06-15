import type { Launch, LaunchOrg } from "@/lib/domain/types";

// 紧固件全球展会日程 · 2026 全年 · 真实可核实数据（用于"紧固件供应链"类空间，如 Mr.Marco）。
// 每条均经官网/行业平台核实：确切档期 + 城市 + 展馆 + 官网；查不到确切信息的不收录。
// 复用 Launch 结构，让发射日程视图的时间线 UI 直接渲染（展会模式下隐藏 UTC 时间）。
//   字段映射：mission→展会名 · vehicle→主办方 · site/pad→城市/展馆 · orgId→地区
//            orbit→确切档期 · payload→品类 · window→展期 · watch→官网
// 核实日期 2026-06-15。注意：档期/官网可能更新，下次维护需复核。
// 已知但本轮剔除：Fastener & Fixing Vietnam（展馆 VEC/I.C.E. 两源不一致）、
// Fastenex Moscow（官网未确证）、Fastener Fair Global Stuttgart（2027 年，超出 2026 范围）。

export const EXPO_SIM_TODAY = "2026-06-10"; // 仅作首屏回退；视图实际用真实本机日期

/** 使用"紧固件展会"日程（而非火箭发射）的空间名单。 */
export const EXPO_SCHEDULE_SPACE_NAMES = ["Mr.Marco"];

/** 当前空间是否走"紧固件展会"日程。导航菜单与日程视图共用，避免判断漂移。 */
export function usesExpoSchedule(spaceName: string | null | undefined): boolean {
  return !!spaceName && EXPO_SCHEDULE_SPACE_NAMES.includes(spaceName);
}

/** 地区（复用 LaunchOrg 结构作为"机构"维度），仅保留下方展会用到的地区。 */
export const expoOrgs: Record<string, LaunchOrg> = {
  taiwan: { name: "中国台湾", short: "台湾", color: "#9254de", country: "TW", flag: "🇹🇼" },
  china: { name: "中国", short: "中国", color: "#ff4d4f", country: "CN", flag: "🇨🇳" },
  italy: { name: "意大利", short: "意大利", color: "#13c2c2", country: "IT", flag: "🇮🇹" },
  india: { name: "印度", short: "印度", color: "#fa8c16", country: "IN", flag: "🇮🇳" },
  mexico: { name: "墨西哥", short: "墨西哥", color: "#52c41a", country: "MX", flag: "🇲🇽" },
  turkey: { name: "土耳其", short: "土耳其", color: "#fa541c", country: "TR", flag: "🇹🇷" },
  usa: { name: "美国", short: "美国", color: "#1a8cff", country: "US", flag: "🇺🇸" },
  poland: { name: "波兰", short: "波兰", color: "#2d2d5e", country: "PL", flag: "🇵🇱" },
};

// 真实展会（按开幕日排序）。date 取开幕日；orbit 为确切档期；window 为展期。
// timeUTC 留空：展会无统一开闭时间，展会模式下不显示 UTC 时钟。主办方未确证的 vehicle 留空。
export const fastenerExpos: Launch[] = [
  {
    id: "fe-taiwan-2026", date: "2026-04-22", timeUTC: "", orgId: "taiwan",
    vehicle: "TAITRA", mission: "Taiwan International Fastener Show 2026（Fastener Taiwan）",
    pad: "高雄展览馆（Kaohsiung Exhibition Center）", site: "高雄", siteCountry: "TW", status: "confirmed",
    orbit: "2026-04-22 – 04-24", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenertaiwan.com.tw",
  },
  {
    id: "fe-ifs-china-2026", date: "2026-05-20", timeUTC: "", orgId: "china",
    vehicle: "", mission: "International Fastener Show China 2026（IFS China）",
    pad: "上海世博展览馆", site: "上海", siteCountry: "CN", status: "confirmed",
    orbit: "2026-05-20 – 05-22", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "afastener.com",
  },
  {
    id: "fe-italy-2026", date: "2026-06-24", timeUTC: "", orgId: "italy",
    vehicle: "RX Global", mission: "Fastener Fair Italy 2026",
    pad: "CityLife · Allianz MiCo", site: "米兰", siteCountry: "IT", status: "confirmed",
    orbit: "2026-06-24 – 06-25", payload: "紧固件 · 紧固与连接技术", window: "2 天",
    watch: "fastenerfairitaly.com",
  },
  {
    id: "fe-shanghai-2026", date: "2026-06-24", timeUTC: "", orgId: "china",
    vehicle: "", mission: "Fastener Expo Shanghai 上海紧固件专业展 2026",
    pad: "国家会展中心（NECC）", site: "上海", siteCountry: "CN", status: "confirmed",
    orbit: "2026-06-24 – 06-26", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerexpo.cn",
  },
  {
    id: "fe-india-2026", date: "2026-07-24", timeUTC: "", orgId: "india",
    vehicle: "RX Global", mission: "Fastener Fair India 2026",
    pad: "India Expo Mart", site: "大诺伊达（Greater Noida）", siteCountry: "IN", status: "confirmed",
    orbit: "2026-07-24 – 07-26", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerfairindia.com",
  },
  {
    id: "fe-mexico-2026", date: "2026-09-03", timeUTC: "", orgId: "mexico",
    vehicle: "RX México", mission: "Fastener Fair Mexico 2026",
    pad: "Expo Guadalajara", site: "瓜达拉哈拉", siteCountry: "MX", status: "confirmed",
    orbit: "2026-09-03 – 09-05", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerfairmexico.com",
  },
  {
    id: "fe-eurasia-2026", date: "2026-09-17", timeUTC: "", orgId: "turkey",
    vehicle: "", mission: "Fastener Expo Eurasia 2026",
    pad: "Tüyap 会展中心", site: "伊斯坦布尔", siteCountry: "TR", status: "confirmed",
    orbit: "2026-09-17 – 09-20", payload: "紧固件 · 紧固与连接技术", window: "4 天",
    watch: "fastenerexpoeurasia.com",
  },
  {
    id: "fe-ife-2026", date: "2026-10-07", timeUTC: "", orgId: "usa",
    vehicle: "", mission: "International Fastener Expo 2026（IFE）",
    pad: "Phoenix Convention Center", site: "凤凰城", siteCountry: "US", status: "confirmed",
    orbit: "2026-10-07 – 10-09", payload: "紧固件 · 紧固与连接技术", window: "3 天",
    watch: "fastenerexpo.com",
  },
  {
    id: "fe-poland-2026", date: "2026-10-14", timeUTC: "", orgId: "poland",
    vehicle: "Targi w Krakowie", mission: "Fastener Poland 2026",
    pad: "EXPO Kraków", site: "克拉科夫", siteCountry: "PL", status: "confirmed",
    orbit: "2026-10-14 – 10-15", payload: "紧固件 · 紧固与连接技术", window: "2 天",
    watch: "fastenerpoland.pl",
  },
];
