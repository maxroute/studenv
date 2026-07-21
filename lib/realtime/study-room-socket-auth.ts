import { createHmac, timingSafeEqual } from "node:crypto";

type StudyRoomSocketTokenRecord = {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
  expiresAt: number;
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSocketTokenSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    process.env.AUTH_SECRET ||
    "second-brain-dev-study-room-socket-secret"
  );
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signPayload(payload: string) {
  return toBase64Url(
    createHmac("sha256", getSocketTokenSecret()).update(payload).digest(),
  );
}

export function issueStudyRoomSocketToken(input: {
  groupId: string;
  userId: string;
  name: string | null;
  username: string | null;
}) {
  const payload = toBase64Url(JSON.stringify({
    ...input,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  } satisfies StudyRoomSocketTokenRecord));

  return `${payload}.${signPayload(payload)}`;
}

export function readStudyRoomSocketToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const record = JSON.parse(fromBase64Url(payload)) as StudyRoomSocketTokenRecord;
    if (record.expiresAt <= Date.now()) {
      return null;
    }

    if (!record.groupId || !record.userId) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}
