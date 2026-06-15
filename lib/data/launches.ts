import type { Launch, LaunchOrg } from "@/lib/domain/types";

// 发射窗口期 · 拟真演示数据（ported from the Claude Design handoff bundle）
// 与其余 fixtures 共用同一个演示「今天」。

export const LAUNCH_SIM_TODAY = "2026-06-10";

export const launchOrgs: Record<string, LaunchOrg> = {
  spacex: { name: "SpaceX", short: "SpX", color: "#1a8cff", country: "US", flag: "🇺🇸" },
  cnsa: { name: "CNSA / CASC", short: "中国", color: "#ff4d4f", country: "CN", flag: "🇨🇳" },
  rocketlab: { name: "Rocket Lab", short: "RKL", color: "#722ed1", country: "US", flag: "🇺🇸" },
  roscosmos: { name: "Roscosmos", short: "RKS", color: "#fa541c", country: "RU", flag: "🇷🇺" },
  isro: { name: "ISRO", short: "ISRO", color: "#fa8c16", country: "IN", flag: "🇮🇳" },
  arianespace: { name: "Arianespace", short: "ASP", color: "#2d2d5e", country: "FR", flag: "🇪🇺" },
  jaxa: { name: "JAXA", short: "JAXA", color: "#eb2f96", country: "JP", flag: "🇯🇵" },
  stoke: { name: "Stoke Space", short: "Stoke", color: "#13c2c2", country: "US", flag: "🇺🇸" },
  lanjian: { name: "蓝箭航天", short: "蓝箭", color: "#52c41a", country: "CN", flag: "🇨🇳" },
  isar: { name: "Isar Aerospace", short: "Isar", color: "#737373", country: "DE", flag: "🇩🇪" },
  ula: { name: "United Launch Alliance", short: "ULA", color: "#003a70", country: "US", flag: "🇺🇸" },
};

