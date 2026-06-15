import { describe, expect, it } from "vitest";
import { canDeleteTrackingObject } from "@/lib/workflow/can-delete-tracking-object";

describe("canDeleteTrackingObject", () => {
  it("lets the creator delete their own object", () => {
    expect(canDeleteTrackingObject({ createdBy: "u1", userId: "u1", role: "member", isOwner: false })).toBe(true);
  });

  it("lets a space admin delete any object", () => {
    expect(canDeleteTrackingObject({ createdBy: "u2", userId: "u1", role: "admin", isOwner: false })).toBe(true);
  });

  it("lets the space owner delete any object", () => {
    expect(canDeleteTrackingObject({ createdBy: "u2", userId: "u1", role: "member", isOwner: true })).toBe(true);
  });

  it("forbids an unrelated member from deleting someone else's object", () => {
    expect(canDeleteTrackingObject({ createdBy: "u2", userId: "u1", role: "member", isOwner: false })).toBe(false);
  });

  it("forbids deleting an object with no recorded creator (seeded/demo data)", () => {
    expect(canDeleteTrackingObject({ createdBy: null, userId: "u1", role: "member", isOwner: false })).toBe(false);
    expect(canDeleteTrackingObject({ createdBy: undefined, userId: "u1", role: "member", isOwner: false })).toBe(false);
  });

  it("forbids when there is no current user even if createdBy is null", () => {
    expect(canDeleteTrackingObject({ createdBy: null, userId: null, role: "member", isOwner: false })).toBe(false);
  });

  it("does not treat two null ids as a match", () => {
    expect(canDeleteTrackingObject({ createdBy: null, userId: null, role: "member", isOwner: false })).toBe(false);
  });
});
