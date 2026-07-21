import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/services/email.service";

const settingsSchema = z.object({
  name: z.string().min(2).max(50).optional().nullable(),
  username: z.string().min(3).max(30).optional().nullable(),
  bio: z.string().max(160).optional().nullable(),
  email: z.string().email().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        email: true,
        plan: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return new NextResponse("User not found", { status: 404 });
    }

    const { passwordHash, ...safeUser } = user;
    return NextResponse.json({ ...safeUser, hasPassword: !!passwordHash });
  } catch (error) {
    console.error("[SETTINGS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return new NextResponse("Invalid request data", { status: 400 });
    }

    const { name, username, bio, email } = parsed.data;

    // Check if username is taken by someone else
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id: session.user.id },
        },
      });

      if (existingUser) {
        return new NextResponse("Username is already taken", { status: 400 });
      }
    }

    // Handle Email Change
    let emailUpdateData: any = {};
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: session.user.id },
        },
      });

      if (existingEmail) {
        return new NextResponse("Email is already in use", { status: 400 });
      }

      const currentUser = await prisma.user.findUnique({ where: { id: session.user.id }});
      if (currentUser && currentUser.email !== email) {
        const token = crypto.randomBytes(32).toString("hex");
        emailUpdateData = {
          email,
          emailVerified: null,
          emailVerifyToken: token,
        };
        // Send verification email asynchronously
        sendVerificationEmail(email, token).catch(console.error);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        username,
        bio,
        ...emailUpdateData,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("[SETTINGS_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Delete user from the database. Prisma cascade handles relations.
    await prisma.user.delete({
      where: { id: session.user.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[SETTINGS_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
