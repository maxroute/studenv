import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import argon2 from "argon2";
import { z } from "zod";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const parsed = passwordSchema.safeParse(body);

    if (!parsed.success) {
      return new NextResponse(parsed.error.errors[0]?.message || "Invalid input", { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return new NextResponse("Account does not have a password set", { status: 400 });
    }

    const isCorrectPassword = await argon2.verify(user.passwordHash, currentPassword);
    if (!isCorrectPassword) {
      return new NextResponse("Incorrect current password", { status: 400 });
    }

    const newPasswordHash = await argon2.hash(newPassword);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash: newPasswordHash },
    });

    return new NextResponse("Password updated successfully", { status: 200 });
  } catch (error) {
    console.error("[PASSWORD_PATCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
