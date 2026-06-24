import { StudentDashboardLayout } from "@/components/dashboard/StudentDashboardLayout";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentDashboardLayout>{children}</StudentDashboardLayout>;
}
