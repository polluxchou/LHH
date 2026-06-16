import { describe, expect, it } from "vitest";
import { getCopy, supportedLocales } from "@/lib/i18n/copy";
import { getWorkbenchChrome } from "@/lib/i18n/workbench-copy";
import { getAccountCopy } from "@/lib/i18n/account-copy";

// Han (Chinese) ideographs — used to catch untranslated Chinese leaking into the
// English UI dictionary. Uses the Unicode script property so emoji and symbols
// (e.g. 🗑, ↻, ✓) are not falsely flagged.
const CJK = /\p{Script=Han}/u;

/** All string-leaf [path, value] pairs in a dictionary (functions/numbers skipped). */
function stringLeaves(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => stringLeaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Every key path in a dictionary, including function/number leaves. */
function keyPaths(value: unknown, path = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => keyPaths(v, path ? `${path}.${k}` : k));
  }
  return [path];
}

describe("interface copy", () => {
  it("exposes the chrome + account namespaces per locale", () => {
    expect(getCopy("zh").shell.navTracking).toBe("追踪对象");
    expect(getCopy("zh").shell.navTopicPool).toBe("选题库");
    expect(getCopy("zh").account.noSpaceTitle).toBe("还没有空间");
    expect(getCopy("en").shell.navTracking).toBe("Tracked");
  });

  it("falls back to English copy for unknown locales", () => {
    expect(getCopy("unknown").shell.navTracking).toBe("Tracked");
  });

  it("keeps the legacy chrome/account accessors reading the single dictionary", () => {
    expect(getWorkbenchChrome("zh").pipelineOnline).toBe("信息源");
    expect(getWorkbenchChrome("en").pipelineOnline).toBe("Sources");
    expect(getWorkbenchChrome("en").brandSub).toBe("v0.4");
    expect(getWorkbenchChrome("zh").navMap).toBe("情报地图");
    expect(getAccountCopy("en").signOut).toBe("Sign out");
    expect(getAccountCopy("zh").signOut).toBe("登出");
  });

  // ── drift guards ──────────────────────────────────────────────
  // Prevent the v2 "选题库/选题池" class of regression from recurring.

  it("keeps the en and zh key sets identical (no missing translations)", () => {
    for (const locale of supportedLocales) {
      expect(keyPaths(getCopy(locale)).sort()).toEqual(keyPaths(getCopy("en")).sort());
    }
  });

  it("never leaks CJK characters into the English UI copy", () => {
    const offenders = stringLeaves(getCopy("en")).filter(([, value]) => CJK.test(value));
    expect(offenders).toEqual([]);
  });
});
