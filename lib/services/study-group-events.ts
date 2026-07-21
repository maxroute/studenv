import { emitStudyGroupSocketEvent } from "@/lib/realtime/study-group-socket-server";
import type { StudyGroupMessageRecord } from "@/types";

export function publishStudyGroupUpdate(groupId: string) {
  emitStudyGroupSocketEvent(groupId, "group:update", {
    groupId,
    at: new Date().toISOString(),
  });
}

export function publishStudyGroupMessage(groupId: string, message: StudyGroupMessageRecord) {
  emitStudyGroupSocketEvent(groupId, "group:message", {
    groupId,
    message,
  });
}
