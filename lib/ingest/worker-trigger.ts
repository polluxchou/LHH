/** 共享:ingest 端点鉴权(INGEST_SECRET / CRON_SECRET,Bearer)。 */
export function authorizeIngest(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (!!ingest && auth === `Bearer ${ingest}`) || (!!cron && auth === `Bearer ${cron}`);
}

/**
 * fire-and-forget 踢 count 次 worker(/api/ingest/worker)。
 *
 * 需要 `NEXT_PUBLIC_SITE_URL` 拼绝对 URL —— Node/edge 的 fetch 不接受相对路径。
 * 缺失时**不静默假成功**:不发请求、返回实际触发数 0、并告警。调用方应把返回值如实
 * 反映给调用者(而非乐观地报 count),否则会出现"以为踢了其实没踢"。
 */
export function kickWorkers(count: number): number {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const secret = process.env.INGEST_SECRET ?? "";
  if (!base) {
    console.warn("[ingest] NEXT_PUBLIC_SITE_URL 未配置,无法触发 worker 链(fetch 需绝对 URL);本次未踢任何 worker");
    return 0;
  }
  for (let i = 0; i < count; i++) {
    void fetch(`${base}/api/ingest/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }
  return count;
}
