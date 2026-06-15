import { describe, expect, it } from "vitest";
import { buildViewSwitcherItems } from "@/lib/navigation/view-switcher";
import { getWorkbenchChrome } from "@/lib/i18n/workbench-copy";
import { countUpcomingLaunches } from "@/lib/data/launches";

describe("view switcher navigation", () => {
  it("builds the Chinese top view menu with routes for all six views", () => {
    const items = buildViewSwitcherItems({
      chrome: getWorkbenchChrome("zh"),
      prefix: "/zh",
      badges: { brief: 4, pool: 4, launch: countUpcomingLaunches(7) },
      locale: "zh",
    });

    expect(items.map((item) => item.label)).toEqual([
      "工作台",
      "追踪对象",
      "编辑简报",
      "选题池",
      "情报地图",
      "发射日程",
    ]);
    expect(items.map((item) => item.href)).toEqual([
      "/zh",
      "/zh/tracking-objects",
      "/zh/briefs",
      "/zh/topic-pool",
      "/zh/map",
      "/zh/launches",
    ]);
    expect(items.at(-1)).toMatchObject({ badge: countUpcomingLaunches(7) });
    expect(items.every((item) => !item.disabled)).toBe(true);
  });

  it("counts launches inside the demo 7-day window", () => {
    expect(countUpcomingLaunches(7)).toBeGreaterThan(0);
    expect(countUpcomingLaunches(7)).toBeLessThanOrEqual(countUpcomingLaunches(30));
  });
});
