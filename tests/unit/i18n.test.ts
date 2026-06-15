import { describe, expect, it } from "vitest";
import { getCopy } from "@/lib/i18n/copy";
import { getWorkbenchChrome } from "@/lib/i18n/workbench-copy";

describe("interface copy", () => {
  it("provides Chinese navigation and workbench labels", () => {
    const copy = getCopy("zh");

    expect(copy.nav.tracking).toBe("追踪对象");
    expect(copy.workbench.phaseLabel).toBe("Phase 3 加固演示");
    expect(copy.workbench.runSearch).toBe("运行模拟日更搜索");
  });

  it("falls back to English copy for unknown locales", () => {
    expect(getCopy("unknown").nav.tracking).toBe("Tracking");
  });

  it("labels the top-nav source status as an information source", () => {
    expect(getWorkbenchChrome("zh").pipelineOnline).toBe("信息源");
    expect(getWorkbenchChrome("en").pipelineOnline).toBe("Sources");
  });

  it("keeps the top-nav brand subtitle to the version only", () => {
    expect(getWorkbenchChrome("zh").brandSub).toBe("v0.4");
    expect(getWorkbenchChrome("en").brandSub).toBe("v0.4");
  });

  it("labels the Chinese map menu as intelligence map", () => {
    expect(getWorkbenchChrome("zh").navMap).toBe("情报地图");
  });
});
