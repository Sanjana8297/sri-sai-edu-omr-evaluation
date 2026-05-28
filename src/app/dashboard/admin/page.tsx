import { redirect } from "next/navigation";

export default function AdminDashboardPage() {
  redirect("/dashboard/admin/user-management?section=profiles");
}