export const launches: Launch[] = [
  { id: "l-001", date: "2026-06-10", timeUTC: "14:32", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Starlink Group 12-8", pad: "SLC-40", site: "Cape Canaveral", siteCountry: "US", status: "confirmed", orbit: "LEO 540km · 53°", payload: "21 × Starlink V2 Mini", window: "4h", watch: "SpaceX Webcast" },
  { id: "l-002", date: "2026-06-10", timeUTC: "22:15", orgId: "cnsa", vehicle: "长征 6 号 A", mission: "吉林一号 高分 06 组", pad: "9A", site: "太原卫星发射中心", siteCountry: "CN", status: "confirmed", orbit: "SSO 535km", payload: "4 × 高分卫星", window: "2h", watch: "CCTV 直播" },
  { id: "l-003", date: "2026-06-11", timeUTC: "03:42", orgId: "spacex", vehicle: "Starship V3 (B17 + S36)", mission: "IFT-15 · 上面级商业再入演示", pad: "OLM-1", site: "Starbase", siteCountry: "US", status: "window", orbit: "亚轨道 · 上面级回收", payload: "11 × Starlink V3 测试件", window: "60min", watch: "SpaceX Webcast", trackingObjectId: "starbase" },
  { id: "l-004", date: "2026-06-11", timeUTC: "11:00", orgId: "rocketlab", vehicle: "Electron", mission: "Capella Acadia-3 · SAR 卫星", pad: "LC-1B", site: "Mahia, NZ", siteCountry: "NZ", status: "confirmed", orbit: "SSO 600km", payload: "1 × Capella SAR", window: "1h", watch: "Rocket Lab Live", trackingObjectId: "rocketlab" },
  { id: "l-005", date: "2026-06-11", timeUTC: "19:48", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Transporter-15 · 拼车", pad: "SLC-4E", site: "Vandenberg, CA", siteCountry: "US", status: "confirmed", orbit: "SSO 525km", payload: "116 × 小卫星", window: "90min", watch: "SpaceX Webcast" },
  { id: "l-006", date: "2026-06-12", timeUTC: "06:20", orgId: "roscosmos", vehicle: "联盟 2.1b", mission: "Glonass-K2 No.16", pad: "43/3", site: "Plesetsk, RU", siteCountry: "RU", status: "confirmed", orbit: "MEO 19,100km", payload: "1 × Glonass-K2", window: "30min", watch: "Roscosmos TV" },
  { id: "l-007", date: "2026-06-12", timeUTC: "15:00", orgId: "isro", vehicle: "PSLV-CA", mission: "EOS-09 · 资源观测", pad: "FLP", site: "Sriharikota", siteCountry: "IN", status: "confirmed", orbit: "SSO 528km", payload: "1 × EOS-09 + 6 副载荷", window: "15min", watch: "ISRO YT" },
  { id: "l-008", date: "2026-06-13", timeUTC: "04:11", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Starlink Group 7-32", pad: "SLC-40", site: "Cape Canaveral", siteCountry: "US", status: "confirmed", orbit: "LEO 540km · 53°", payload: "23 × Starlink V2 Mini", window: "4h", watch: "SpaceX Webcast" },
  { id: "l-009", date: "2026-06-13", timeUTC: "12:30", orgId: "cnsa", vehicle: "长征 5 号", mission: "通信卫星 中星 4A", pad: "LC-101", site: "文昌航天发射场", siteCountry: "CN", status: "window", orbit: "GTO", payload: "1 × 中星 4A", window: "4h", watch: "CCTV 直播", trackingObjectId: "cnsa" },
  { id: "l-010", date: "2026-06-14", timeUTC: "18:55", orgId: "arianespace", vehicle: "Ariane 6", mission: "Galileo L13", pad: "ELA-4", site: "Kourou, GF", siteCountry: "FR", status: "confirmed", orbit: "MEO 23,222km", payload: "2 × Galileo FOC", window: "90min", watch: "ESA WebTV" },
  { id: "l-011", date: "2026-06-15", timeUTC: "02:22", orgId: "spacex", vehicle: "Falcon Heavy", mission: "USSF-87 (机密)", pad: "LC-39A", site: "Kennedy Space Center", siteCountry: "US", status: "confirmed", orbit: "GEO direct insertion", payload: "美军侦察卫星（保密）", window: "3h", watch: "SpaceX Webcast" },
  { id: "l-012", date: "2026-06-16", timeUTC: "09:08", orgId: "cnsa", vehicle: "长征 2 号 D", mission: "试验卫星 22 号", pad: "603", site: "酒泉卫星发射中心", siteCountry: "CN", status: "confirmed", orbit: "SSO 530km", payload: "1 × 试验卫星", window: "20min", watch: "CCTV" },
  { id: "l-013", date: "2026-06-16", timeUTC: "13:30", orgId: "lanjian", vehicle: "朱雀三号", mission: "首飞 · 重复使用一级", pad: "LC-9", site: "太原卫星发射中心", siteCountry: "CN", status: "tentative", orbit: "SSO 500km", payload: "工程飞行试验载荷", window: "2h", watch: "蓝箭官方直播", trackingObjectId: "lanjian" },
  { id: "l-014", date: "2026-06-17", timeUTC: "11:14", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Crew-12 · ISS 任务", pad: "LC-39A", site: "Kennedy Space Center", siteCountry: "US", status: "confirmed", orbit: "LEO 408km · ISS", payload: '4 × Crew Dragon "Endurance"', window: "instant", watch: "NASA TV / SpaceX" },
  { id: "l-015", date: "2026-06-18", timeUTC: "20:01", orgId: "rocketlab", vehicle: "Electron", mission: "BlackSky Gen-3 第五批", pad: "LC-2", site: "Wallops, VA", siteCountry: "US", status: "confirmed", orbit: "LEO 450km", payload: "2 × BlackSky Gen-3", window: "1h", watch: "Rocket Lab Live", trackingObjectId: "rocketlab" },
  { id: "l-016", date: "2026-06-19", timeUTC: "07:00", orgId: "cnsa", vehicle: "长征 7 号 A", mission: "试验通信卫星 18 号", pad: "LC-201", site: "文昌航天发射场", siteCountry: "CN", status: "confirmed", orbit: "GTO", payload: "1 × 通信卫星", window: "2h", watch: "CCTV" },
  { id: "l-017", date: "2026-06-20", timeUTC: "15:42", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Starlink Group 12-9", pad: "SLC-40", site: "Cape Canaveral", siteCountry: "US", status: "confirmed", orbit: "LEO 540km · 53°", payload: "21 × Starlink V2 Mini", window: "4h", watch: "SpaceX Webcast" },
  { id: "l-018", date: "2026-06-22", timeUTC: "23:33", orgId: "spacex", vehicle: "Starship V3", mission: "IFT-16 · 推进剂转移演示", pad: "OLM-1", site: "Starbase", siteCountry: "US", status: "tentative", orbit: "低轨 · 推进剂转移", payload: "2 × 推进剂罐试验件", window: "60min", watch: "SpaceX Webcast", trackingObjectId: "starbase" },
  { id: "l-019", date: "2026-06-24", timeUTC: "08:25", orgId: "jaxa", vehicle: "H3-22S", mission: "GOSAT-GW · 温室气体观测", pad: "LA-Y2", site: "Tanegashima", siteCountry: "JP", status: "confirmed", orbit: "SSO 666km", payload: "1 × GOSAT-GW", window: "15min", watch: "JAXA YT" },
  { id: "l-020", date: "2026-06-24", timeUTC: "17:30", orgId: "stoke", vehicle: "Nova", mission: "首次入轨尝试 · STP 试验载荷", pad: "SLC-14", site: "Cape Canaveral", siteCountry: "US", status: "tentative", orbit: "LEO 500km · 太阳同步", payload: "工程演示 + 美军 STP 载荷", window: "90min", watch: "Stoke Live", trackingObjectId: "stoke" },
  { id: "l-021", date: "2026-06-26", timeUTC: "04:50", orgId: "cnsa", vehicle: "长征 8 号 R", mission: "千帆星座 09 批", pad: "LC-201", site: "文昌商业发射场", siteCountry: "CN", status: "confirmed", orbit: "LEO 950km", payload: "18 × 千帆卫星", window: "1h", watch: "CCTV / 文昌官方" },
  { id: "l-022", date: "2026-06-27", timeUTC: "12:00", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "CRS SpX-32 · ISS 货运", pad: "SLC-40", site: "Cape Canaveral", siteCountry: "US", status: "confirmed", orbit: "LEO · ISS", payload: "Dragon 货舱 · 实验载荷", window: "instant", watch: "NASA TV" },
  { id: "l-023", date: "2026-06-29", timeUTC: "21:08", orgId: "rocketlab", vehicle: "Neutron", mission: "首飞 · Demonstration-1", pad: "LC-3", site: "Wallops, VA", siteCountry: "US", status: "tentative", orbit: "LEO 500km", payload: "工程演示载荷 + 模拟件", window: "4h", watch: "Rocket Lab Live", trackingObjectId: "rocketlab" },
  { id: "l-024", date: "2026-06-30", timeUTC: "06:30", orgId: "isro", vehicle: "GSLV Mk III", mission: "Chandrayaan-4 · 月球采样", pad: "SLP", site: "Sriharikota", siteCountry: "IN", status: "tentative", orbit: "月球转移轨道", payload: "月球采样返回器", window: "30min", watch: "ISRO YT" },
  { id: "l-025", date: "2026-07-02", timeUTC: "14:00", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Polaris-3", pad: "LC-39A", site: "Kennedy Space Center", siteCountry: "US", status: "window", orbit: "LEO 700km", payload: "4 × Crew Dragon", window: "2h", watch: "SpaceX Webcast" },
  { id: "l-026", date: "2026-07-05", timeUTC: "10:15", orgId: "cnsa", vehicle: "长征 5B / 远征 2", mission: "嫦娥八号 · 月球南极采样", pad: "LC-101", site: "文昌航天发射场", siteCountry: "CN", status: "window", orbit: "月球转移 · 南极着陆", payload: "嫦娥八号 + 13 国国际载荷", window: "30min", watch: "CCTV 直播", trackingObjectId: "cnsa" },
  { id: "l-027", date: "2026-07-08", timeUTC: "02:30", orgId: "spacex", vehicle: "Falcon 9 Block 5", mission: "Starlink Group 7-33", pad: "SLC-4E", site: "Vandenberg, CA", siteCountry: "US", status: "confirmed", orbit: "LEO 540km · 53°", payload: "23 × Starlink V2 Mini", window: "4h", watch: "SpaceX Webcast" },
  { id: "l-028", date: "2026-07-10", timeUTC: "13:45", orgId: "isar", vehicle: "Spectrum", mission: "第三次飞行试验", pad: "AS-3", site: "Andøya, NO", siteCountry: "NO", status: "tentative", orbit: "SSO 600km", payload: "工程载荷 + 2 副载荷", window: "90min", watch: "Isar Webcast", trackingObjectId: "isar" },
  { id: "l-029", date: "2026-07-15", timeUTC: "08:45", orgId: "ula", vehicle: "Vulcan Centaur", mission: "USSF-112 · 国防载荷", pad: "SLC-41", site: "Cape Canaveral", siteCountry: "US", status: "tentative", orbit: "GEO", payload: "美军侦察 + 通信", window: "2h", watch: "ULA Webcast" },
  { id: "l-030", date: "2026-07-20", timeUTC: "11:11", orgId: "spacex", vehicle: "Starship V3", mission: "IFT-17 · Starlink V3 部署批量", pad: "OLM-2", site: "Starbase", siteCountry: "US", status: "tentative", orbit: "LEO 540km", payload: "60 × Starlink V3", window: "60min", watch: "SpaceX Webcast", trackingObjectId: "starbase" },
];

/** Days from the demo "today" to the launch date (0 = today, negative = past). */
export function launchDayDiff(date: string): number {
  return Math.round((new Date(date).getTime() - new Date(LAUNCH_SIM_TODAY).getTime()) / 86_400_000);
}

/** Number of launches within the next N days (inclusive), counting from the demo today. */
export function countUpcomingLaunches(days: number): number {
  return launches.filter((launch) => {
    const diff = launchDayDiff(launch.date);

    return diff >= 0 && diff <= days;
  }).length;
}
