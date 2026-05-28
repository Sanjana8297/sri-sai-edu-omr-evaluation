import { redirect } from "next/navigation";

export default function AdminStudentsRedirectPage() {
  redirect("/dashboard/admin/user-management?section=profiles");
}
