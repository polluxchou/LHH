import { describe, expect, it } from "vitest";
import { fid, fids } from "@/lib/workflow/fixture-ids";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("fid (deterministic uuid v5 from fixture id)", () => {
  it("produces a valid v5 UUID", () => {
    expect(fid("stoke")).toMatch(UUID_RE);
    expect(fid("s-stk-03")).toMatch(UUID_RE);
  });

  it("is deterministic — same input, same output", () => {
    expect(fid("starbase")).toBe(fid("starbase"));
  });

  it("is collision-free across distinct fixture ids", () => {
    const ids = ["stoke", "starbase", "rocketlab", "cnsa", "s-stk-03", "b-stk-01", "src-spacenews"];
    const out = new Set(ids.map(fid));
    expect(out.size).toBe(ids.length);
  });

  it("fids() maps arrays element-wise", () => {
    expect(fids(["a", "b"])).toEqual([fid("a"), fid("b")]);
  });
});
