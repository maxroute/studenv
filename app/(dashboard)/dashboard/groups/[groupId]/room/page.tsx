"use client";

import StudyRoomClient from "@/components/study/study-room-client";

export default function StudyRoomPage({
  params,
}: {
  params: { groupId: string };
}) {
  return <StudyRoomClient groupId={params.groupId} />;
}
