import { getTeacherQuestionPapersServer } from "@/lib/server/dashboard-data";
import { TeacherAllQuestionPapersClient } from "./teacher-all-question-papers-client";

export default async function TeacherAllQuestionPapersPage() {
  const initialData = await getTeacherQuestionPapersServer();
  return <TeacherAllQuestionPapersClient initialData={initialData ?? undefined} />;
}
