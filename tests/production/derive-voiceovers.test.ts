import { describe, it, expect } from "vitest";
import { deriveVoiceOvers, splitSentences } from "@/lib/production/derive-voiceovers";
import type { ProductionScript, StoryboardShot } from "@/lib/domain/production";

const NONE = "（无）";

function script(...bodies: string[]): ProductionScript {
  return {
    targetDuration: "1 min",
    wordCount: bodies.join("").length,
    sections: bodies.map((body, i) => ({ id: `s${i}`, label: `L${i}`, duration: "", body })),
  };
}

function shot(n: number, time: string, silent = false): StoryboardShot {
  return { n, time, shot: "x", voiceOver: "OLD", visual: "v", notes: "", silent };
}

describe("splitSentences", () => {
  it("splits on Chinese terminators and keeps them", () => {
    expect(splitSentences("甲。乙！丙？")).toEqual(["甲。", "乙！", "丙？"]);
  });
  it("returns [] for empty/whitespace", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("deriveVoiceOvers", () => {
  it("concatenation of assigned chunks equals the script", () => {
    const sc = script("甲。乙。", "丙。丁。");
    const shots = [shot(1, "0:00-0:06", true), shot(2, "0:06-0:12"), shot(3, "0:12-0:24")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    const assigned = out.filter((v) => v !== NONE).join("");
    expect(assigned).toBe("甲。乙。丙。丁。");
  });

  it("silent shots get the none label and no text", () => {
    const sc = script("甲。乙。");
    const shots = [shot(1, "0:00-0:06", true), shot(2, "0:06-0:12")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out[0]).toBe(NONE);
    expect(out[1]).toBe("甲。乙。");
  });

  it("longer shots get more sentences (time-proportional)", () => {
    const sc = script("甲。乙。丙。丁。");
    const shots = [shot(1, "0:00-0:04"), shot(2, "0:04-0:24")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out[0].length).toBeLessThan(out[1].length);
    expect(out.join("")).toBe("甲。乙。丙。丁。");
  });

  it("never cuts mid-sentence", () => {
    const sc = script("这是一句很长的话。短。");
    const shots = [shot(1, "0:00-0:01"), shot(2, "0:01-0:30")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    for (const v of out) {
      if (v !== NONE && v !== "") expect(/[。！？；\n]$/.test(v)).toBe(true);
    }
  });

  it("more non-silent shots than sentences: extra shots get none label", () => {
    const sc = script("只有一句。");
    const shots = [shot(1, "0:00-0:06"), shot(2, "0:06-0:12"), shot(3, "0:12-0:18")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out.filter((v) => v !== NONE).join("")).toBe("只有一句。");
    expect(out.filter((v) => v === NONE).length).toBe(2);
  });

  it("empty script: all shots get none label", () => {
    const out = deriveVoiceOvers(script(""), [shot(1, "0:00-0:06"), shot(2, "0:06-0:12")], NONE);
    expect(out).toEqual([NONE, NONE]);
  });

  it("unparseable times fall back to equal weight", () => {
    const sc = script("甲。乙。丙。丁。");
    const shots = [shot(1, "??"), shot(2, "??")];
    const out = deriveVoiceOvers(sc, shots, NONE);
    expect(out.join("")).toBe("甲。乙。丙。丁。");
    expect(out[0]).not.toBe(NONE);
    expect(out[1]).not.toBe(NONE);
  });
});
