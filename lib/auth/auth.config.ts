import type { Adapter, AdapterUser } from "@auth/core/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { loginSchema } from "@/lib/models/user.model";
import { prisma } from "@/lib/db/prisma";
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

function toAdapterUser(
  user: {
    id: string;
    email: string;
    emailVerified: Date | null;
    name: string | null;
    username?: string | null;
    avatarUrl: string | null;
  },
) {
  return {
    ...user,
    image: user.avatarUrl,
  } as AdapterUser & { avatarUrl?: string | null };
}

const prismaAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...prismaAdapter,
  async createUser(data) {
    const { image, ...rest } = data;
    const username = await authService.generateUniqueUsername(rest.name, rest.email);
    const user = await prisma.user.create({
      data: {
        ...rest,
        username,
        avatarUrl: image ?? null,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        username: true,
        avatarUrl: true,
      },
    });

    return toAdapterUser(user);
  },
  async getUser(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        username: true,
        avatarUrl: true,
      },
    });

    return user ? toAdapterUser(user) : null;
  },
  async getUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        username: true,
        avatarUrl: true,
      },
    });

    return user ? toAdapterUser(user) : null;
  },
  async getUserByAccount(providerAccountId) {
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: providerAccountId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    return account?.user ? toAdapterUser(account.user) : null;
  },
  async updateUser(data) {
    const { id, image, ...rest } = data;
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(image !== undefined ? { avatarUrl: image } : {}),
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        name: true,
        username: true,
        avatarUrl: true,
      },
    });

    return toAdapterUser(user);
  },
  async getSessionAndUser(sessionToken) {
    const userAndSession = await prisma.session.findUnique({
      where: { sessionToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!userAndSession) {
      return null;
    }

    const { user, ...session } = userAndSession;
    return {
      session,
      user: toAdapterUser(user),
    };
  },
};

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
        console.error("[authorize] login failed:", error);
        return null;
      }
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

const { handlers, auth: originalAuth, signIn, signOut } = NextAuth({
  adapter,
  debug: false,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
  pages: {
    error: "/auth/login",
    signIn: "/auth/login",
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

      if (trigger === "update" && session) {
        return { ...token, ...session.user };
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
