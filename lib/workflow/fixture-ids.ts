import { createHash } from "node:crypto";

/**
 * Fixed namespace for deriving stable UUIDs from fixture string ids (e.g. "stoke",
 * "s-stk-03", "b-stk-01"). Server-side only (uses node:crypto) — called by the
 * fixtures→DB migration and the server-side space-state build, so DB rows and the
 * in-memory editorial overlay compute the SAME uuid for a given fixture entity.
 */
const FIXTURE_NAMESPACE = "7d4e5c6b-1a2f-4b3c-8d9e-0a1b2c3d4e5f";

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

/** Deterministic RFC-4122 v5 UUID from a fixture id. Stable across runs/environments. */
export function fid(originalId: string): string {
  const hash = createHash("sha1");
  hash.update(uuidToBytes(FIXTURE_NAMESPACE));
  hash.update(Buffer.from(originalId, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Map an array of fixture ids through fid(). */
export function fids(ids: readonly string[]): string[] {
  return ids.map(fid);
}
