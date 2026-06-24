import { getStudentExamsHistoryServer } from "@/lib/server/dashboard-data";
import { StudentExamHistoryClient } from "./student-exam-history-client";

export default async function StudentExamHistoryPage() {
  const initialData = await getStudentExamsHistoryServer();
  return <StudentExamHistoryClient initialData={initialData ?? undefined} />;
}
