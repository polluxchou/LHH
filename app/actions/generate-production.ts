"use server";

import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import type { ProductionPackage } from "@/lib/domain/production";
import { generateProduction } from "@/lib/production/deepseek-script";
import { recordUsage } from "@/lib/usage/record";

export type GenerateProductionResult =
  | { ok: true; pkg: ProductionPackage }
  | { ok: false; reason: string };

export async function generateProductionAction(input: {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  /** 用户在工作室选定的目标时长(如 "3 min");缺省回退到选题卡 formatLabel。 */
  targetDuration?: string;
  /** 当前空间/用户，用于把 token 成本归属到正确的空间(缺省则落 null)。 */
  spaceId?: string | null;
  userId?: string | null;
}): Promise<GenerateProductionResult> {
  try {
    const pkg = await generateProduction(
      {
        brief: input.brief,
        topicCard: input.topicCard,
        targetDuration: input.targetDuration,
      },
      (e) => void recordUsage({ ...e, operation: "production", spaceId: input.spaceId, userId: input.userId }),
    );
    return { ok: true, pkg };
  } catch (err) {
    // 脱敏:只回传简短原因,不泄露 key/堆栈
    const reason = err instanceof Error ? err.message : "生成失败";
    return { ok: false, reason };
  }
}
