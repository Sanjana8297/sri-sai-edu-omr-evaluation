import { getStudentExamsHistoryServer } from "@/lib/server/dashboard-data";
import { StudentPerformanceSummaryClient } from "./student-performance-summary-client";

export default async function StudentDashboardPage() {
  const initialData = await getStudentExamsHistoryServer();
  return <StudentPerformanceSummaryClient initialData={initialData ?? undefined} />;
}
