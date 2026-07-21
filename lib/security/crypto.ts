import argon2 from "argon2";
import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$Q29kZXhTZWNvbmRCcmFpbg$zQ+RZ9M/3U1oA/vfxv+z9kx6w0PXkP4nEr0l3L2rz9Y";

function getSecret(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`${key} is not configured.`);
  }

  return encoder.encode(value);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(password: string, passwordHash?: string | null) {
  const hash = passwordHash ?? DUMMY_HASH;
  return argon2.verify(hash, password);
}

export async function createAccessToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret(process.env.JWT_SECRET, "JWT_SECRET"));
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(
    token,
    getSecret(process.env.JWT_SECRET, "JWT_SECRET"),
  );

  return payload;
}

export async function createRefreshToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret(process.env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET"));
}

export async function verifyRefreshToken(token: string) {
  const { payload } = await jwtVerify(
    token,
    getSecret(process.env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET"),
  );

  return payload;
}

export function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateResetToken() {
  const raw = generateSecureToken(32);

  return {
    raw,
    hashed: hashToken(raw),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}
