import { randomUUID } from "node:crypto";

type StudyGroupSocketTokenRecord = {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
  expiresAt: number;
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const socketTokens = new Map<string, StudyGroupSocketTokenRecord>();

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, value] of socketTokens.entries()) {
    if (value.expiresAt <= now) {
      socketTokens.delete(token);
    }
  }
}

export function issueStudyGroupSocketToken(input: {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
}) {
  cleanupExpiredTokens();
  const token = randomUUID();
  socketTokens.set(token, {
    ...input,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return token;
}

export function readStudyGroupSocketToken(token: string) {
  cleanupExpiredTokens();
  const record = socketTokens.get(token);
  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    socketTokens.delete(token);
    return null;
  }

  return record;
}
