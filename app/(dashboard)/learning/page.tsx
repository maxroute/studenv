import { CourseLibrary } from "@/components/learning/CourseLibrary";
import { requireAuth } from "@/lib/auth/session";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const user = await requireAuth();
  const courses = await learningService.listCourses(user.id);
  return <CourseLibrary courses={courses} />;
}
