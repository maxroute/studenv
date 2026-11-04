import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { loginSchema } from "@/lib/models/user.model";
import * as authService from "@/lib/services/auth.service";
import { toLocalAppUrl } from "@/lib/auth/local-redirect";

const authSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== "production"
    ? "second-brain-dev-secret-change-before-production"
    : undefined);

const useSecureCookies =
  process.env.NODE_ENV === "production" &&
  !process.env.NEXTAUTH_URL?.startsWith("http://127.0.0.1") &&
  !process.env.NEXTAUTH_URL?.startsWith("http://localhost") &&
  !process.env.NEXT_PUBLIC_APP_URL?.startsWith("http://127.0.0.1") &&
  !process.env.NEXT_PUBLIC_APP_URL?.startsWith("http://localhost");

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username?: string | null;
      bio?: string | null;
      avatarUrl?: string | null;
      plan?: "free" | "pro" | "team";
      isEmailVerified?: boolean;
    };
  }

  interface User {
    username?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    plan?: "free" | "pro" | "team";
    isEmailVerified?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    plan?: "free" | "pro" | "team";
    isEmailVerified?: boolean;
  }
}

class EmailNotVerifiedError extends CredentialsSignin {
  code = "email-not-verified";
}

class AccountTemporarilyLockedError extends CredentialsSignin {
  code = "account-temporarily-locked";
}

const providers: Provider[] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const parsed = loginSchema.safeParse({
        email: credentials?.email,
        password: credentials?.password,
      });

      if (!parsed.success) {
        return null;
      }

      const forwardedFor =
        request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
      const userAgent = request?.headers?.get("user-agent") ?? null;

      try {
        const user = await authService.login(parsed.data, {
          ip: forwardedFor,
          userAgent,
        });

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
          isEmailVerified: user.emailVerified,
        };
      } catch (error) {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 0;

        if (status === 403) {
          throw new EmailNotVerifiedError();
        }

        if (status === 429) {
          throw new AccountTemporarilyLockedError();
        }

        if (status !== 401) {
          console.error("[authorize] login failed:", error);
        }

        return null;
      }
    },
  }),
];

const { handlers, auth: originalAuth, signIn, signOut } = NextAuth({
  debug: false,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
  pages: {
    error: "/auth/signin",
    signIn: "/auth/signin",
  },
  providers,
  trustHost: true,
  callbacks: {
    async redirect({ url, baseUrl }) {
      return toLocalAppUrl(url, baseUrl);
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.username = user.username;
        token.bio = user.bio;
        token.avatarUrl = user.avatarUrl ?? user.image ?? null;
        token.plan = user.plan;
        token.isEmailVerified = Boolean(user.isEmailVerified);
      }

      if (trigger === "update" && session?.user) {
        // Session updates originate in the browser. Only accept profile fields;
        // identity and authorization claims must remain server-controlled.
        const profile = session.user as {
          name?: unknown;
          username?: unknown;
          bio?: unknown;
          avatarUrl?: unknown;
        };

        if (typeof profile.name === "string") {
          token.name = profile.name;
        }

        if (typeof profile.username === "string" || profile.username === null) {
          token.username = profile.username;
        }

        if (typeof profile.bio === "string" || profile.bio === null) {
          token.bio = profile.bio;
        }

        if (
          typeof profile.avatarUrl === "string" ||
          profile.avatarUrl === null
        ) {
          token.avatarUrl = profile.avatarUrl;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? (token.sub as string) ?? "";
        session.user.username = token.username as string | null;
        session.user.bio = token.bio as string | null;
        session.user.avatarUrl = token.avatarUrl as string | null;
        session.user.plan = (token.plan as any) ?? "free";
        session.user.isEmailVerified = token.isEmailVerified as boolean;
      }

      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  secret: authSecret,
});

export const auth = originalAuth;

export { handlers, signIn, signOut };
