import {
  forgotPasswordSchema,
  type LoginInput,
  type SignupInput,
  type UpdateProfileInput,
} from "@/lib/models/user.model";
import { auditLog } from "@/lib/repositories/base.repository";
import * as userRepository from "@/lib/repositories/user.repository";
import {
  generateResetToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/security/crypto";
import {
  isAccountLocked,
  resetLoginAttempts,
  trackLoginAttempt,
} from "@/lib/security/rateLimit";
import {
  sanitizeAvatarUrl,
  sanitizeProfileInput,
  sanitizeTagName,
} from "@/lib/security/sanitize";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/services/email.service";

function normalizeUsernameValue(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  try {
    const normalized = sanitizeTagName(input).slice(0, 30).replace(/-+$/g, "");
    return normalized || null;
  } catch {
    return null;
  }
}

function buildUsernameBase(name?: string | null, email?: string | null) {
  const emailPrefix = email?.split("@")[0] ?? null;

  for (const candidate of [name, emailPrefix]) {
    const normalized = normalizeUsernameValue(candidate);

    if (normalized && normalized.length >= 3) {
      return normalized;
    }

    if (normalized) {
      const expanded = normalizeUsernameValue(`${normalized}-user`);

      if (expanded && expanded.length >= 3) {
        return expanded;
      }
    }
  }

  return "user";
}

function applyUsernameSuffix(base: string, suffix: number) {
  const suffixText = `-${suffix}`;
  const trimmedBase =
    base.slice(0, Math.max(1, 30 - suffixText.length)).replace(/-+$/g, "") || "user";

  return `${trimmedBase}${suffixText}`;
}

export async function generateUniqueUsername(
  name?: string | null,
  email?: string | null,
  exceptUserId?: string,
) {
  const base = buildUsernameBase(name, email);
  let candidate = base;
  let suffix = 1;

  while (await userRepository.findByUsername(candidate, exceptUserId)) {
    candidate = applyUsernameSuffix(base, suffix);
    suffix += 1;
  }

  return candidate;
}

export async function ensureUserUsername(
  userId: string,
  profile: { name?: string | null; email?: string | null; username?: string | null },
) {
  if (profile.username) {
    return profile.username;
  }

  const username = await generateUniqueUsername(profile.name, profile.email, userId);
  await userRepository.updateUsername(userId, username);
  return username;
}

function publicAuthResponse(user: Awaited<ReturnType<typeof userRepository.findByEmail>>) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    plan: user.plan,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function signup(
  input: SignupInput,
  context?: { ip?: string | null; userAgent?: string | null },
  appUrl?: string,
) {
  const existing = await userRepository.findByEmail(input.email);

  if (existing) {
    // Never replace an existing account's password or profile during signup.
    // A verified account should go straight to sign-in, not email verification.
    if (existing.emailVerified) {
      return { outcome: "existing_verified" as const };
    }

    // Existing unverified accounts stay on the verification flow.
    try {
      await resendVerificationEmailForUser(existing, appUrl);
    } catch (deliveryError) {
      console.error("Could not resend verification during duplicate signup:", deliveryError);
    }

    return { outcome: "verification_required" as const };
  }

  const username = await generateUniqueUsername(
    `${input.firstName} ${input.lastName}`,
    input.email,
  );
  const passwordHash = await hashPassword(input.password);
  const user = await userRepository.create({ 
    ...input, 
    passwordHash, 
    username,
    emailVerified: null 
  });
  const verificationToken = generateResetToken();

  await userRepository.storeVerificationToken(
    user.id,
    verificationToken.hashed,
    verificationToken.expiresAt,
  );
  await sendVerificationEmail(user.email, verificationToken.raw, appUrl).catch(async (err) => {
    // Keep the public signup response identical if SMTP delivery fails.
    // The user can safely request another link from the confirmation page.
    await userRepository.clearVerificationSentAt(user.id, verificationToken.hashed);
    console.error("Failed to send verification email:", err);
  });
  await auditLog({
    userId: user.id,
    action: "SIGNUP",
    resource: "user",
    resourceId: user.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return { outcome: "created" as const };
}

export async function login(
  input: LoginInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const user = await userRepository.findByEmailForAuth(input.email);
  const userId = user?.id ?? `anon:${input.email.toLowerCase()}`;
  const valid = await verifyPassword(input.password, user?.passwordHash);

  if (!user || !valid) {
    const result = await trackLoginAttempt(userId, context?.ip ?? "unknown", false);

    if (user) {
      await userRepository.updateLoginState(user.id, {
        loginAttempts: result.count,
        lockedUntil: result.lockedUntil,
      });
    }

    const error = new Error("Invalid email or password.");
    Object.assign(error, { status: 401 });
    throw error;
  }

  // Only reveal lock status after the password is correct. This avoids
  // exposing account state to someone who only knows an email address.
  const locked =
    (user.lockedUntil && user.lockedUntil > new Date()) ||
    (context?.ip ? await isAccountLocked(userId, context.ip) : false);

  if (locked) {
    const error = new Error("Too many unsuccessful sign-in attempts. Please try again later.");
    Object.assign(error, { status: 429 });
    throw error;
  }

  if (!user.emailVerified) {
    const error = new Error("Please verify your email before signing in.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  await resetLoginAttempts(user.id, context?.ip ?? "unknown");
  await userRepository.updateLoginState(user.id, {
    loginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    lastLoginIp: context?.ip ?? null,
  });
  await auditLog({
    userId: user.id,
    action: "LOGIN",
    resource: "user",
    resourceId: user.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  const username = await ensureUserUsername(user.id, user);

  return publicAuthResponse({
    ...user,
    username,
  });
}

export async function requestPasswordReset(
  email: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  forgotPasswordSchema.parse({ email });

  const user = await userRepository.findByEmail(email);

  if (user) {
    const resetToken = generateResetToken();
    await userRepository.storePasswordResetToken(
      user.id,
      resetToken.hashed,
      resetToken.expiresAt,
    );
    try {
      await sendPasswordResetEmail(user.email, resetToken.raw);
    } catch (err) {
      console.error("Failed to send password reset email:", err);
    }
    await auditLog({
      userId: user.id,
      action: "REQUEST_PASSWORD_RESET",
      resource: "user",
      resourceId: user.id,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
    });
  }

  return {
    message: "If an account exists, password reset instructions have been sent.",
  };
}

export async function resetPassword(
  rawToken: string,
  password: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const hashedToken = hashToken(rawToken);
  const user = await userRepository.findByPasswordResetToken(hashedToken);

  if (!user) {
    const error = new Error("Reset token is invalid or expired.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const updated = await userRepository.updatePasswordHash(user.id, passwordHash);

  await auditLog({
    userId: user.id,
    action: "RESET_PASSWORD",
    resource: "user",
    resourceId: user.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return updated;
}

const genericVerificationResponse = {
  message: "If your account needs verification, a link will be sent. If you requested one recently, wait a minute before trying again.",
};

type VerificationUser = NonNullable<
  Awaited<ReturnType<typeof userRepository.findByEmail>>
>;

async function resendVerificationEmailForUser(
  user: VerificationUser | null,
  appUrl?: string,
) {
  // Keep the response generic so callers cannot discover registered addresses.
  if (!user || user.emailVerified) {
    return genericVerificationResponse;
  }

  const now = new Date();
  const cooldownMs = 60 * 1000;
  const lastSentAt = user.emailVerifySentAt;

  if (lastSentAt && now.getTime() - lastSentAt.getTime() < cooldownMs) {
    return genericVerificationResponse;
  }

  const verificationToken = generateResetToken();
  const claimed = await userRepository.claimVerificationResend(
    user.id,
    verificationToken.hashed,
    verificationToken.expiresAt,
    now,
    new Date(now.getTime() - cooldownMs),
  );

  if (claimed.count === 0) {
    return genericVerificationResponse;
  }

  try {
    await sendVerificationEmail(user.email, verificationToken.raw, appUrl);
  } catch (deliveryError) {
    await userRepository.clearVerificationSentAt(user.id, verificationToken.hashed);
    console.error("Failed to resend verification email:", deliveryError);
    const error = new Error("We couldn't send the verification email. Please try again shortly.");
    Object.assign(error, { status: 503 });
    throw error;
  }

  return genericVerificationResponse;
}

export async function resendVerificationEmail(email: string, appUrl?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userRepository.findByEmail(normalizedEmail);
  return resendVerificationEmailForUser(user, appUrl);
}

export async function verifyEmail(
  rawToken: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const hashedToken = hashToken(rawToken);
  const user = await userRepository.findByEmailVerifyToken(hashedToken);

  if (!user) {
    const error = new Error("Verification token is invalid or expired.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  const verified = await userRepository.markEmailVerified(user.id);
  await auditLog({
    userId: user.id,
    action: "VERIFY_EMAIL",
    resource: "user",
    resourceId: user.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return verified;
}

export async function getProfile(userId: string) {
  const user = await userRepository.findById(userId);

  if (!user) {
    const error = new Error("User not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  const username = await ensureUserUsername(user.id, user);

  return {
    ...user,
    username,
  };
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  context?: { ip?: string | null; userAgent?: string | null },
  appUrl?: string,
) {
  const sanitized = sanitizeProfileInput(input);
  const conflict = await userRepository.findByUsername(
    sanitized.username ?? "",
    userId,
  );

  if (conflict) {
    const error = new Error("Username is already taken.");
    Object.assign(error, { status: 409 });
    throw error;
  }

  const currentUser = await userRepository.findById(userId);
  if (!currentUser) {
    const error = new Error("User not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  const emailChanged = currentUser.email.toLowerCase() !== input.email.toLowerCase();
  const verificationToken = emailChanged ? generateResetToken() : null;
  const sentAt = new Date();

  const user = await userRepository.updateProfile(
    userId,
    {
      ...input,
      name: sanitized.name ?? input.name,
      username: sanitized.username ?? input.username,
      bio: sanitized.bio,
      avatarUrl: sanitized.avatarUrl,
      email: input.email.toLowerCase(),
    },
    verificationToken
      ? {
          hashedToken: verificationToken.hashed,
          expiresAt: verificationToken.expiresAt,
          sentAt,
        }
      : undefined,
  );

  if (verificationToken) {
    try {
      await sendVerificationEmail(user.email, verificationToken.raw, appUrl);
    } catch (deliveryError) {
      await userRepository.clearVerificationSentAt(userId, verificationToken.hashed);
      console.error("Failed to send email-change verification:", deliveryError);
      const error = new Error("Your email was changed, but the verification email could not be sent. Use Resend verification email in Account settings.");
      Object.assign(error, { status: 503 });
      throw error;
    }
  }

  await auditLog({
    userId,
    action: "UPDATE_PROFILE",
    resource: "user",
    resourceId: userId,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return user;
}

export async function updateAvatar(
  userId: string,
  avatarUrl: string | null,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const sanitizedAvatarUrl = sanitizeAvatarUrl(avatarUrl);
  const user = await userRepository.updateAvatarUrl(userId, sanitizedAvatarUrl);

  await auditLog({
    userId,
    action: "UPDATE_PROFILE",
    resource: "user",
    resourceId: userId,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const user = await userRepository.findById(userId);
  const authUser = user ? await userRepository.findByEmailForAuth(user.email) : null;

  if (!authUser) {
    const error = new Error("User not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  const valid = await verifyPassword(currentPassword, authUser.passwordHash);

  if (!valid) {
    const error = new Error("Current password is incorrect.");
    Object.assign(error, { status: 401 });
    throw error;
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await userRepository.updatePasswordHash(userId, passwordHash);

  await auditLog({
    userId,
    action: "CHANGE_PASSWORD",
    resource: "user",
    resourceId: userId,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return updated;
}
