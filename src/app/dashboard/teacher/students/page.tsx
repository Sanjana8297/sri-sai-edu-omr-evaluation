import { getTeacherStudentsServer } from "@/lib/server/dashboard-data";
import { TeacherStudentsClient } from "./teacher-students-client";

export default async function TeacherStudentsPage() {
  const initialData = await getTeacherStudentsServer();
  return <TeacherStudentsClient initialData={initialData ?? undefined} />;
}
