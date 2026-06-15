import { describe, it, expect } from "vitest";
import { enqueueDailyJobs, claimNextJob, completeJob, failJob, type JobStore, type IngestJob } from "@/lib/ingest/jobs";

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

describe("claimNextJob", () => {
  it("领取一条 pending → 置 running、attempts+1", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 });
    expect(job).not.toBeNull();
    expect(job!.status).toBe("running");
    expect(job!.attempts).toBe(1);
  });
  it("无 pending → null", async () => {
    const store = makeFakeStore({ objects: [] });
    expect(await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 })).toBeNull();
  });
  it("竞态:selectOnePending 选中但被抢(tryClaim 返回 null)→ 跳过该条取下一条", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    let firstCall = true;
    const orig = store.tryClaim.bind(store);
    store.tryClaim = async (id, currentAttempts) => {
      if (firstCall) { firstCall = false; return null; } // 第一条被抢
      return orig(id, currentAttempts);
    };
    const job = await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 });
    expect(job).not.toBeNull();
    expect(job!.status).toBe("running");
  });
});

describe("completeJob / failJob", () => {
  it("completeJob → done + wrote", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = (await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!;
    await completeJob(store, job, { wrote: true });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("done");
  });
  it("failJob:attempts < max → 置回 pending(可重试)", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = (await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!; // attempts=1
    await failJob(store, job, { error: "gemini timeout", maxAttempts: 3 });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("pending");
  });
  it("failJob:attempts >= max → failed", async () => {
    const store = makeFakeStore();
    await enqueueDailyJobs(store, { runDate: "2026-06-15" });
    const job = { ...(await claimNextJob(store, { runDate: "2026-06-15", maxAttempts: 3 }))!, attempts: 3 };
    await failJob(store, job, { error: "boom", maxAttempts: 3 });
    const after = store.jobs.find((j) => j.id === job.id)!;
    expect(after.status).toBe("failed");
  });
});
