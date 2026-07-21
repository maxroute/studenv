import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { readStudyGroupSocketToken } from "@/lib/realtime/study-group-socket-auth";

type StudyGroupSocketAuth = {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
};

type StudyGroupPresenceParticipant = {
  socketId: string;
  userId: string;
  name: string | null;
  username: string | null;
};

type StudyGroupSocket = Socket<any, any, any, { auth: StudyGroupSocketAuth }>;

const groupParticipants = new Map<string, Map<string, StudyGroupPresenceParticipant>>();

let io: SocketIOServer | null = null;

function getGroupChannel(groupId: string) {
  return `study-group:${groupId}`;
}

function getGroupNamespace() {
  return io?.of("/study-groups") ?? null;
}

function getGroupPresenceSnapshot(groupId: string) {
  const uniqueUsers = new Map<string, StudyGroupPresenceParticipant>();

  for (const participant of groupParticipants.get(groupId)?.values() ?? []) {
    if (!uniqueUsers.has(participant.userId)) {
      uniqueUsers.set(participant.userId, participant);
    }
  }

  return Array.from(uniqueUsers.values()).sort((left, right) =>
    (left.name || left.username || left.userId).localeCompare(
      right.name || right.username || right.userId,
    ),
  );
}

export function getStudyGroupPresenceSnapshot(groupId: string) {
  return getGroupPresenceSnapshot(groupId);
}

function emitGroupPresence(groupId: string) {
  getGroupNamespace()?.to(getGroupChannel(groupId)).emit("group:presence", {
    groupId,
    participants: getGroupPresenceSnapshot(groupId),
  });
}

function ensureGroupParticipant(groupId: string, auth: StudyGroupSocketAuth, socketId: string) {
  const group = groupParticipants.get(groupId) ?? new Map<string, StudyGroupPresenceParticipant>();
  const participant: StudyGroupPresenceParticipant = {
    socketId,
    userId: auth.userId,
    name: auth.name,
    username: auth.username,
  };
  group.set(socketId, participant);
  groupParticipants.set(groupId, group);
}

function removeGroupParticipant(groupId: string, socketId: string) {
  const group = groupParticipants.get(groupId);
  if (!group) {
    return;
  }

  group.delete(socketId);
  if (group.size === 0) {
    groupParticipants.delete(groupId);
    return;
  }

  groupParticipants.set(groupId, group);
}

async function bindStudyGroupSocket(socket: StudyGroupSocket) {
  const groupId = socket.data.auth.groupId;
  const groupChannel = getGroupChannel(groupId);
  ensureGroupParticipant(groupId, socket.data.auth, socket.id);
  await socket.join(groupChannel);
  const snapshot = getGroupPresenceSnapshot(groupId);

  socket.emit("group:connected", {
    groupId,
    socketId: socket.id,
    userId: socket.data.auth.userId,
  });
  socket.emit("group:presence", {
    groupId,
    participants: snapshot,
  });
  socket.to(groupChannel).emit("group:presence", {
    groupId,
    participants: snapshot,
  });

  socket.on("disconnect", () => {
    removeGroupParticipant(groupId, socket.id);
    emitGroupPresence(groupId);
  });
}

export function attachStudyGroupSocketServer(server: HttpServer) {
  if (io) {
    return io;
  }

  io = new SocketIOServer(server, {
    path: "/api/study-group/socket/io",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  const namespace = io.of("/study-groups");

  namespace.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : null;
    if (!token) {
      next(new Error("Missing study group socket token."));
      return;
    }

    const auth = readStudyGroupSocketToken(token);
    if (!auth) {
      next(new Error("Study group socket token is invalid or expired."));
      return;
    }

    socket.data.auth = auth;
    next();
  });

  namespace.on("connection", (socket) => {
    bindStudyGroupSocket(socket as StudyGroupSocket);
  });

  return io;
}

export function emitStudyGroupSocketEvent(groupId: string, event: string, payload: unknown) {
  getGroupNamespace()?.to(getGroupChannel(groupId)).emit(event, payload);
}
