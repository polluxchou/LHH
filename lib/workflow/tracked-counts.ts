import type { TeamMember, TrackingObject } from "@/lib/domain/types";

export function getTrackedCountRatio(trackingObjects: TrackingObject[], member: TeamMember): string {
  const subscribedCount = trackingObjects.filter((object) => member.trackingObjectIds.includes(object.id)).length;

  return `${subscribedCount}/${trackingObjects.length}`;
}

export function getTrackedRailLabel(trackingObjects: TrackingObject[], member: TeamMember): string {
  return `追踪对象 ${getTrackedCountRatio(trackingObjects, member)}`;
}

export function getTrackedAbbreviation(trackingObject: TrackingObject): string {
  const label = trackingObject.nameZh ?? trackingObject.name;
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];

  if (/^[A-Za-z0-9]/.test(label) && words.length > 0) {
    const primaryWord = words[0] ?? "";

    if (label.includes("/") && primaryWord.length > 1) {
      return primaryWord.slice(0, 2).toUpperCase();
    }

    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }

  const chineseChars = label.match(/[\u4e00-\u9fff]/g);

  if (chineseChars?.length) {
    return chineseChars.slice(0, 2).join("");
  }

  return label.slice(0, 2).toUpperCase();
}
