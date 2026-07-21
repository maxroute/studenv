import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { readStudyRoomSocketToken } from "@/lib/realtime/study-room-socket-auth";

type StudyRoomSocketAuth = {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
};

type StudyRoomCallParticipant = {
  socketId: string;
  userId: string;
  name: string | null;
  username: string | null;
  isInCall: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  sessionMode: "conference" | "stream_host" | "stream_viewer" | null;
  isScreenSharing: boolean;
};

type StudyRoomPresenceParticipant = {
  userId: string;
  name: string | null;
  username: string | null;
  status: "active";
  updatedAt: string;
};

type StudyRoomSocket = Socket<any, any, any, { auth: StudyRoomSocketAuth }>;

const roomParticipants = new Map<string, Map<string, StudyRoomCallParticipant>>();

let io: SocketIOServer | null = null;

function getRoomChannel(groupId: string) {
  return `study-room:${groupId}`;
}

function getRoomParticipantSnapshot(groupId: string) {
  return Array.from(roomParticipants.get(groupId)?.values() ?? []).sort((left, right) =>
    left.socketId.localeCompare(right.socketId),
  );
}

function getRoomPresenceSnapshot(groupId: string): StudyRoomPresenceParticipant[] {
  const deduped = new Map<string, StudyRoomPresenceParticipant>();
  for (const participant of roomParticipants.get(groupId)?.values() ?? []) {
    if (deduped.has(participant.userId)) {
      continue;
    }

    deduped.set(participant.userId, {
      userId: participant.userId,
      name: participant.name,
      username: participant.username,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
  }

  return Array.from(deduped.values()).sort((left, right) => left.userId.localeCompare(right.userId));
}

function emitRoomParticipants(groupId: string) {
  io?.to(getRoomChannel(groupId)).emit("room:participants", {
    groupId,
    participants: getRoomParticipantSnapshot(groupId),
  });
}

function ensureRoomParticipant(groupId: string, auth: StudyRoomSocketAuth, socketId: string) {
  const room = roomParticipants.get(groupId) ?? new Map<string, StudyRoomCallParticipant>();
  const existing = room.get(socketId);
  const participant: StudyRoomCallParticipant = existing ?? {
    socketId,
    userId: auth.userId,
    name: auth.name,
    username: auth.username,
    isInCall: false,
    audioEnabled: false,
    videoEnabled: false,
    sessionMode: null,
    isScreenSharing: false,
  };
  room.set(socketId, participant);
  roomParticipants.set(groupId, room);
  return participant;
}

function removeRoomParticipant(groupId: string, socketId: string) {
  const room = roomParticipants.get(groupId);
  if (!room) {
    return;
  }

  room.delete(socketId);
  if (room.size === 0) {
    roomParticipants.delete(groupId);
    return;
  }

  roomParticipants.set(groupId, room);
}

function bindStudyRoomSocket(socket: StudyRoomSocket) {
  const groupId = socket.data.auth.groupId;
  const roomChannel = getRoomChannel(groupId);
  ensureRoomParticipant(groupId, socket.data.auth, socket.id);
  socket.join(roomChannel);
  socket.emit("room:connected", {
    groupId,
    socketId: socket.id,
    userId: socket.data.auth.userId,
  });
  socket.emit("room:presence-snapshot", {
    groupId,
    participants: getRoomPresenceSnapshot(groupId),
  });
  emitRoomParticipants(groupId);

  socket.on("room:ping", () => {
    socket.emit("room:pong", { at: new Date().toISOString() });
  });

  socket.on(
    "call:join",
    (
      payload:
        | {
            audioEnabled?: boolean;
            videoEnabled?: boolean;
            sessionMode?: "conference" | "stream_host" | "stream_viewer";
          }
        | undefined,
    ) => {
      const participant = ensureRoomParticipant(groupId, socket.data.auth, socket.id);
      participant.isInCall = true;
      participant.audioEnabled = Boolean(payload?.audioEnabled);
      participant.videoEnabled = Boolean(payload?.videoEnabled);
      participant.sessionMode = payload?.sessionMode ?? "conference";
      participant.isScreenSharing = Boolean((payload as any)?.isScreenSharing);
      socket.to(roomChannel).emit("call:participant-joined", {
        participant,
      });
      emitRoomParticipants(groupId);
    },
  );

  socket.on(
    "call:update-media",
    (payload: { audioEnabled?: boolean; videoEnabled?: boolean } | undefined) => {
      const participant = ensureRoomParticipant(groupId, socket.data.auth, socket.id);
      participant.audioEnabled = Boolean(payload?.audioEnabled);
      participant.videoEnabled = Boolean(payload?.videoEnabled);
      if (payload && "isScreenSharing" in payload) {
        participant.isScreenSharing = Boolean((payload as any).isScreenSharing);
      }
      emitRoomParticipants(groupId);
    },
  );

  socket.on(
    "call:update-session",
    (
      payload:
        | {
            sessionMode?: "conference" | "stream_host" | "stream_viewer" | null;
            audioEnabled?: boolean;
            videoEnabled?: boolean;
          }
        | undefined,
    ) => {
      const participant = ensureRoomParticipant(groupId, socket.data.auth, socket.id);
      participant.sessionMode = payload?.sessionMode ?? null;
      participant.audioEnabled = Boolean(payload?.audioEnabled);
      participant.videoEnabled = Boolean(payload?.videoEnabled);
      participant.isInCall = Boolean(participant.sessionMode);
      if (payload && "isScreenSharing" in payload) {
        participant.isScreenSharing = Boolean((payload as any).isScreenSharing);
      }
      socket.to(roomChannel).emit("call:participant-joined", {
        participant,
      });
      emitRoomParticipants(groupId);
    },
  );

  socket.on(
    "webrtc:signal",
    (
      payload:
        | {
            targetSocketId?: string;
            description?: RTCSessionDescriptionInit;
            candidate?: RTCIceCandidateInit;
          }
        | undefined,
    ) => {
      if (!payload?.targetSocketId) {
        return;
      }

      io?.to(payload.targetSocketId).emit("webrtc:signal", {
        sourceSocketId: socket.id,
        description: payload.description ?? null,
        candidate: payload.candidate ?? null,
      });
    },
  );

  socket.on("call:leave", () => {
    const participant = ensureRoomParticipant(groupId, socket.data.auth, socket.id);
    participant.isInCall = false;
    participant.audioEnabled = false;
    participant.videoEnabled = false;
    participant.sessionMode = null;
    socket.to(roomChannel).emit("call:participant-left", {
      socketId: socket.id,
      userId: socket.data.auth.userId,
    });
    emitRoomParticipants(groupId);
  });

  socket.on("disconnect", () => {
    const participant = roomParticipants.get(groupId)?.get(socket.id);
    removeRoomParticipant(groupId, socket.id);
    if (participant?.isInCall) {
      socket.to(roomChannel).emit("call:participant-left", {
        socketId: socket.id,
        userId: socket.data.auth.userId,
      });
    }
    emitRoomParticipants(groupId);
  });
}

export function attachStudyRoomSocketServer(server: HttpServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    path: "/api/study-room/socket/io",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const queryToken =
      typeof socket.handshake.query?.token === "string"
        ? socket.handshake.query.token
        : null;
    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : queryToken;
    if (!token) {
      next(new Error("Missing study room socket token."));
      return;
    }

    const auth = readStudyRoomSocketToken(token);
    if (!auth) {
      next(new Error("Study room socket token is invalid or expired."));
      return;
    }

    socket.data.auth = auth;
    next();
  });

  io.on("connection", (socket) => {
    bindStudyRoomSocket(socket as StudyRoomSocket);
  });

  return io;
}

export function emitStudyRoomSocketEvent(groupId: string, event: string, payload: unknown) {
  io?.to(getRoomChannel(groupId)).emit(event, payload);
}
