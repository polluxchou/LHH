import { describe, it, expect } from "vitest";
import { computeDedupeKey } from "@/lib/db/ingest-writer";

describe("computeDedupeKey", () => {
  it("is independent of url order", () => {
    const a = computeDedupeKey("2026-06-14", ["https://x/1", "https://x/2"]);
    const b = computeDedupeKey("2026-06-14", ["https://x/2", "https://x/1"]);
    expect(a).toBe(b);
  });

  it("ignores tracking params via canonicalization", () => {
    const a = computeDedupeKey("2026-06-14", ["https://x/1"]);
    const b = computeDedupeKey("2026-06-14", ["https://x/1?utm=abc"]);
    expect(a).toBe(b);
  });

  it("differs when the url set differs", () => {
    const a = computeDedupeKey("2026-06-14", ["https://x/1"]);
    const b = computeDedupeKey("2026-06-14", ["https://x/1", "https://x/2"]);
    expect(a).not.toBe(b);
  });

  it("differs when the event date differs", () => {
    const a = computeDedupeKey("2026-06-14", ["https://x/1"]);
    const b = computeDedupeKey("2026-06-15", ["https://x/1"]);
    expect(a).not.toBe(b);
  });

  it("handles a null event date", () => {
    expect(computeDedupeKey(null, ["https://x/1"])).toMatch(/^[a-f0-9]{40}$/);
  });
});
