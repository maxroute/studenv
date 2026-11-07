import { RanganLanding } from "@/components/learning/RanganLanding";
import { requireAuth } from "@/lib/auth/session";
import * as learningService from "@/lib/services/learning.service";

export const dynamic = "force-dynamic";

export default async function RanganPage() {
  const user = await requireAuth();
  const courses = await learningService.listRanganContexts(user.id);
  return <RanganLanding courses={courses} />;
}
