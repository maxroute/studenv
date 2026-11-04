import { prisma } from "@/lib/db/prisma";
import type { SignupInput, UpdateProfileInput } from "@/lib/models/user.model";

const publicUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
  name: true,
  username: true,
  bio: true,
  avatarUrl: true,
  plan: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function findByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: publicUserSelect,
  });
}

export async function findByEmailForAuth(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      ...publicUserSelect,
      passwordHash: true,
      loginAttempts: true,
      lockedUntil: true,
      emailVerifyToken: true,
    },
  });
}

export async function findById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  });
}

export async function create(input: SignupInput & { passwordHash: string; username: string; emailVerified?: Date | null }) {
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: `${input.firstName} ${input.lastName}`,
      username: input.username,
      passwordHash: input.passwordHash,
      emailVerified: input.emailVerified,
    },
    select: publicUserSelect,
  });
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      username: input.username,
      bio: input.bio,
      email: input.email.toLowerCase(),
      avatarUrl: input.avatarUrl,
    },
    select: publicUserSelect,
  });
}

export async function updateAvatarUrl(userId: string, avatarUrl: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      avatarUrl,
    },
    select: publicUserSelect,
  });
}

export async function updateUsername(userId: string, username: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      username,
    },
    select: publicUserSelect,
  });
}

export async function updatePasswordHash(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
    select: publicUserSelect,
  });
}

export async function storeVerificationToken(userId: string, hashedToken: string, expiresAt: Date) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: hashedToken,
      emailVerifyExpiry: expiresAt,
    },
  });
}

export async function storePasswordResetToken(
  userId: string,
  hashedToken: string,
  expiresAt: Date,
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpiry: expiresAt,
    },
  });
}

export async function findByPasswordResetToken(hashedToken: string) {
  return prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpiry: {
        gt: new Date(),
      },
    },
    select: {
      ...publicUserSelect,
      passwordHash: true,
    },
  });
}

export async function findByEmailVerifyToken(hashedToken: string) {
  return prisma.user.findFirst({
    where: { emailVerifyToken: hashedToken, emailVerifyExpiry: { gt: new Date() } },
    select: publicUserSelect,
  });
}

export async function markEmailVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: new Date(),
      emailVerifyToken: null,
      emailVerifyExpiry: null,
    },
    select: publicUserSelect,
  });
}

export async function updateLoginState(
  userId: string,
  input: {
    loginAttempts?: number;
    lockedUntil?: Date | null;
    lastLoginAt?: Date;
    lastLoginIp?: string | null;
  },
) {
  return prisma.user.update({
    where: { id: userId },
    data: input,
  });
}

export async function findByUsername(username: string, exceptUserId?: string) {
  return prisma.user.findFirst({
    where: {
      username,
      id: exceptUserId ? { not: exceptUserId } : undefined,
    },
    select: { id: true },
  });
}
