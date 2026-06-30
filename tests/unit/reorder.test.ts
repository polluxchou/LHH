// tests/unit/reorder.test.ts
import { describe, it, expect } from "vitest";
import { moveItem } from "@/lib/workflow/reorder";

describe("moveItem", () => {
  it("moves an item down to a later index", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
  it("moves an item up to an earlier index", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("is a no-op when from === to", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
  it("returns a new array (does not mutate input)", () => {
    const input = ["a", "b"];
    const out = moveItem(input, 0, 1);
    expect(out).not.toBe(input);
    expect(input).toEqual(["a", "b"]);
  });
  it("clamps out-of-range indices instead of producing holes", () => {
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
  });
});
