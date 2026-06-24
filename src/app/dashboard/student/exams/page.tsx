import { getStudentExamsAvailableServer } from "@/lib/server/dashboard-data";
import { StudentExamsClient } from "./student-exams-client";

export default async function StudentExamsPage() {
  const initialData = await getStudentExamsAvailableServer();
  return <StudentExamsClient initialData={initialData ?? undefined} />;
}
