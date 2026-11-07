import { notFound } from "next/navigation";
import { CourseDetail, type CourseTreeNode } from "@/components/learning/CourseDetail";
import { requireAuth } from "@/lib/auth/session";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export default async function LearningCoursePage({ params }: { params: { courseId: string } }) {
  const user = await requireAuth();
  try {
    const course = await learningService.getCourse(user.id, params.courseId);
    return <CourseDetail course={{ ...course, nodes: course.nodes.map((node) => serializeNode(node as unknown as RawCourseNode)) }} />;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) notFound();
    throw error;
  }
}

type RawCourseNode = Omit<CourseTreeNode, "items" | "children"> & {
  items: Array<Omit<CourseTreeNode["items"][number], "createdAt"> & { createdAt: Date }>;
  children: RawCourseNode[];
};

function serializeNode(node: RawCourseNode): CourseTreeNode {
  return {
    ...node,
    items: node.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
    children: node.children.map(serializeNode),
  };
}
