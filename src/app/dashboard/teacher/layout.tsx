import { TeacherDashboardLayout } from "@/components/dashboard/TeacherDashboardLayout";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherDashboardLayout>{children}</TeacherDashboardLayout>;
}
