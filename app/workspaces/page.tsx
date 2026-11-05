import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth.config";
import * as workspaceService from "@/lib/services/workspace.service";

export default async function WorkspaceIndexPage() {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  
  const latestWorkspace = await prisma.workspace.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  if (latestWorkspace) {
    redirect(`/workspaces/${latestWorkspace.id}`);
  }

  // If no workspaces, create a default one
  const newWorkspace = await workspaceService.createWorkspace({
    ownerId: session.user.id,
    title: "My First Workspace",
  });

  redirect(`/workspaces/${newWorkspace.id}`);
}
