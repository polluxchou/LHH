import { describe, it, expect } from "vitest";
import { enqueueDailyJobs, type JobStore, type IngestJob } from "@/lib/ingest/jobs";

/** 内存版 JobStore,用于单测队列逻辑。 */
function makeFakeStore(opts?: { objects?: { id: string; space_id: string }[] }): JobStore & { jobs: IngestJob[] } {
  const objects = opts?.objects ?? [{ id: "o1", space_id: "s1" }, { id: "o2", space_id: "s1" }];
  const jobs: IngestJob[] = [];
  let seq = 0;
  return {
    jobs,
    async listTrackingObjects() {
      return objects;
    },
    async insertJobsIgnoreDup(rows) {
      let inserted = 0;
      for (const r of rows) {
        if (jobs.some((j) => j.tracking_object_id === r.tracking_object_id && j.run_date === r.run_date)) continue;
        jobs.push({ id: `j${++seq}`, tracking_object_id: r.tracking_object_id, space_id: r.space_id, run_date: r.run_date, status: "pending", attempts: 0 });
        inserted += 1;
      }
      return inserted;
    },
    async selectOnePending(runDate, maxAttempts) {
      return jobs.find((j) => j.status === "pending" && j.run_date === runDate && j.attempts < maxAttempts) ?? null;
    },
    async tryClaim(id, currentAttempts) {
      const j = jobs.find((x) => x.id === id);
      if (!j || j.status !== "pending") return null;
      j.status = "running";
      j.attempts = currentAttempts + 1;
      return { ...j };
    },
    async setStatus(id, patch) {
      const j = jobs.find((x) => x.id === id);
      if (j) Object.assign(j, patch);
    },
    async countPending(runDate, maxAttempts) {
      return jobs.filter((j) => j.status === "pending" && j.run_date === runDate && j.attempts < maxAttempts).length;
    },
  };
}

describe("enqueueDailyJobs", () => {
  it("每个对象入队一条 pending", async () => {
    const store = makeFakeStore();
    const n = await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    expect(n).toBe(2);
    expect(store.jobs.filter((j) => j.status === "pending")).toHaveLength(2);
    expect(store.jobs[0].space_id).toBe("s1");
  });
  it("重复入队幂等(同 run_date 不重复插)", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const n2 = await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    expect(n2).toBe(0);
    expect(store.jobs).toHaveLength(2);
  });
});

export { makeFakeStore };
