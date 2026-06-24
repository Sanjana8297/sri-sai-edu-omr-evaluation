import { AdminDashboardLayout } from "@/components/dashboard/AdminDashboardLayout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminDashboardLayout>{children}</AdminDashboardLayout>;
}
