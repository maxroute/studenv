import { prisma } from "@/lib/db/prisma";

const itemSummary = {
  id: true,
  type: true,
  title: true,
  url: true,
  excerpt: true,
  notes: true,
  createdAt: true,
} as const;

export async function listCourses(userId: string) {
  return prisma.course.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    include: { _count: { select: { nodes: true } } },
  });
}

export async function getCourse(userId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId },
    include: {
      nodes: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { items: { select: itemSummary, orderBy: { createdAt: "desc" } } },
      },
    },
  });

  if (!course) return null;

  const nodeMap = new Map(
    course.nodes.map((node) => [node.id, { ...node, children: [] as typeof node[] }]),
  );
  const roots: Array<(typeof nodeMap extends Map<string, infer T> ? T : never)> = [];

  for (const node of course.nodes) {
    const current = nodeMap.get(node.id)!;
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(current as (typeof parent.children)[number]);
    } else {
      roots.push(current);
    }
  }

  const { nodes: _nodes, ...courseFields } = course;
  return { ...courseFields, nodes: roots };
}

export async function findOwnedCourse(userId: string, courseId: string) {
  return prisma.course.findFirst({ where: { id: courseId, userId } });
}

export async function findOwnedNode(userId: string, nodeId: string) {
  return prisma.courseNode.findFirst({
    where: { id: nodeId, course: { userId } },
    include: {
      course: { select: { id: true, title: true, providerName: true, courseUrl: true } },
      items: { select: itemSummary, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function findNodeInCourse(courseId: string, nodeId: string) {
  return prisma.courseNode.findFirst({ where: { id: nodeId, courseId } });
}

export async function listCourseNodes(courseId: string) {
  return prisma.courseNode.findMany({
    where: { courseId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}
