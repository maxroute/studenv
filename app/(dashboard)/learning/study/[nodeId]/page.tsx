import { notFound } from "next/navigation";
import { FocusStudio } from "@/components/learning/FocusStudio";
import { requireAuth } from "@/lib/auth/session";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export default async function FocusStudioPage({ params }: { params: { nodeId: string } }) {
  const user = await requireAuth();
  try {
    const node = await learningService.getStudyNode(user.id, params.nodeId);
    return <FocusStudio key={node.id} node={{ ...node, items: node.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) }} />;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();
    throw error;
  }
}
