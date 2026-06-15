"use server";

import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import type { ProductionPackage } from "@/lib/domain/production";
import { generateProduction } from "@/lib/production/deepseek-script";

export type GenerateProductionResult =
  | { ok: true; pkg: ProductionPackage }
  | { ok: false; reason: string };

export async function generateProductionAction(input: {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
}): Promise<GenerateProductionResult> {
  try {
    const pkg = await generateProduction({ brief: input.brief, topicCard: input.topicCard });
    return { ok: true, pkg };
  } catch (err) {
    // 脱敏:只回传简短原因,不泄露 key/堆栈
    const reason = err instanceof Error ? err.message : "生成失败";
    return { ok: false, reason };
  }
}
