import { describe, expect, it } from "vitest";
import { resolveInitialSpaceId } from "@/lib/account/resolve-space";

const SPACES = ["space-a", "space-b", "space-c"];

describe("resolveInitialSpaceId", () => {
  it("prefers an explicit choice when it is a member space", () => {
    expect(resolveInitialSpaceId({ explicit: "space-b", cookie: "space-c" }, SPACES)).toBe("space-b");
  });

  it("falls back to the persisted cookie when no explicit choice is given", () => {
    expect(resolveInitialSpaceId({ cookie: "space-c" }, SPACES)).toBe("space-c");
  });

  it("does NOT snap back to the first space when a valid space is persisted", () => {
    // This is the regression: switching views must not bump the user to mySpaces[0].
    expect(resolveInitialSpaceId({ cookie: "space-c" }, SPACES)).not.toBe("space-a");
  });

  it("ignores a stale cookie that is no longer a member space", () => {
    expect(resolveInitialSpaceId({ cookie: "left-this-space" }, SPACES)).toBe("space-a");
  });

  it("ignores an explicit id that is not a member space and uses the cookie", () => {
    expect(resolveInitialSpaceId({ explicit: "bogus", cookie: "space-b" }, SPACES)).toBe("space-b");
  });

  it("defaults to the first space when nothing is provided", () => {
    expect(resolveInitialSpaceId({}, SPACES)).toBe("space-a");
  });

  it("returns null when the user has no spaces", () => {
    expect(resolveInitialSpaceId({ explicit: "x", cookie: "y" }, [])).toBeNull();
  });
});
