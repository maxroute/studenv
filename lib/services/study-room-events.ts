type StudyRoomSubscriber = () => void;

import { emitStudyRoomSocketEvent } from "@/lib/realtime/study-room-socket-server";

const subscribersByGroup = new Map<string, Set<StudyRoomSubscriber>>();

export function publishStudyRoomEvent(
  groupId: string,
  payload: {
    payloadType?: "state" | "presence";
    actorUserId?: string;
    updatedAt?: string;
  } = {},
) {
  const subscribers = subscribersByGroup.get(groupId);
  if (!subscribers) {
    emitStudyRoomSocketEvent(groupId, "room:update", {
      groupId,
      at: new Date().toISOString(),
      payloadType: payload.payloadType ?? "state",
      actorUserId: payload.actorUserId ?? null,
      updatedAt: payload.updatedAt ?? null,
    });
    return;
  }

  for (const subscriber of subscribers) {
    subscriber();
  }

  emitStudyRoomSocketEvent(groupId, "room:update", {
    groupId,
    at: new Date().toISOString(),
    payloadType: payload.payloadType ?? "state",
    actorUserId: payload.actorUserId ?? null,
    updatedAt: payload.updatedAt ?? null,
  });
}

export function publishStudyRoomPresenceEvent(input: {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  status: "active" | "focused" | "away";
  updatedAt: string;
}) {
  emitStudyRoomSocketEvent(input.groupId, "room:presence", input);
}

export function subscribeToStudyRoomEvent(
  groupId: string,
  subscriber: StudyRoomSubscriber,
) {
  const subscribers = subscribersByGroup.get(groupId) ?? new Set<StudyRoomSubscriber>();
  subscribers.add(subscriber);
  subscribersByGroup.set(groupId, subscribers);

  return () => {
    const current = subscribersByGroup.get(groupId);
    if (!current) {
      return;
    }

    current.delete(subscriber);
    if (current.size === 0) {
      subscribersByGroup.delete(groupId);
    }
  };
}
